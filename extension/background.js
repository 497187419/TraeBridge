/**
 * WebBridge Background Service Worker (MV3)
 *
 * - WebSocket client -> ws://127.0.0.1:8765 with auto-reconnect
 *   (exponential backoff 1s -> 2s -> 4s -> ... capped at 30s)
 * - JSON-RPC 2.0 message routing to tool executors
 * - All page interaction via chrome.debugger (CDP)
 *
 * NOTE: MV3 Service Worker environment - no window/document access.
 */

'use strict';

/* ============================================================================
 * Constants
 * ========================================================================== */

const DEFAULT_WS_URL = 'ws://127.0.0.1:8765';
const KEEPALIVE_ALARM_NAME = 'webbridge-keepalive';
const KEEPALIVE_ALARM_PERIOD_MINUTES = 0.5; // every 30 seconds
const RECONNECT_MIN_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const CONNECT_TIMEOUT_MS = 10000;

const STORAGE_KEYS = {
  SHOULD_CONNECT: 'ws_should_connect',
  WS_URL: 'ws_url',
  STATE: 'connection_state',
};

/* ============================================================================
 * Global state
 * ========================================================================== */

let wsSocket = null;
let wsState = 'disconnected'; // disconnected | connecting | connected | reconnecting
let wsUrl = DEFAULT_WS_URL;
let reconnectAttempts = 0;
let reconnectTimer = null;
let connectTimeoutTimer = null;

/* ============================================================================
 * Debugger session helpers
 * ========================================================================== */

const attachedTabs = new Set();   // tabIds currently attached
let currentTabId = null;          // tab the tools are operating on

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (currentTabId === tabId) currentTabId = null;
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    if (currentTabId === source.tabId) currentTabId = null;
  }
});

/**
 * Attach the debugger to a tab (idempotent).
 */
async function attachTab(tabId) {
  if (attachedTabs.has(tabId)) {
    currentTabId = tabId;
    return;
  }
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) { /* not attached — ignore */ }
  await chrome.debugger.attach({ tabId }, '1.3');
  attachedTabs.add(tabId);
  currentTabId = tabId;
}

/**
 * Detach the debugger from a tab.
 */
async function detachTab(tabId) {
  if (!attachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) { /* already detached */ }
  attachedTabs.delete(tabId);
  if (currentTabId === tabId) currentTabId = null;
}

/**
 * Send a CDP command to the currently attached tab.
 */
async function sendCdp(method, params) {
  if (currentTabId === null) {
    throw new Error('No tab attached. Call a tool that attaches a tab first.');
  }
  return await chrome.debugger.sendCommand({ tabId: currentTabId }, method, params);
}

/**
 * Resolve the tab that tools should operate on:
 * currentTabId if still alive, otherwise the active tab of the current window.
 */
async function resolveTab() {
  if (currentTabId !== null) {
    try {
      return await chrome.tabs.get(currentTabId);
    } catch (_) {
      attachedTabs.delete(currentTabId);
      currentTabId = null;
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    throw new Error('No active tab found.');
  }
  currentTabId = tab.id;
  return tab;
}

/* ============================================================================
 * @eN reference registry (populated by snapshot)
 * ========================================================================== */

const refRegistry = new Map(); // "e1" -> { backendDOMNodeId, role, name }
let refCounter = 1;

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
  'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
]);

function resetRefs() {
  refRegistry.clear();
  refCounter = 1;
}

function registerRef(backendDOMNodeId, role, name) {
  const ref = 'e' + (refCounter++);
  refRegistry.set(ref, { backendDOMNodeId, role, name: name || '' });
  return ref;
}

function lookupRef(ref) {
  const key = ref.startsWith('@') ? ref.slice(1) : ref;
  return refRegistry.get(key);
}

function isRef(str) {
  return /^@?e\d+$/.test(str);
}

/**
 * Resolve an @eN ref to a CDP remote object id.
 */
async function objectIdFromRef(ref) {
  const entry = lookupRef(ref);
  if (!entry) {
    throw new Error(`Unknown ref "${ref}". Run snapshot first to get refs.`);
  }
  const { object } = await sendCdp('DOM.resolveNode', { backendNodeId: entry.backendDOMNodeId });
  if (!object || !object.objectId) {
    throw new Error(`Could not resolve ref "${ref}" to a DOM element.`);
  }
  return object.objectId;
}

/**
 * Resolve a CSS selector to a CDP remote object id.
 */
async function objectIdFromSelector(selector) {
  const res = await sendCdp('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
    returnByValue: false,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || 'evaluate failed');
  }
  if (res.result.subtype === 'null' || !res.result.objectId) {
    throw new Error(`Element not found: ${selector}`);
  }
  return res.result.objectId;
}

