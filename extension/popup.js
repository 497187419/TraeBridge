/* WebBridge popup script — communicates with the background service worker. */

'use strict';

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const wsUrlEl = document.getElementById('wsUrl');
const tabInfoEl = document.getElementById('tabInfo');
const tabTitleEl = document.getElementById('tabTitle');
const tabUrlEl = document.getElementById('tabUrl');
const toggleBtn = document.getElementById('toggleBtn');

const STATE_LABELS = {
  connected: '已连接',
  disconnected: '未连接',
  connecting: '连接中',
  reconnecting: '重连中',
};

async function sendMessage(message) {
  return await chrome.runtime.sendMessage(message);
}

async function refresh() {
  let status;
  try {
    status = await sendMessage({ type: 'GET_STATUS' });
  } catch (err) {
    statusText.textContent = '错误';
    toggleBtn.textContent = '连接';
    toggleBtn.className = '';
    return;
  }
  if (!status || status.error) {
    statusText.textContent = '错误';
    return;
  }

  const state = status.state || 'disconnected';
  statusDot.className = 'dot ' + state;
  statusText.textContent = STATE_LABELS[state] || state;
  wsUrlEl.textContent = status.url || 'ws://127.0.0.1:8765';

  if (state === 'connected' && status.attachedTab) {
    tabInfoEl.style.display = 'block';
    tabTitleEl.textContent = status.attachedTab.title || '(无标题)';
    tabUrlEl.textContent = status.attachedTab.url || '';
  } else {
    tabInfoEl.style.display = 'none';
  }

  if (state === 'connected') {
    toggleBtn.textContent = '断开';
    toggleBtn.className = 'disconnect';
  } else {
    toggleBtn.textContent = state === 'connecting' || state === 'reconnecting' ? '连接中…' : '连接';
    toggleBtn.className = '';
    toggleBtn.disabled = state === 'connecting' || state === 'reconnecting';
  }
}

toggleBtn.addEventListener('click', async () => {
  toggleBtn.disabled = true;
  const state = statusText.textContent;
  try {
    if (state === '已连接') {
      await sendMessage({ type: 'DISCONNECT' });
    } else {
      await sendMessage({ type: 'CONNECT', url: wsUrlEl.textContent.trim() });
    }
  } catch (_) { /* ignore */ }
  await refresh();
});

refresh();
setInterval(refresh, 1000);
