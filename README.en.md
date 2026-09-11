**Language / 语言**: English | [简体中文](README.md)

---

## Project Name

**TraeBridge — A Real-Time Browser Control Bridge for AI Coding Assistants**

TraeBridge is a browser extension (Chrome / Edge, Manifest V3) that lets Trae (or any MCP-capable AI client) **control the user's browser without any browser driver (no Playwright / Puppeteer / Selenium)**, via a local WebSocket channel — operating directly on the browser the user already has open, already logged in, with full Cookie sessions.

---

## 1. Background & Requirements

### 1.1 Pain Points Today

| Scenario | Traditional Approach | Pain Point |
|----------|---------------------|------------|
| Trae automating web pages | Playwright / Puppeteer launches a new browser instance | New instance has no user cookies; requires re-scanning QR code / re-login; high startup overhead per run |
| Operating a logged-in admin system | Manually export cookies for injection or CDP attach | Tedious workflow, easily broken, poor security |
| AI reading the current page in real time | Screenshot + OCR / copy-paste | High latency, information loss, no structured output |

**Core need:** AI needs a "remote hand" that directly takes over the browser session the user is **actually using**.

### 1.2 Requirement Definition

Build a browser extension that satisfies:

- **R1 Driver-free control**: No browser automation framework dependency; execute actions in the already-running browser via Chrome Extension API + CDP (Chrome DevTools Protocol).
- **R2 Session inheritance**: Natively uses the current browser profile's cookies, LocalStorage, and login state — **zero login cost**.
- **R3 Real-time bidirectional communication**: The extension keeps a persistent WebSocket connection with the local MCP Server. Trae calls an MCP tool → MCP Server → WebSocket → extension → execution → result returns the same path, end-to-end latency < 100ms.
- **R4 Structured page awareness**: Use the CDP Accessibility Tree (AX Tree) to generate a semantic snapshot of interactive elements (not a raw HTML dump), so AI understands page structure efficiently.
- **R5 Safe & controllable**: Connection requires explicit user authorization; sensitive actions (form submission, payment page navigation) require secondary confirmation; communication restricted to localhost loopback only.
- **R6 Tab management**: Discover, switch, close, and group multiple tabs; AI can operate multiple pages in parallel.

---

## 2. Competitive Comparison: Playwright Extension / Kimi WebBridge / TraeBridge

### 2.1 Architecture Comparison

| Dimension | Playwright Extension | Kimi WebBridge | TraeBridge (this project) |
|-----------|---------------------|----------------|--------------------------|
| **Architecture** | Browser extension + external Node.js process | Pure browser extension (MV3) | Pure browser extension (MV3) + lightweight MCP Server |
| **Communication** | WebSocket + CDP | Native Messaging (bound to desktop client) | WebSocket + JSON-RPC 2.0 (MCP standard) |
| **External dependencies** | Requires Node.js + Playwright kernel | Requires Kimi desktop client | Only Node.js (MCP Server starts with one command) |
| **AI integration** | No built-in AI channel; wrap it yourself | Kimi's own AI only | **Any MCP client** (Trae / Claude Desktop / Cursor, etc.) |
| **Open source** | Open source (Microsoft) | Closed source (Kimi desktop) | **Fully open source** |
| **Protocol** | Private protocol | Private protocol | **Standard MCP Protocol**, ecosystem-interoperable |

### 2.2 Feature Comparison