async function resolveObjectId(selectorOrRef) {
  return isRef(selectorOrRef) ? objectIdFromRef(selectorOrRef) : objectIdFromSelector(selectorOrRef);
}

/* ============================================================================
 * Network capture state
 * ========================================================================== */

const networkCaptureTabs = new Set();       // tabIds with capture active
const networkRequests = new Map();          // tabId -> Map(requestId -> entry)
const networkCaptureIds = new Map();        // tabId -> captureId
let networkCaptureCounter = 1;
let networkListenerAdded = false;

function requestsForTab(tabId) {
  let m = networkRequests.get(tabId);
  if (!m) {
    m = new Map();
    networkRequests.set(tabId, m);
  }
  return m;
}

function ensureNetworkListener() {
  if (networkListenerAdded) return;
  networkListenerAdded = true;
  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId || !networkCaptureTabs.has(tabId)) return;
    const store = requestsForTab(tabId);
    if (method === 'Network.requestWillBeSent') {
      store.set(params.requestId, {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        timestamp: params.timestamp,
      });
    } else if (method === 'Network.responseReceived') {
      const entry = store.get(params.requestId);
      if (entry) {
        entry.status = params.response.status;
        entry.mimeType = params.response.mimeType;
      }
    } else if (method === 'Network.loadingFinished') {
      const entry = store.get(params.requestId);
      if (entry) entry.completed = true;
    }
  });
}

/* ============================================================================
 * Tool executors
 * ========================================================================== */

const FILL_HELPER_SRC = `
  const __target = TARGET;
  __target.focus();
  if (__target.isContentEditable) {
    const __sel = window.getSelection();
    if (__sel) {
      const __range = document.createRange();
      __range.selectNodeContents(__target);
      __sel.removeAllRanges();
      __sel.addRange(__range);
    }
    let __inserted = false;
    try { __inserted = document.execCommand('insertText', false, VALUE); } catch (_e) { __inserted = false; }
    if (!__inserted) {
      __target.textContent = VALUE;
      __target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: VALUE, bubbles: true }));
    }
    return { success: true, tag: __target.tagName, mode: 'contenteditable' };
  }
  const __nativeSetter =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (__nativeSetter) { __nativeSetter.call(__target, VALUE); }
  else { __target.value = VALUE; }
  __target.dispatchEvent(new Event('input', { bubbles: true }));
  __target.dispatchEvent(new Event('change', { bubbles: true }));
  return { success: true, tag: __target.tagName, mode: 'value' };
`;

function buildFillSource(targetExpr, value) {
  return FILL_HELPER_SRC
    .replace('TARGET', targetExpr)
    .replace(/VALUE/g, JSON.stringify(value));
}

const KEY_SPECS = {
  enter:     { key: 'Enter',     code: 'Enter',     vkc: 13, text: '\r' },
  return:    { key: 'Enter',     code: 'Enter',     vkc: 13, text: '\r' },
  escape:    { key: 'Escape',    code: 'Escape',    vkc: 27 },
  esc:       { key: 'Escape',    code: 'Escape',    vkc: 27 },
  tab:       { key: 'Tab',       code: 'Tab',       vkc: 9 },
  backspace: { key: 'Backspace', code: 'Backspace', vkc: 8 },
  delete:    { key: 'Delete',    code: 'Delete',    vkc: 46 },
  space:     { key: ' ',         code: 'Space',     vkc: 32, text: ' ' },
  arrowup:   { key: 'ArrowUp',   code: 'ArrowUp',   vkc: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vkc: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vkc: 37 },
  arrowright:{ key: 'ArrowRight',code: 'ArrowRight',vkc: 39 },
  home:      { key: 'Home',      code: 'Home',      vkc: 36 },
  end:       { key: 'End',       code: 'End',       vkc: 35 },
  pageup:    { key: 'PageUp',    code: 'PageUp',    vkc: 33 },
  pagedown:  { key: 'PageDown',  code: 'PageDown',  vkc: 34 },
};

const MODIFIERS = {
  alt:     { bit: 1, key: 'Alt',     code: 'AltLeft',     vkc: 18 },
  ctrl:    { bit: 2, key: 'Control', code: 'ControlLeft', vkc: 17 },
  control: { bit: 2, key: 'Control', code: 'ControlLeft', vkc: 17 },
  cmd:     { bit: 4, key: 'Meta',    code: 'MetaLeft',    vkc: 91 },
  meta:    { bit: 4, key: 'Meta',    code: 'MetaLeft',    vkc: 91 },
  shift:   { bit: 8, key: 'Shift',   code: 'ShiftLeft',   vkc: 16 },
};

let cachedOs = null;
async function getOs() {
  if (cachedOs === null) {
    cachedOs = (await chrome.runtime.getPlatformInfo()).os;
  }
  return cachedOs;
}

function modKeyForOs(os) {
  return os === 'mac' ? MODIFIERS.cmd : MODIFIERS.ctrl;
}

function keySpecFor(token) {
  const lower = token.toLowerCase();
  if (KEY_SPECS[lower]) return KEY_SPECS[lower];
  const fMatch = lower.match(/^f(\d{1,2})$/);
  if (fMatch) {
    const n = parseInt(fMatch[1], 10);
    if (n >= 1 && n <= 12) {
      return { key: 'F' + n, code: 'F' + n, vkc: 111 + n };
    }
  }
  if (lower.length === 1) {
    if (/^[a-z]$/.test(lower)) {
      const upper = lower.toUpperCase();
      return { key: lower, code: 'Key' + upper, vkc: upper.charCodeAt(0), text: lower };
    }
    if (/^[0-9]$/.test(lower)) {
      return { key: lower, code: 'Digit' + lower, vkc: lower.charCodeAt(0), text: lower };
    }
  }
  throw new Error(
    `send_keys: unknown key "${token}". Supported: ${Object.keys(KEY_SPECS).join(', ')}, F1-F12, single letters/digits.`
  );
}

function parseKeySegment(segment, os) {
  const parts = segment.split('+').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('send_keys: empty key segment');
  let modifierBits = 0;
  const modifierKeys = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts[i].toLowerCase();
    const mod = name === 'mod' ? modKeyForOs(os) : MODIFIERS[name];
    if (mod === undefined) {
      throw new Error(`send_keys: "${parts[i]}" is not a modifier. Use Alt/Ctrl/Cmd/Meta/Shift or Mod.`);
    }
    modifierBits |= mod.bit;
    modifierKeys.push(mod);
  }
  return { modifierBits, modifierKeys, spec: keySpecFor(parts[parts.length - 1]) };
}

const PAPER_SIZES = {
  letter: [8.5, 11],
  legal: [8.5, 14],
  a4: [8.27, 11.69],
  a3: [11.69, 16.54],
  tabloid: [11, 17],
};

/* ---- navigate ---- */

async function toolNavigate(args) {
  const url = args.url;
  if (!url) throw new Error('navigate: url is required');
  const newTab = !!args.newTab;
  let tab = await resolveTab();

  // chrome:// / edge:// pages cannot be navigated via CDP; open a new tab.
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://'))) {
    tab = await chrome.tabs.create({ url, active: true });
    currentTabId = tab.id;
    await attachTab(tab.id);
    await waitForLoad(tab.id);
    return { success: true, url, tabId: tab.id };
  }

  // Explicitly requested a new tab.
  if (newTab) {
    tab = await chrome.tabs.create({ url, active: true });
    currentTabId = tab.id;
    await attachTab(tab.id);
    await waitForLoad(tab.id);
    return { success: true, url, tabId: tab.id, newTab: true };
  }

  await attachTab(tab.id);
  if (tab.url === url || tab.url === url + '/') {
    await sendCdp('Page.reload', { ignoreCache: true });
  } else {
    await sendCdp('Page.navigate', { url });
  }
  await waitForLoad(tab.id);
  return { success: true, url, tabId: tab.id };
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('navigate: page load timeout (30s)'));
    }, 30000);

    const isLoaded = (t) => t.status === 'complete' && !!t.url && t.url !== 'about:blank';

    const listener = (updatedTabId, info, updatedTab) => {
      if (updatedTabId === tabId && info.status === 'complete' && isLoaded(updatedTab)) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (isLoaded(t)) {
        clearTimeout(timer);
        resolve();
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    });
  });
}

/* ---- snapshot ---- */

async function toolSnapshot() {
  const tab = await resolveTab();
  await attachTab(tab.id);
  resetRefs();
  const { nodes } = await sendCdp('Accessibility.getFullAXTree');
  const tree = buildAxTree(nodes);
  const text = `URL: ${tab.url}\nTitle: ${tab.title}\n\n${JSON.stringify(tree, null, 2)}`;
  return {
    url: tab.url,
    title: tab.title,
    tree,
    text,
  };
}

function buildAxTree(nodes) {
  const byId = new Map();
  for (const n of nodes) byId.set(n.nodeId, n);
  if (nodes.length === 0) return [];
  return formatAxChildren(nodes[0], byId);
}

function formatAxChildren(node, byId) {
  const out = [];
  for (const childId of node.childIds || []) {
    const child = byId.get(childId);
    if (!child) continue;
    const formatted = formatAxNode(child, byId);
    if (formatted === null) continue;
    if (Array.isArray(formatted)) out.push(...formatted);
    else out.push(formatted);
  }
  return out;
}