| Feature | Playwright Extension | Kimi WebBridge | TraeBridge | Notes |
|---------|:----:|:----:|:----:|------|
| Page navigation / refresh | ✅ | ✅ | ✅ | |
| Element click (DOM-level) | ✅ | ✅ | ✅ | |
| Element click (physical-level, bypasses anti-bot) | ❌ | ✅ | ✅ | Input.dispatchMouseEvent |
| Form filling / text input | ✅ | ✅ | ✅ | |
| Key / combo key sending | ✅ | ✅ | ✅ | |
| Arbitrary JavaScript execution | ✅ | ✅ | ✅ | |
| Screenshot (full page / element) | ✅ | ✅ | ✅ | |
| Save page as PDF | ❌ | ✅ | ✅ | |
| Cookie reading | ❌ | ✅ | ✅ | |
| Cookie write / delete | ❌ | ❌ | ✅ | |
| File upload | ✅ | ❌ | ✅ | |
| **Real-time network request monitoring** | ❌ | ❌ | ✅ | Network.enable + event stream |
| Tab management (list/switch/close/group) | ✅ | ✅ | ✅ | |
| **Semantic snapshot (AX Tree)** | ❌ | ✅ | ✅ | Accessibility.getFullAXTree |
| Raw CDP command passthrough | ✅ | ❌ | ✅ | Escape hatch, unlimited extensibility |
| **Cookie masking display** | ❌ | ❌ | 🚧 | Phase 4 security feature |
| **Sensitive action confirmation** | ❌ | ❌ | 🚧 | Phase 4 security feature |
| **Domain allowlist** | ❌ | ❌ | 🚧 | Phase 4 security feature |
| **Audit log** | ❌ | ❌ | 🚧 | Phase 4 security feature |

> ✅ Implemented　🚧 Code structure reserved, pending Phase 4 iteration　❌ Not supported

**Conclusion: Everything Playwright Extension and Kimi WebBridge can do, TraeBridge can do — plus enterprise-grade capabilities they lack: cookie management, network capture, CDP passthrough, and security auditing.**

### 2.3 Token Consumption Comparison (key metric for AI-operated web)

| Approach | Page Perception Method | Typical Tokens per Operation | Notes |
|----------|----------------------|------------------------------|-------|
| **Screenshot-driven** (traditional) | base64 PNG image | **200K – 800K** | A 1920×1080 screenshot is ~700K–2.7M characters after base64 encoding |
| **TraeBridge semantic snapshot** | AX Tree text structure | **500 – 5,000** | Only interactive elements' role/name/ref returned; AI understands directly |
| TraeBridge precise operation | `@eN` reference + JS evaluation | **100 – 2,000** | No visual confirmation needed; operate directly via reference |

**TraeBridge token optimization strategy:**

1. **Semantic snapshot first**: `browser_snapshot` returns a text-based AX Tree, saving **99%+** tokens vs screenshots
2. **Precise element references**: `@eN` references locate elements directly — no repeated screenshot-coordinate confirmation
3. **Screenshot as fallback, not default**: Use `browser_screenshot` only when:
   - CAPTCHA / image recognition
   - Visual layout regression testing
   - Extremely complex pages where semantic snapshot can't locate elements

```
✅ Recommended flow (low tokens):
   browser_snapshot → AI analyzes → browser_click(@e14) → browser_evaluate to verify
   Total: ~1,000–3,000 tokens

❌ Flow to avoid (high tokens):
   browser_screenshot → AI visual analysis → browser_click(x, y) → screenshot again to confirm
   Total: ~400,000+ tokens
```

### 2.4 TraeBridge Core Advantages Summary

| Advantage | Description |
|-----------|-------------|
| **Driver-free + session inheritance** | Operates the user's current browser directly; cookies / login state reused at zero cost — no Playwright / Puppeteer / Selenium needed |
| **Best token efficiency** | Semantic snapshot (AX Tree) replaces screenshots, saving 99%+ tokens per operation — ideal for high-frequency AI interaction |
| **Standardized protocol** | Built on MCP Protocol; develop once, plug into any AI client (Trae / Claude Desktop / Cursor) |
| **Full capability coverage** | Covers all Playwright Extension and Kimi WebBridge features, plus unique network capture, cookie management, and CDP passthrough |
| **Safe & controllable** | Sensitive action confirmation, domain allowlist, cookie masking, audit log (rolling out in Phase 4) |
| **Fully open source** | Transparent code, freely extensible, auditable, customizable — no black-box dependencies |
| **Runs silently in the background without hijacking the user's desktop** | Supports Windows Virtual Desktops: put the controlled browser window on Desktop 2 while the user keeps working on Desktop 1. AI queries data in the background via physical-level simulated clicks and network capture, **completely unaffected by what the user is doing in their browser on Desktop 1** (see Section 2.5) |