function formatAxNode(node, byId) {
  const role = node.role && node.role.value;

  // Flatten none/generic wrapper nodes.
  if (!role || role === 'none' || role === 'generic') {
    const flattened = formatAxChildren(node, byId);
    if (flattened.length === 1) return flattened[0];
    if (flattened.length > 0) return flattened;
    return null;
  }

  const obj = { role };
  if (node.name && node.name.value) obj.name = node.name.value;
  if (node.value && node.value.value) obj.value = node.value.value;
  if (node.description && node.description.value) obj.description = node.description.value;

  if (INTERACTIVE_ROLES.has(role) && node.backendDOMNodeId != null) {
    obj.ref = '@' + registerRef(node.backendDOMNodeId, role, node.name ? node.name.value : '');
  }

  const children = formatAxChildren(node, byId);
  if (children.length > 0) obj.children = children;
  return obj;
}

/* ---- click ---- */

async function toolClick(args) {
  const selector = args.selector;
  if (!selector) throw new Error('click: selector is required (CSS selector or @eN ref)');
  const tab = await resolveTab();
  await attachTab(tab.id);
  return await clickByObjectId(await resolveObjectId(selector));
}

async function clickByObjectId(objectId) {
  const res = await sendCdp('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      this.scrollIntoView({ block: 'center' });
      this.click();
      return { success: true, tag: this.tagName, text: (this.textContent || '').slice(0, 100) };
    }`,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || 'click failed');
  }
  return res.result.value || { success: true };
}

/* ---- fill ---- */

async function toolFill(args) {
  const selector = args.selector;
  const value = args.value;
  if (!selector) throw new Error('fill: selector is required (CSS selector or @eN ref)');
  if (value == null) throw new Error('fill: value is required');
  const tab = await resolveTab();
  await attachTab(tab.id);

  if (isRef(selector)) {
    const objectId = await objectIdFromRef(selector);
    const res = await sendCdp('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() { ${buildFillSource('this', value)} }`,
      returnByValue: true,
    });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'fill failed');
    return res.result.value || { success: true };
  }

  const res = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: 'element not found: ${selector}' };
      ${buildFillSource('el', value)}
    })()`,
    returnByValue: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'fill failed');
  const val = res.result.value;
  if (val && val.error) throw new Error(val.error);
  return val || { success: true };
}

/* ---- type_text ---- */

async function toolTypeText(args) {
  const text = args.text;
  if (typeof text !== 'string') throw new Error('type_text: text is required (string)');
  const tab = await resolveTab();
  await attachTab(tab.id);
  await sendCdp('Input.insertText', { text });
  return { success: true, length: text.length };
}

/* ---- send_keys ---- */

async function toolSendKeys(args) {
  const keys = args.keys;
  if (typeof keys !== 'string' || !keys.trim()) {
    throw new Error('send_keys: keys is required (string), e.g. "Enter" or "Ctrl+A"');
  }
  const repeat = args.repeat === undefined ? 1 : Number(args.repeat);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) {
    throw new Error('send_keys: repeat must be an integer in [1, 100]');
  }
  const os = await getOs();
  const segments = keys.trim().split(/\s+/).map((s) => parseKeySegment(s, os));
  const tab = await resolveTab();
  await attachTab(tab.id);

  const SHIFT_BIT = MODIFIERS.shift.bit;
  let dispatched = 0;
  for (let r = 0; r < repeat; r++) {
    for (const seg of segments) {
      let spec = seg.spec;
      // Apply shift to single lowercase letters.
      if ((seg.modifierBits & SHIFT_BIT) !== 0 && spec.key.length === 1 && /^[a-z]$/.test(spec.key)) {
        const upper = spec.key.toUpperCase();
        spec = { ...spec, key: upper, text: upper };
      }
      let mods = 0;
      for (const mod of seg.modifierKeys) {
        mods |= mod.bit;
        await sendCdp('Input.dispatchKeyEvent', {
          type: 'keyDown', modifiers: mods, key: mod.key, code: mod.code, windowsVirtualKeyCode: mod.vkc,
        });
      }
      const payload = { type: 'keyDown', modifiers: seg.modifierBits, key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vkc };
      if ((seg.modifierBits & ~SHIFT_BIT) === 0 && spec.text !== undefined) payload.text = spec.text;
      await sendCdp('Input.dispatchKeyEvent', payload);
      await sendCdp('Input.dispatchKeyEvent', {
        type: 'keyUp', modifiers: seg.modifierBits, key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vkc,
      });
      for (let i = seg.modifierKeys.length - 1; i >= 0; i--) {
        const mod = seg.modifierKeys[i];
        mods &= ~mod.bit;
        await sendCdp('Input.dispatchKeyEvent', {
          type: 'keyUp', modifiers: mods, key: mod.key, code: mod.code, windowsVirtualKeyCode: mod.vkc,
        });
      }
      dispatched++;
    }
  }
  return { success: true, dispatched, os };
}

/* ---- evaluate ---- */

async function toolEvaluate(args) {
  const code = args.code;
  if (!code) throw new Error('evaluate: code is required');
  const tab = await resolveTab();
  await attachTab(tab.id);
  const res = await sendCdp('Runtime.evaluate', {
    expression: code,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    const desc = res.exceptionDetails.exception && res.exceptionDetails.exception.description;
    throw new Error('evaluate: ' + (desc || res.exceptionDetails.text));
  }
  const value = res.result.value;
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { type: res.result.type, value, text };
}

/* ---- screenshot ---- */

async function toolScreenshot(args) {
  const tab = await resolveTab();
  await attachTab(tab.id);
  const format = args.format || 'png';
  if (format !== 'png' && format !== 'jpeg') {
    throw new Error('screenshot: format must be "png" or "jpeg"');
  }
  const params = { format };
  if (format === 'jpeg') params.quality = args.quality || 80;

  const selector = typeof args.selector === 'string' ? args.selector : '';
  if (selector) {
    const objectId = await resolveObjectId(selector);
    await sendCdp('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() { this.scrollIntoView({ block: 'center', inline: 'center' }); }`,
    });
    let model;
    try {
      model = await sendCdp('DOM.getBoxModel', { objectId });
    } catch (err) {
      throw new Error(`screenshot: element has no layout box. (CDP: ${err.message})`);
    }
    const border = model.model && model.model.border;
    if (!border || border.length < 8) {
      throw new Error('screenshot: element has no layout box.');
    }
    const xs = [border[0], border[2], border[4], border[6]];
    const ys = [border[1], border[3], border[5], border[7]];
    const x = Math.min(...xs), y = Math.min(...ys);
    const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
    if (width <= 0 || height <= 0) {
      throw new Error(`screenshot: element has zero-size box (width=${width}, height=${height}).`);
    }
    params.clip = { x, y, width, height, scale: 1 };
  }

  const res = await sendCdp('Page.captureScreenshot', params);
  return { format, dataLength: res.data.length, data: res.data };
}

/* ---- network_start / network_list / network_detail / network_stop ---- */

async function toolNetworkStart() {
  ensureNetworkListener();
  const tab = await resolveTab();
  await attachTab(tab.id);
  networkRequests.set(tab.id, new Map());
  networkCaptureTabs.add(tab.id);
  const captureId = `cap-${Date.now().toString(36)}-${networkCaptureCounter++}`;
  networkCaptureIds.set(tab.id, captureId);
  await sendCdp('Network.enable');
  return { success: true, message: 'network capture started', tabId: tab.id, captureId };
}

async function toolNetworkStop() {
  if (currentTabId !== null && networkCaptureTabs.has(currentTabId)) {
    networkCaptureTabs.delete(currentTabId);
    networkCaptureIds.delete(currentTabId);
    try {
      await sendCdp('Network.disable');
    } catch (_) { /* tab may be gone */ }
  }
  return { success: true, message: 'network capture stopped' };
}

async function toolNetworkList(args) {
  const tabId = currentTabId;
  const store = tabId === null ? new Map() : (networkRequests.get(tabId) || new Map());
  let requests = Array.from(store.values());
  if (args.filter) {
    requests = requests.filter((r) => r.url.includes(args.filter));
  }
  const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : requests.length;
  requests = requests.slice(0, limit);
  return {
    count: requests.length,
    requests: requests.map((r) => ({
      requestId: r.requestId,
      url: r.url,
      method: r.method,
      status: r.status,
      mimeType: r.mimeType,
      completed: r.completed === true,
    })),
  };
}

async function toolNetworkDetail(args) {
  const requestId = args.requestId;
  if (!requestId) throw new Error('network_detail: requestId is required');
  const tabId = currentTabId;
  const store = tabId === null ? new Map() : (networkRequests.get(tabId) || new Map());
  const entry = store.get(requestId);
  if (!entry) throw new Error(`network_detail: request "${requestId}" not found`);
  const res = await sendCdp('Network.getResponseBody', { requestId });
  let body = res.body;
  if (!res.base64Encoded) {
    try { body = JSON.parse(res.body); } catch (_) { /* keep raw string */ }
  }
  return {
    requestId: entry.requestId,
    url: entry.url,
    method: entry.method,
    status: entry.status,
    mimeType: entry.mimeType,
    base64Encoded: res.base64Encoded,
    body,
  };
}

/* ---- get_cookies / set_cookie ---- */

async function toolGetCookies(args) {
  const details = {};
  if (args.url) details.url = args.url;
  else if (args.domain) details.domain = args.domain;
  let cookies = await chrome.cookies.getAll(details);
  if (args.name) {
    cookies = cookies.filter((c) => c.name === args.name);
  }
  return {
    count: cookies.length,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate,
      storeId: c.storeId,
    })),
  };
}