### 2.5 Scenario: Background Browser Automation on Windows Virtual Desktops

TraeBridge's physical-level clicks (`Input.dispatchMouseEvent`) and network capture (`Network.enable`) make it naturally suited for **silent background automation** — the AI-controlled browser window can live entirely separately from the user's current desktop environment.

```
Desktop 1 (user working)              Desktop 2 (AI background operation)
┌─────────────────────────┐          ┌─────────────────────────┐
│  User's Edge/Chrome      │          │  Controlled Edge window  │
│  ─ normal browsing/work  │ mutually │  ─ AI auto-searches docs │
│  ─ zero interference     │ isolated │  ─ auto-scrapes web data │
│                          │          │  ─ auto-fills, clicks    │
└─────────────────────────┘          └─────────────────────────┘
         ▲                                    ▲
         │  Trae issues commands              │  chrome.debugger
         │  (browser_* tools)                 │  CDP physical-level ops
         └────────────────────────────────────┘
              No window hijacking, no focus conflicts, no mouse interference
```

**Typical workflow:**

1. Open an Edge window on Desktop 2, load the TraeBridge extension, and connect to the MCP Server
2. User works normally on Desktop 1 with their daily browser
3. Issue a command via Trae, e.g., "Search for a technical solution and grab the top 3 results"
4. AI completes the task in the controlled browser on Desktop 2: navigate → snapshot → click → capture → extract data
5. Results return to Trae; the user's Desktop 1 experience is completely unaffected

**Advantages:**
- **Zero interference**: No mouse focus stealing, no popups, no desktop switching
- **Parallel work**: User works while AI researches — no blocking
- **Session isolation**: The Desktop 2 browser maintains its own login state (cookies), fully isolated from the user's daily browser

---