async function toolSetCookie(args) {
  const details = {
    url: args.url,
    name: args.name,
    value: args.value,
  };
  if (!details.url || !details.name || details.value === undefined) {
    throw new Error('set_cookie: url, name and value are required');
  }
  if (args.domain !== undefined) details.domain = args.domain;
  if (args.path !== undefined) details.path = args.path;
  if (args.secure !== undefined) details.secure = !!args.secure;
  if (args.httpOnly !== undefined) details.httpOnly = !!args.httpOnly;
  if (args.sameSite !== undefined) details.sameSite = args.sameSite;
  if (args.expirationDate !== undefined) details.expirationDate = Number(args.expirationDate);
  const cookie = await chrome.cookies.set(details);
  return { success: true, cookie };
}

/* ---- save_as_pdf ---- */

async function toolSaveAsPdf(args) {
  const tab = await resolveTab();
  await attachTab(tab.id);
  // Accept both the named paper format (paper_format) and explicit
  // paperWidth / paperHeight in inches. Explicit dimensions win.
  const named = PAPER_SIZES[(args.paper_format || '').toLowerCase()];
  const paperWidth = typeof args.paperWidth === 'number' ? args.paperWidth : (named ? named[0] : PAPER_SIZES.letter[0]);
  const paperHeight = typeof args.paperHeight === 'number' ? args.paperHeight : (named ? named[1] : PAPER_SIZES.letter[1]);
  const scale = typeof args.scale === 'number' ? args.scale : 1;
  if (scale < 0.1 || scale > 2) {
    throw new Error(`save_as_pdf: scale must be in [0.1, 2.0], got ${scale}`);
  }
  const printBackground = args.printBackground !== undefined ? !!args.printBackground
    : (args.print_background !== undefined ? !!args.print_background : true);
  const preferCSSPageSize = args.preferCSSPageSize !== undefined ? !!args.preferCSSPageSize : true;
  const res = await sendCdp('Page.printToPDF', {
    printBackground,
    landscape: !!args.landscape,
    scale,
    paperWidth,
    paperHeight,
    preferCSSPageSize,
  });
  if (!res || !res.data) throw new Error('save_as_pdf: CDP Page.printToPDF returned no data');
  let title = '';
  try {
    title = (await sendCdp('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    })).result.value || '';
  } catch (_) { /* best effort */ }
  return {
    data: res.data,
    mimeType: 'application/pdf',
    dataLength: res.data.length,
    pageTitle: title,
  };
}

/* ---- upload ---- */

async function toolUpload(args) {
  const selector = args.selector;
  const files = args.files;
  if (!selector) throw new Error('upload: selector is required (CSS selector for file input)');
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('upload: files is required (array of local file paths)');
  }
  const tab = await resolveTab();
  await attachTab(tab.id);
  const { root } = await sendCdp('DOM.getDocument');
  const { nodeId } = await sendCdp('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`upload: element not found: ${selector}`);
  await sendCdp('DOM.setFileInputFiles', { files, nodeId });
  return { success: true, selector, fileCount: files.length, files };
}

/* ---- list_tabs ---- */

async function toolListTabs() {
  const tabs = await chrome.tabs.query({});
  const list = tabs.map((t) => ({
    tabId: t.id,
    windowId: t.windowId,
    url: t.url || '',
    title: t.title || '',
    active: t.active,
  }));
  return {
    success: true,
    tabs: list,
    text: JSON.stringify(list, null, 2),
  };
}

/* ---- switch_tab ---- */

async function toolSwitchTab(args) {
  let tabId = args.tabId;
  if (tabId === undefined || tabId === null) {
    if (!args.url) throw new Error('switch_tab: tabId or url is required');
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((t) => t.url && t.url.includes(args.url));
    if (!match) throw new Error(`switch_tab: no tab matching url "${args.url}"`);
    tabId = match.id;
  }
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  currentTabId = tabId;
  await attachTab(tabId);
  return { success: true, tabId, url: tab.url, title: tab.title };
}

/* ---- close_tab ---- */

async function toolCloseTab(args) {
  let tabId = args.tabId;
  if (tabId === undefined || tabId === null) tabId = currentTabId;
  if (tabId === null || tabId === undefined) {
    return { success: true, closed: false, reason: 'no tab to close', text: 'no tab to close' };
  }
  try {
    await chrome.tabs.remove(tabId);
    return { success: true, closed: true, tabId, text: `closed tab ${tabId}` };
  } catch (_) {
    return { success: true, closed: false, reason: 'tab already closed', text: 'tab already closed' };
  }
}

/* ---- cdp ---- */

async function toolCdp(args) {
  const method = args.method;
  if (!method) throw new Error('cdp: method is required (e.g. "Input.dispatchMouseEvent")');
  const params = args.params || {};
  const tab = await resolveTab();
  await attachTab(tab.id);
  const res = await sendCdp(method, params);
  if (res == null) return {};
  if (typeof res === 'object' && !Array.isArray(res)) return res;
  return { value: res };
}

/* ============================================================================
 * Tool registry & JSON-RPC routing
 * ========================================================================== */

const tools = {
  navigate: toolNavigate,
  snapshot: toolSnapshot,
  click: toolClick,
  fill: toolFill,
  type_text: toolTypeText,
  send_keys: toolSendKeys,
  evaluate: toolEvaluate,
  screenshot: toolScreenshot,
  network_start: toolNetworkStart,
  network_list: toolNetworkList,
  network_detail: toolNetworkDetail,
  network_stop: toolNetworkStop,
  get_cookies: toolGetCookies,
  set_cookie: toolSetCookie,
  save_as_pdf: toolSaveAsPdf,
  upload: toolUpload,
  list_tabs: toolListTabs,
  switch_tab: toolSwitchTab,
  close_tab: toolCloseTab,
  cdp: toolCdp,
};

async function dispatchToolCall(toolName, args) {
  const fn = tools[toolName];
  if (!fn) {
    throw new Error(`Unknown tool: ${toolName}. Available: ${Object.keys(tools).join(', ')}`);
  }
  return await fn(args || {});
}

/* ============================================================================
 * WebSocket client with exponential-backoff reconnect
 * ========================================================================== */

function persistState() {
  chrome.storage.local.set({
    [STORAGE_KEYS.STATE]: {
      state: wsState,
      url: wsUrl,
      attempts: reconnectAttempts,
      updatedAt: Date.now(),
    },
  }).catch(() => {});
}

function clearConnectTimeout() {
  if (connectTimeoutTimer !== null) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function currentBackoffDelay() {
  const delay = RECONNECT_MIN_DELAY_MS * Math.pow(2, reconnectAttempts);
  return Math.min(delay, RECONNECT_MAX_DELAY_MS);
}

function sendJsonRpc(socket, msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function wsSend(msg) {
  sendJsonRpc(wsSocket, msg);
}

/**
 * Schedule a reconnect attempt (exponential backoff, capped at 30 s).
 */
function scheduleReconnect() {
  clearReconnectTimer();
  const delay = currentBackoffDelay();
  wsState = 'reconnecting';
  persistState();
  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    openSocket(wsUrl);
  }, delay);
}

function openSocket(url) {
  // Clean up any previous socket.
  if (wsSocket) {
    try { wsSocket.close(); } catch (_) {}
    wsSocket = null;
  }
  clearConnectTimeout();

  wsState = 'connecting';
  wsUrl = url;
  persistState();

  let socket;
  try {
    socket = new WebSocket(url);
  } catch (err) {
    wsState = 'disconnected';
    persistState();
    scheduleReconnect();
    return;
  }
  wsSocket = socket;

  // Connection timeout — if no open within CONNECT_TIMEOUT_MS, treat as failed.
  connectTimeoutTimer = setTimeout(() => {
    if (wsSocket === socket && wsState === 'connecting') {
      try { socket.close(); } catch (_) {}
      wsState = 'reconnecting';
      persistState();
      scheduleReconnect();
    }
  }, CONNECT_TIMEOUT_MS);

  socket.addEventListener('open', () => {
    if (wsSocket !== socket) { socket.close(); return; }
    clearConnectTimeout();
    wsState = 'connected';
    reconnectAttempts = 0;
    persistState();
    wsSend({
      jsonrpc: '2.0',
      method: 'hello',
      params: {
        extensionVersion: chrome.runtime.getManifest().version,
        userAgent: 'WebBridge/1.0',
      },
    });
  });

  socket.addEventListener('message', (event) => {
    if (wsSocket !== socket) return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return; // ignore non-JSON frames
    }
    handleMessage(msg);
  });

  socket.addEventListener('close', () => {
    if (wsSocket !== socket) return;
    wsSocket = null;
    clearConnectTimeout();
    wsState = 'disconnected';
    persistState();
    // Auto-reconnect unless explicitly disconnected by the user.
    isAutoConnectEnabled().then((enabled) => {
      if (enabled) scheduleReconnect();
    });
  });

  socket.addEventListener('error', () => {
    // Error is always followed by a close event — handled there.
  });
}

function teardownSocket() {
  clearConnectTimeout();
  clearReconnectTimer();
  if (wsSocket) {
    const socket = wsSocket;
    wsSocket = null;
    try { socket.close(); } catch (_) {}
  }
  wsState = 'disconnected';
  persistState();
}

async function isAutoConnectEnabled() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SHOULD_CONNECT);
  return data[STORAGE_KEYS.SHOULD_CONNECT] === true;
}

/**
 * Handle an incoming JSON-RPC 2.0 message.
 * Supports both bare JSON-RPC requests ({jsonrpc, id, method, params}) and
 * tool_call envelopes ({jsonrpc, id, type: 'tool_call', tool, args}).
 */
function handleMessage(msg) {
  // Ping/pong keepalive.
  if (msg.method === 'ping' || msg.type === 'ping') {
    if (msg.id !== undefined) {
      wsSend({ jsonrpc: '2.0', id: msg.id, result: 'pong' });
    } else {
      wsSend({ jsonrpc: '2.0', method: 'pong' });
    }
    return;
  }

  const isRequest = msg.id !== undefined && msg.id !== null;
  // The MCP server sends tool_call with params.tool / params.args; the older
  // popup-era shape used params.name. Accept both so either side works.
  const params = msg.params || {};
  const toolName = msg.method === 'tool_call'
    ? (params.name || params.tool)
    : (msg.tool || params.name);
  const toolArgs = msg.method === 'tool_call'
    ? (params.args || {})
    : (params || msg.args || {});

  if (toolName) {
    handleToolCall(isRequest ? msg.id : null, toolName, toolArgs || {});
    return;
  }

  if (!isRequest) return; // notification we don't care about

  wsSend({
    jsonrpc: '2.0',
    id: msg.id,
    error: { code: -32601, message: `Method not found: ${msg.method || msg.type || 'unknown'}` },
  });
}