## 3. Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Trae IDE (AI client)                     │
│              calls MCP via stdio / streamable HTTP           │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              TraeBridge MCP Server (Node.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │  MCP Tool    │  │  Session     │  │  WebSocket Server    ││
│  │  Registry    │◄─┤  Manager     │◄─┤  (ws://127.0.0.1)   ││
│  │  (17+ tools) │  │  (tab路由)    │  │  Port: 8765          ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
└──────────────────────┬───────────────────────────────────────┘
                       │ WebSocket (JSON-RPC 2.0)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│         TraeBridge Browser Extension (MV3)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │  WS Client   │  │  Tool        │  │  CDP Controller      ││
│  │  (reconnect) │◄─┤  Dispatcher  │◄─┤  (chrome.debugger)   ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │  Popup UI    │  │  Confirm     │  │  AX Tree             ││
│  │  (connection)│  │  Interceptor │  │  Snapshot Builder    ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
└──────────────────────┬───────────────────────────────────────┘
                       │ chrome.debugger.attach
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              User's current browser (logged in / with cookies)│
│         ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│         │  Tab 1  │  │  Tab 2  │  │  Tab N  │                │
│         │ (Zhihu) │  │ (GitHub)│  │ (Admin) │                │
│         └─────────┘  └─────────┘  └─────────┘                │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Core Module Design

### 4.1 Browser Extension Side

#### 4.1.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "TraeBridge",
  "version": "1.0.0",
  "description": "Bridge your browser to Trae AI via MCP — no driver needed.",
  "permissions": [
    "tabs",
    "activeTab",
    "debugger",
    "storage",
    "alarms",
    "tabGroups",
    "windows",
    "cookies"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

#### 4.1.2 Core Components

| Component | Responsibility | Key Implementation |
|-----------|---------------|--------------------|
| **WS Client** | Maintains WebSocket long connection with MCP Server | Exponential backoff reconnect; heartbeat ping/pong; JSON-RPC 2.0 message serialization |
| **Tool Dispatcher** | Receives tool_call, routes to the matching executor | Registry pattern: `Map<toolName, executor>` |
| **CDP Controller** | Manages `chrome.debugger` lifecycle | Singleton attach/detach; auto detach on tab close; timeout protection |
| **AX Snapshot Builder** | Builds semantic page snapshots | `Accessibility.getFullAXTree` → filter `none/generic` → generate `@eN` references |
| **Confirm Interceptor** | Secondary confirmation for sensitive actions | `chrome.notifications` + execute only after user clicks confirm |
| **Popup UI** | Connection status display, manual connect/disconnect, current session list | Vanilla HTML + JS, no framework dependencies |

#### 4.1.3 CDP Tool Executors

Each tool is a class implementing the `execute(args)` interface:

```
CDPExecutor
├── NavigateExecutor      → Page.navigate / Page.reload
├── SnapshotExecutor      → Accessibility.getFullAXTree → semantic tree
├── ClickExecutor         → DOM.resolveNode + Runtime.callFunctionOn (DOM-level)
├── MouseClickExecutor    → DOM.getBoxModel + Input.dispatchMouseEvent (physical-level)
├── FillExecutor          → Runtime.callFunctionOn (native setter + input/change events)
├── TypeExecutor          → Input.insertText
├── SendKeysExecutor      → Input.dispatchKeyEvent (combo keys, function keys)
├── EvaluateExecutor      → Runtime.evaluate (custom JS)
├── ScreenshotExecutor    → Page.captureScreenshot (supports element clip)
├── NetworkExecutor       → Network.enable / disable / list / detail
├── CookieExecutor        → Network.getCookies / setCookies / deleteCookies
├── PDFExecutor           → Page.printToPDF
├── UploadExecutor        → DOM.setFileInputFiles
├── TabManagerExecutor    → tabs.query / create / remove / group / activate
└── CDPRawExecutor        → passthrough of any CDP method (escape hatch)
```

#### 4.1.4 Connection State Machine

```
disconnected ──[user click connect / auto-reconnect]──► connecting
                                                          │
                                                    [ws open] │
                                                          ▼
connected ◄────────────────────────────────────────── connected
   │                                                          │
   │ [ws close / error]                                       │ [user click disconnect]
   ▼                                                          ▼
reconnecting (backoff: 1s → 2s → 4s → ... max 30s)    disconnected
```

---

### 4.2 MCP Server Side (Node.js + TypeScript)

#### 4.2.1 Project Structure

```
traebridge-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry: start MCP Server + WS Server
│   ├── mcp/
│   │   ├── server.ts          # MCP Server init (streamable HTTP + stdio)
│   │   ├── tools/             # One file per MCP Tool
│   │   │   ├── navigate.ts
│   │   │   ├── snapshot.ts
│   │   │   ├── click.ts
│   │   │   ├── fill.ts
│   │   │   ├── type_text.ts
│   │   │   ├── send_keys.ts
│   │   │   ├── evaluate.ts
│   │   │   ├── screenshot.ts
│   │   │   ├── network.ts
│   │   │   ├── cookies.ts
│   │   │   ├── pdf.ts
│   │   │   ├── upload.ts
│   │   │   ├── tabs.ts
│   │   │   └── cdp.ts
│   │   └── schemas/           # Zod input validation
│   ├── ws/
│   │   ├── ws-server.ts       # WebSocket Server (port 8765)
│   │   ├── session-manager.ts # Manages multiple browser connections
│   │   └── protocol.ts        # JSON-RPC 2.0 message type definitions
│   └── utils/
│       ├── logger.ts
│       └── config.ts
└── dist/                       # Compiled output
```

#### 4.2.2 MCP Tool Definitions (tools exposed to Trae)

| MCP Tool | Description | Risk Level |
|----------|-------------|------------|
| `browser_navigate` | Navigate to URL (new tab / current tab) | Low |
| `browser_snapshot` | Get AX Tree semantic snapshot of current page | Read-only |
| `browser_click` | Click element (CSS selector or `@eN` ref) | Medium |
| `browser_fill` | Fill input (supports contenteditable) | Medium |
| `browser_type` | Type text into currently focused element | Medium |
| `browser_send_keys` | Send key / combo key (Enter, Ctrl+A, F5...) | Medium |
| `browser_evaluate` | Execute arbitrary JavaScript in page | High |
| `browser_screenshot` | Screenshot (full page or specific element) | Read-only |
| `browser_network_start` | Start network capture | Read-only |
| `browser_network_list` | List captured requests | Read-only |
| `browser_network_detail` | Get request/response details | Read-only |
| `browser_network_stop` | Stop capture | Read-only |
| `browser_get_cookies` | Get cookies for current domain | Read-only |
| `browser_set_cookie` | Set cookie | High |
| `browser_save_as_pdf` | Save page as PDF | Low |
| `browser_upload` | Upload file to file input | High |
| `browser_list_tabs` | List all tabs | Read-only |
| `browser_switch_tab` | Switch to specified tab | Low |
| `browser_close_tab` | Close tab | Medium |
| `browser_cdp` | Passthrough of any CDP command | High |

#### 4.2.3 Communication Protocol (JSON-RPC 2.0 over WebSocket)

**MCP Server → Extension (tool_call):**

```json
{
  "jsonrpc": "2.0",
  "id": "req-uuid-001",
  "method": "tool_call",
  "params": {
    "tool": "browser_click",
    "args": {
      "selector": "@e3"
    },
    "sessionId": "browser-session-abc123"
  }
}
```

**Extension → MCP Server (tool_result):**

```json
{
  "jsonrpc": "2.0",
  "id": "req-uuid-001",
  "result": {
    "success": true,
    "tag": "BUTTON",
    "text": "Submit"
  }
}
```

**Extension → MCP Server (event push):**

```json
{
  "jsonrpc": "2.0",
  "method": "event",
  "params": {
    "type": "page_navigated",
    "data": { "url": "https://example.com", "title": "Example" }
  }
}
```

#### 4.2.4 Installation

**Option 1: Local development (recommended, this repo)**

```json
// Trae MCP config (~/.trae/mcp.json or project .trae/mcp.json)
{
  "mcpServers": {
    "traebridge": {
      "command": "node",
      // Note: change the path below to your actual project path
      "args": ["D:\\TraeBridge\\mcp-server\\dist\\index.js"],
      "env": {
        "TRAEBRIDGE_WS_PORT": "8765"
      }
    }
  }
}
```

**Option 2: Global npm install (future release)**

```json
{
  "mcpServers": {
    "traebridge": {
      "command": "npx",
      "args": ["traebridge-mcp-server@latest"],
      "env": {
        "TRAEBRIDGE_WS_PORT": "8765"
      }
    }
  }
}
```

---

### 4.3 Security Design

| Layer | Measures |
|-------|----------|
| **Network isolation** | WebSocket listens only on `127.0.0.1`, never exposed to LAN |
| **Connection authorization** | On first connect, extension popup shows a pairing code; MCP Server must present the same code |
| **Action grading** | Read-only actions execute directly; medium-risk actions are logged; high-risk actions require user confirmation in a browser popup |
| **Cookie protection** | `browser_get_cookies` masks values by default (hides middle portion); `browser_set_cookie` always requires confirmation |
| **Domain allowlist** | Users can configure allowed domains in extension settings (e.g., only `*.company.com`) |
| **Audit log** | All tool_calls logged to a local file with timestamp, tool name, argument summary, and execution result |
| **Evaluate sandbox** | `browser_evaluate` blocks access to `chrome.*` APIs by default; blocks `fetch` to non-current origins |

---

### 4.4 Key Differences vs Other Approaches

| Dimension | Traditional closed-source approach | TraeBridge |
|-----------|-----------------------------------|------------|
| **Server** | Closed-source desktop client | Open-source MCP Server |
| **AI client** | Bound to a single AI product | Trae / Claude Desktop / any MCP client |
| **Protocol** | Custom JSON | Standard MCP Protocol + JSON-RPC 2.0 |
| **Cookie management** | None | New get/set/delete cookie tools |
| **Multi-browser support** | Single instance | Session Manager supports multiple simultaneous browsers |
| **Security confirmation** | None | Browser-side popup confirmation for sensitive actions |
| **Domain allowlist** | None | Supported |
| **Audit log** | None | Complete local logging |

---

## 5. Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Browser extension | Chrome Extension MV3 | Standard support, compatible with Chrome/Edge/Brave |
| CDP channel | `chrome.debugger` API | Core of driver-free design; no extra permissions needed |
| MCP Server | TypeScript + `@modelcontextprotocol/sdk` | Official SDK, type-safe |
| WebSocket | `ws` (Node.js) | Mature, stable, high concurrency |
| Input validation | Zod | Deep integration with MCP SDK |
| Bundling | tsup | Zero-config TS bundling |
| Extension UI | Vanilla HTML/CSS/JS | No framework dependency, small footprint |

---

## 6. Development Plan

### Phase 1: Extension MVP ✅ Completed
- [x] manifest.json + background service worker skeleton
- [x] WebSocket Client (connect/reconnect/message routing)
- [x] CDP Controller (attach/detach/sendCommand wrapper)
- [x] Core tools: navigate, snapshot, click, fill, evaluate, screenshot
- [x] Popup UI (connection status + manual connect)

### Phase 2: MCP Server MVP ✅ Completed
- [x] MCP Server initialization (stdio transport)
- [x] WebSocket Server (port 8765)
- [x] Tool Registry (mapped to WebSocket messages)
- [x] 20 MCP Tool implementations
- [x] Trae MCP config integration verified (contract-test.js 30/30 PASS)

### Phase 3: Complete Toolset ✅ Completed
- [x] send_keys, type_text
- [x] network capture (start/stop/list/detail)
- [x] cookie management (get/set)
- [x] pdf, upload, tab management
- [x] cdp raw passthrough

### Phase 4: Security & UX (partially complete, further iterations pending)
- [ ] Sensitive action popup confirmation
- [ ] Domain allowlist
- [ ] Cookie masking display
- [ ] Audit log
- [ ] Pairing code authorization

### Phase 5: Advanced Features (future iterations)
- [ ] Multi-browser session management (code reserved, UI not implemented)
- [ ] Page change event push (navigation, popup, DOM mutation)
- [ ] AX Tree smart compression (pagination/filtering for large pages)
- [ ] Record & replay (save operation sequences as replayable scripts)

---

## 7. Usage Scenario Examples

### Scenario 1: Trae operates an already-logged-in GitHub

```
User: "Grab the CI failure logs from this PR"
Trae: browser_navigate → https://github.com/org/repo/pull/123
Trae: browser_snapshot → get page structure
Trae: browser_click("@e5") → click "Checks" tab
Trae: browser_click("@e12") → click the failed job
Trae: browser_evaluate → extract log text
Trae: analyze logs, suggest fixes
```

### Scenario 2: Batch form filling

```
User: "Enter these 20 records into the admin system"
Trae: browser_navigate → admin system (already logged in)
Trae: loop browser_fill + browser_click to complete entry
Trae: browser_screenshot to confirm submission result
```

### Scenario 3: Scraping data behind login

```
User: "What are the top 10 on Zhihu's hot list?"
Trae: browser_navigate → zhihu.com (using logged-in cookies)
Trae: browser_snapshot → get hot list
Trae: browser_evaluate → extract titles + links
Trae: compile and output
```

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `chrome.debugger` shows a yellow "Debugging" warning bar on tabs | Document it; auto-detach after operations complete |
| Large pages produce huge AX Trees | Implement paginated snapshots + smart filtering (keep only interactive elements) |
| WebSocket disconnect causes tool_call loss | Every message carries a unique ID; timeout returns explicit error; client can retry |
| Extension auto-disabled by browser (MV3 service worker dormancy) | Use `chrome.alarms` keep-alive; the WS connection itself is a keep-alive signal |
| Malicious pages detect debugger via JS | Accept this limitation (inherent to CDP); document applicable scenarios |

---

## 9. Requirements

- Chrome / Edge browser (version ≥ 109, MV3 support)
- Node.js ≥ 18
- Trae IDE (or any MCP-capable client)
- Local port 8765 available

---

## 10. Running Instructions

### 10.1 Install the Extension

1. Open `chrome://extensions/` and enable "Developer mode"
2. Click "Load unpacked" and select the `extension/` directory
3. Click the TraeBridge icon in the browser toolbar, click "Connect" in the popup, and confirm the WebSocket status shows "Connected (ws://127.0.0.1:8765)"

### 10.2 Start the MCP Server

```bash
npx traebridge-mcp-server
# or specify port
TRAEBRIDGE_WS_PORT=8765 npx traebridge-mcp-server
```

### 10.3 Configure Trae MCP

Add the MCP Server configuration in Trae settings (see Section 4.2.4), restart Trae, and the `browser_*` tool family becomes available in AI conversations.

---

## 11. Deployment Checklist

### 11.1 File Structure

```
TraeBridge/
├── extension/                  # Browser extension (MV3)
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Service Worker (WebSocket client + CDP executors)
│   ├── popup.html              # Popup UI
│   ├── popup.js                # Popup logic
│   └── icons/                  # Extension icons (16/32/48/128)
├── mcp-server/                 # MCP Server (Node.js + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── contract-test.js        # Contract consistency tests (30 items)
│   ├── src/
│   │   ├── index.ts            # Entry
│   │   ├── mcp/
│   │   │   ├── server.ts       # MCP Server initialization
│   │   │   ├── types.ts        # Tool definition types
│   │   │   └── tools/          # 14 tool files (20 MCP tools)
│   │   ├── ws/
│   │   │   ├── ws-server.ts    # WebSocket Server
│   │   │   ├── session-manager.ts  # Session management
│   │   │   └── protocol.ts     # JSON-RPC 2.0 protocol
│   │   └── utils/
│   └── dist/                   # Compiled output (tsc)
├── .gitignore
├── LICENSE                     # MIT
├── package.json                # Root script entry
├── logo.png                    # Project logo
└── README.md                   # This document
```

### 11.2 Deployment Steps

**Step 1: Build the MCP Server**

```bash
cd mcp-server
npm install
npm run build        # tsc -> dist/
```

**Step 2: Load the Browser Extension**

1. Open Chrome/Edge, visit `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `TraeBridge/extension/` directory
4. Note the extension ID (e.g., `abcdefghijklmnop`)

**Step 3: Start the MCP Server**

```bash
cd mcp-server
npm start            # node dist/index.js
# or development mode
npm run dev          # tsx src/index.ts
```

**Step 4: Configure Trae MCP**

Edit `~/.trae/mcp.json` (Windows: `%USERPROFILE%\.trae\mcp.json`):

```json
{
  "mcpServers": {
    "traebridge": {
      "command": "node",
      // Note: change the path below to your actual project path
      "args": ["D:\\TraeBridge\\mcp-server\\dist\\index.js"],
      "env": {
        "TRAEBRIDGE_WS_PORT": "8765"
      }
    }
  }
}
```

**Step 5: Verify Connection**

1. Click the TraeBridge icon in the browser toolbar and confirm the status shows "Connected"
2. Open the MCP panel in Trae and confirm `traebridge` shows as connected
3. Run the integration test: `node mcp-server/contract-test.js` (should output 30/30 PASS)

### 11.3 Notes

| Item | Description |
|------|-------------|
| **chrome.debugger warning bar** | After the extension attaches, a yellow "Debugging" warning bar appears at the top of the browser — this is inherent to CDP and disappears automatically after operations complete |
| **Service Worker dormancy** | The MV3 service worker may be suspended by the browser; the extension uses `chrome.alarms` to keep alive every 30 seconds |
| **Port occupied** | Ensure port 8765 is not occupied by another program |
| **Cookie permissions** | The `cookies` permission requires the target domains to be included in `host_permissions` |
| **Multi-browser** | Multiple browser instances can connect simultaneously; the MCP Server routes via sessionId |