async function handleToolCall(id, toolName, args) {
  let result, error;
  try {
    result = await dispatchToolCall(toolName, args);
  } catch (err) {
    error = { code: -32000, message: err && err.message ? err.message : String(err) };
  }
  if (id === null || id === undefined) return; // notification-style tool_call — no response
  const response = { jsonrpc: '2.0', id };
  if (error) response.error = error;
  else response.result = result;
  wsSend(response);
}

/* ============================================================================
 * Connection control (used by popup + startup)
 * ========================================================================== */

async function connect(url) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SHOULD_CONNECT]: true,
    [STORAGE_KEYS.WS_URL]: url || DEFAULT_WS_URL,
  });
  reconnectAttempts = 0;
  clearReconnectTimer();
  openSocket(url || DEFAULT_WS_URL);
}

async function disconnect() {
  await chrome.storage.local.set({ [STORAGE_KEYS.SHOULD_CONNECT]: false });
  reconnectAttempts = 0;
  teardownSocket();
}

async function reconcile() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.SHOULD_CONNECT, STORAGE_KEYS.WS_URL]);
  const shouldConnect = data[STORAGE_KEYS.SHOULD_CONNECT] === true;
  const url = data[STORAGE_KEYS.WS_URL] || DEFAULT_WS_URL;
  if (!shouldConnect) {
    if (wsState !== 'disconnected') teardownSocket();
    return;
  }
  if (wsState === 'connected' || wsState === 'connecting') return;
  clearReconnectTimer();
  openSocket(url);
}

async function getStatus() {
  let attachedTab = null;
  if (currentTabId !== null) {
    try {
      const t = await chrome.tabs.get(currentTabId);
      attachedTab = { tabId: t.id, url: t.url || '', title: t.title || '' };
    } catch (_) { /* tab gone */ }
  }
  return {
    state: wsState,
    connected: wsState === 'connected',
    url: wsUrl,
    attempts: reconnectAttempts,
    attachedTab,
  };
}

/* ============================================================================
 * chrome.runtime.onMessage — popup communication
 * ========================================================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message && message.type) {
        case 'GET_STATUS':
          sendResponse(await getStatus());
          break;
        case 'CONNECT':
          await connect(message.url);
          sendResponse({ success: true });
          break;
        case 'DISCONNECT':
          await disconnect();
          sendResponse({ success: true });
          break;
        default:
          sendResponse({ error: 'unknown message type' });
      }
    } catch (err) {
      sendResponse({ error: err && err.message ? err.message : String(err) });
    }
  })();
  return true; // async response
});

/* ============================================================================
 * chrome.alarms keepalive
 * ========================================================================== */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) {
    reconcile();
  }
});

/* ============================================================================
 * Startup
 * ========================================================================== */

async function main() {
  chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_ALARM_PERIOD_MINUTES,
  });

  // Restore previous connection intent.
  const data = await chrome.storage.local.get([STORAGE_KEYS.WS_URL]);
  if (data[STORAGE_KEYS.WS_URL]) {
    wsUrl = data[STORAGE_KEYS.WS_URL];
  }
  await reconcile();
}

main().catch((err) => {
  console.error('[WebBridge] startup failed:', err);
});
