**Language / 语言**: [English](README.en.md) | 简体中文

---

## 项目名称

**TraeBridge — 面向 AI 编程助手的实时浏览器控制桥**

TraeBridge 是一款浏览器扩展（Chrome / Edge Manifest V3），让 Trae（或任意支持 MCP 的 AI 客户端）**无需浏览器驱动（无 Playwright / Puppeteer / Selenium）**，直接通过本机 WebSocket 通道实时操控**用户当前已打开、已登录、带有完整 Cookie 会话**的浏览器页面。

---

## 一、项目背景与需求

### 1.1 现状痛点

| 场景 | 传统方案 | 痛点 |
|------|----------|------|
| Trae 自动化操作网页 | Playwright / Puppeteer 启动新浏览器实例 | 新实例没有用户 Cookie，需要重新扫码/登录；每次启动开销大 |
| 操作已登录的系统后台 | 手动导出 Cookie 注入或 CDP attach | 流程繁琐、易失效、安全性差 |
| AI 实时读取当前页面信息 | 截图 + OCR / 复制粘贴 | 延迟高、信息丢失、无法结构化 |

**核心诉求：** AI 需要像"远程之手"一样，直接接管用户**正在使用**的那个浏览器会话。

### 1.2 需求定义

开发一个浏览器插件，满足以下需求：

- **R1 免驱动操控**：不依赖任何浏览器自动化框架，通过 Chrome Extension API + CDP（Chrome DevTools Protocol）直接在已运行的浏览器中执行操作。
- **R2 会话继承**：天然使用当前浏览器配置文件的 Cookie、LocalStorage、登录态，**零登录成本**。
- **R3 实时双向通信**：插件与本机 MCP Server 通过 WebSocket 保持长连接，Trae 调用 MCP 工具 → MCP Server → WebSocket → 插件 → 执行 → 结果原路返回，端到端延迟 < 100ms。
- **R4 结构化页面感知**：利用 CDP Accessibility Tree（AX Tree）生成页面可交互元素的语义化快照（而非原始 HTML dump），让 AI 高效理解页面结构。
- **R5 安全可控**：连接需要用户显式授权；敏感操作（如提交表单、跳转支付页）需二次确认；通信仅限本机回环地址。
- **R6 标签页管理**：支持多标签页发现、切换、关闭、分组，AI 可并行操作多个页面。

---

## 二、竞品对比：Playwright Extension / Kimi WebBridge / TraeBridge

### 2.1 架构对比

| 维度 | Playwright Extension | Kimi WebBridge | TraeBridge（本项目） |
|------|---------------------|----------------|---------------------|
| **架构模式** | 浏览器插件 + 外部 Node.js 进程 | 纯浏览器插件（MV3） | 纯浏览器插件（MV3）+ 轻量 MCP Server |
| **通信方式** | WebSocket + CDP | Native Messaging（绑定桌面端） | WebSocket + JSON-RPC 2.0（MCP 标准） |
| **外部依赖** | 必须安装 Node.js + Playwright 内核 | 必须安装 Kimi 桌面客户端 | 仅需 Node.js（MCP Server 一键启动） |
| **AI 接入** | 无内置 AI 通道，需自行封装 | 仅支持 Kimi 自家 AI | **任意 MCP 客户端**（Trae / Claude Desktop / Cursor 等） |
| **开源程度** | 开源（Microsoft） | 闭源（Kimi 桌面端） | **完全开源** |
| **协议标准** | 私有协议 | 私有协议 | **标准 MCP Protocol**，生态互通 |

### 2.2 功能对比

| 功能 | Playwright Extension | Kimi WebBridge | TraeBridge | 备注 |
|------|:----:|:----:|:----:|------|
| 页面导航 / 刷新 | ✅ | ✅ | ✅ | |
| 元素点击（DOM 级） | ✅ | ✅ | ✅ | |
| 元素点击（物理级，绕过反爬） | ❌ | ✅ | ✅ | Input.dispatchMouseEvent |
| 表单填写 / 文本输入 | ✅ | ✅ | ✅ | |
| 按键 / 组合键发送 | ✅ | ✅ | ✅ | |
| 任意 JavaScript 执行 | ✅ | ✅ | ✅ | |
| 截图（整页 / 元素） | ✅ | ✅ | ✅ | |
| 页面另存为 PDF | ❌ | ✅ | ✅ | |
| Cookie 读取 | ❌ | ✅ | ✅ | |
| Cookie 写入 / 删除 | ❌ | ❌ | ✅ | |
| 文件上传 | ✅ | ❌ | ✅ | |
| **网络请求实时监听** | ❌ | ❌ | ✅ | Network.enable + 事件流 |
| 标签页管理（列表/切换/关闭/分组） | ✅ | ✅ | ✅ | |
| **语义快照（AX Tree）** | ❌ | ✅ | ✅ | Accessibility.getFullAXTree |
| CDP 原始命令透传 | ✅ | ❌ | ✅ | 逃生舱，无限扩展 |
| **Cookie 脱敏显示** | ❌ | ❌ | 🚧 | Phase 4 安全功能 |
| **敏感操作二次确认** | ❌ | ❌ | 🚧 | Phase 4 安全功能 |
| **域名白名单** | ❌ | ❌ | 🚧 | Phase 4 安全功能 |
| **审计日志** | ❌ | ❌ | 🚧 | Phase 4 安全功能 |

> ✅ 已实现　🚧 代码结构已预留，待 Phase 4 迭代　❌ 不支持

**结论：Playwright Extension 与 Kimi WebBridge 已有的功能，TraeBridge 全部具备，并额外提供 Cookie 管理、网络抓包、CDP 透传、安全审计等企业级能力。**

### 2.3 Token 消耗对比（AI 操作网页的关键指标）

| 方案 | 页面感知方式 | 单次操作典型 Token 消耗 | 说明 |
|------|------------|----------------------|------|
| **截图驱动**（传统方案） | base64 PNG 图片 | **20万 – 80万** | 1920×1080 截图经 base64 编码后约 70万–270万字符 |
| **TraeBridge 语义快照** | AX Tree 文本结构 | **500 – 5,000** | 只返回可交互元素的 role/name/ref，AI 直接理解 |
| TraeBridge 精确操作 | `@eN` 引用 + JS 求值 | **100 – 2,000** | 无需视觉确认，直接通过引用操作 |

**TraeBridge 的 Token 优化策略：**

1. **语义快照优先**：`browser_snapshot` 返回文本化 AX Tree，比截图节省 **99%+** Token
2. **精准元素引用**：`@eN` 引用直接定位元素，无需反复截图确认坐标
3. **截图是备选而非默认**：仅在以下场景才使用 `browser_screenshot`：
   - 验证码 / 图形识别
   - 视觉布局回归测试
   - 语义快照无法定位的极端复杂页面

```
✅ 推荐流程（低 Token）：
   browser_snapshot → AI 分析 → browser_click(@e14) → browser_evaluate 验证
   总消耗：约 1,000–3,000 tokens

❌ 应避免流程（高 Token）：
   browser_screenshot → AI 视觉分析 → browser_click(x, y) → 再截图确认
   总消耗：约 400,000+ tokens
```

### 2.4 TraeBridge 的核心优势总结

| 优势 | 说明 |
|------|------|
| **免驱动 + 会话继承** | 直接操作用户当前浏览器，Cookie / 登录态零成本复用，无需 Playwright / Puppeteer / Selenium |
| **Token 效率最优** | 语义快照（AX Tree）替代截图，单次操作节省 99%+ Token，适合高频 AI 交互 |
| **协议标准化** | 基于 MCP Protocol，一次开发，任意 AI 客户端（Trae / Claude Desktop / Cursor）即插即用 |
| **能力全覆盖** | 覆盖 Playwright Extension 与 Kimi WebBridge 全部功能，并独有网络抓包、Cookie 管理、CDP 透传 |
| **安全可控** | 敏感操作确认、域名白名单、Cookie 脱敏、审计日志（Phase 4 陆续落地） |
| **完全开源** | 代码透明，可自由扩展、审计、定制，无黑盒依赖 |
| **后台静默运行，不抢占用户桌面** | 支持 Windows 多桌面（Virtual Desktop）：把受控浏览器窗口放到桌面 2，桌面 1 继续给用户办公使用。AI 通过物理级模拟点击、网络抓包等方式在后台查询资料，**完全不影响桌面 1 用户正在使用的浏览器**（详见 2.5 节） |

### 2.5 场景：Windows 多桌面下的后台浏览器自动化

TraeBridge 的物理级点击（`Input.dispatchMouseEvent`）与网络抓包（`Network.enable`）能力，使其天然适合**后台静默自动化**场景——AI 操作的浏览器窗口可以完全独立于用户当前正在使用的桌面环境。

```
桌面 1（用户办公）                    桌面 2（AI 后台操作）
┌─────────────────────────┐          ┌─────────────────────────┐
│  用户在用的 Edge/Chrome  │          │  受控 Edge 窗口          │
│  ─ 正常浏览、办公        │   互不相干 │  ─ AI 自动搜索资料      │
│  ─ 不受任何干扰          │          │  ─ 自动抓取网页数据     │
│                         │          │  ─ 自动填表、点击       │
└─────────────────────────┘          └─────────────────────────┘
         ▲                                    ▲
         │  Trae 下发命令                     │  chrome.debugger
         │  (browser_* 工具)                  │  CDP 物理级操作
         └────────────────────────────────────┘
              全程无窗口抢占、无焦点冲突、无鼠标干扰
```

**典型工作流：**

1. 在桌面 2 打开一个 Edge 窗口，加载 TraeBridge 扩展并连接 MCP Server
2. 用户在桌面 1 正常办公，使用自己日常浏览器
3. 通过 Trae 下发指令，例如："帮我搜索某技术方案并抓取前三条结果"
4. AI 在桌面 2 的受控浏览器中完成：导航 → 快照 → 点击 → 抓包 → 提取数据
5. 结果返回给 Trae，用户桌面 1 的体验完全不受影响

**优势：**
- **零干扰**：不抢占鼠标焦点、不弹出窗口、不切换桌面
- **并行工作**：用户办公与 AI 查询资料同时进行，互不阻塞
- **会话隔离**：桌面 2 的浏览器可保持独立的登录态（Cookie），与用户日常浏览器完全隔离

---

## 三、总体架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     Trae IDE (AI 客户端)                      │
│              通过 stdio / streamable HTTP 调用 MCP             │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              TraeBridge MCP Server (Node.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │  MCP Tool    │  │  Session     │  │  WebSocket Server    ││
│  │  Registry    │◄─┤  Manager     │◄─┤  (ws://127.0.0.1)   ││
│  │  (17+ tools) │  │  (tab路由)    │  │  端口: 8765          ││
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
│  │  (连接控制)   │  │  Interceptor │  │  Snapshot Builder    ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
└──────────────────────┬───────────────────────────────────────┘
                       │ chrome.debugger.attach
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              用户当前浏览器 (已登录 / 有 Cookie)                │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│         │  Tab 1  │  │  Tab 2  │  │  Tab N  │                │
│         │ (知乎)   │  │ (GitHub)│  │ (后台)   │                │
│         └─────────┘  └─────────┘  └─────────┘                │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、核心模块设计

### 4.1 浏览器插件端（Extension）

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

#### 4.1.2 核心组件

| 组件 | 职责 | 关键实现 |
|------|------|----------|
| **WS Client** | 与 MCP Server 保持 WebSocket 长连接 | 断线指数退避重连；心跳 ping/pong；消息序列化 JSON-RPC 2.0 |
| **Tool Dispatcher** | 接收 tool_call，路由到对应执行器 | 注册表模式：`Map<toolName, executor>` |
| **CDP Controller** | 管理 `chrome.debugger` 生命周期 | 单例 attach/detach；tab 关闭自动 detach；超时保护 |
| **AX Snapshot Builder** | 构建语义化页面快照 | `Accessibility.getFullAXTree` → 过滤 `none/generic` → 生成 `@eN` 引用 |
| **Confirm Interceptor** | 敏感操作二次确认 | `chrome.notifications` + 用户点击确认后才执行 |
| **Popup UI** | 连接状态展示、手动连接/断开、当前 session 列表 | 原生 HTML + JS，无框架依赖 |

#### 4.1.3 CDP 工具执行器

每个工具是一个 class，实现 `execute(args)` 接口：

```
CDPExecutor
├── NavigateExecutor      → Page.navigate / Page.reload
├── SnapshotExecutor      → Accessibility.getFullAXTree → 语义树
├── ClickExecutor         → DOM.resolveNode + Runtime.callFunctionOn (DOM级)
├── MouseClickExecutor    → DOM.getBoxModel + Input.dispatchMouseEvent (物理级)
├── FillExecutor          → Runtime.callFunctionOn (原生 setter + input/change 事件)
├── TypeExecutor          → Input.insertText
├── SendKeysExecutor      → Input.dispatchKeyEvent (组合键、功能键)
├── EvaluateExecutor      → Runtime.evaluate (自定义 JS)
├── ScreenshotExecutor    → Page.captureScreenshot (支持 clip 元素区域)
├── NetworkExecutor       → Network.enable / disable / list / detail
├── CookieExecutor        → Network.getCookies / setCookies / deleteCookies
├── PDFExecutor           → Page.printToPDF
├── UploadExecutor        → DOM.setFileInputFiles
├── TabManagerExecutor    → tabs.query / create / remove / group / activate
└── CDPRawExecutor        → 透传任意 CDP 方法 (escape hatch)
```

#### 4.1.4 连接状态机

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

### 4.2 MCP Server 端（Node.js + TypeScript）

#### 4.2.1 项目结构

```
traebridge-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 入口：启动 MCP Server + WS Server
│   ├── mcp/
│   │   ├── server.ts          # MCP Server 初始化 (streamable HTTP + stdio)
│   │   ├── tools/             # 每个 MCP Tool 一个文件
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
│   │   └── schemas/           # Zod 输入校验
│   ├── ws/
│   │   ├── ws-server.ts       # WebSocket Server (端口 8765)
│   │   ├── session-manager.ts # 管理多个浏览器连接 (支持多浏览器实例)
│   │   └── protocol.ts        # JSON-RPC 2.0 消息类型定义
│   └── utils/
│       ├── logger.ts
│       └── config.ts
└── dist/                       # 编译输出
```

#### 4.2.2 MCP Tool 定义（暴露给 Trae 的工具列表）

| MCP Tool | 说明 | 危险等级 |
|----------|------|----------|
| `browser_navigate` | 导航到 URL（支持新标签页 / 当前页） | 低 |
| `browser_snapshot` | 获取当前页 AX Tree 语义快照 | 只读 |
| `browser_click` | 点击元素（CSS selector 或 `@eN` ref） | 中 |
| `browser_fill` | 填充输入框（支持 contenteditable） | 中 |
| `browser_type` | 在当前焦点元素输入文本 | 中 |
| `browser_send_keys` | 发送按键 / 组合键（Enter, Ctrl+A, F5...） | 中 |
| `browser_evaluate` | 在页面执行任意 JavaScript | 高 |
| `browser_screenshot` | 截图（整页或指定元素） | 只读 |
| `browser_network_start` | 开始网络抓包 | 只读 |
| `browser_network_list` | 列出已捕获请求 | 只读 |
| `browser_network_detail` | 获取请求/响应详情 | 只读 |
| `browser_network_stop` | 停止抓包 | 只读 |
| `browser_get_cookies` | 获取当前域 Cookie | 只读 |
| `browser_set_cookie` | 设置 Cookie | 高 |
| `browser_save_as_pdf` | 页面另存为 PDF | 低 |
| `browser_upload` | 上传文件到 file input | 高 |
| `browser_list_tabs` | 列出所有标签页 | 只读 |
| `browser_switch_tab` | 切换到指定标签页 | 低 |
| `browser_close_tab` | 关闭标签页 | 中 |
| `browser_cdp` | 透传任意 CDP 命令 | 高 |

#### 4.2.3 通信协议（JSON-RPC 2.0 over WebSocket）

**MCP Server → Extension（tool_call）：**

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

**Extension → MCP Server（tool_result）：**

```json
{
  "jsonrpc": "2.0",
  "id": "req-uuid-001",
  "result": {
    "success": true,
    "tag": "BUTTON",
    "text": "提交"
  }
}
```

**Extension → MCP Server（事件推送）：**

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

#### 4.2.4 安装方式

**方式一：本地开发（推荐，当前仓库）**

```json
// Trae MCP 配置 (~/.trae/mcp.json 或项目 .trae/mcp.json)
{
  "mcpServers": {
    "traebridge": {
      "command": "node",
      // 注意：将下面的路径改成你自己项目的实际路径
      "args": ["D:\\TraeBridge\\mcp-server\\dist\\index.js"],
      "env": {
        "TRAEBRIDGE_WS_PORT": "8765"
      }
    }
  }
}
```

**方式二：npm 全局安装（未来发布）**

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

### 4.3 安全设计

| 层面 | 措施 |
|------|------|
| **网络隔离** | WebSocket 只监听 `127.0.0.1`，不暴露到局域网 |
| **连接授权** | 首次连接时插件弹窗显示配对码，MCP Server 需携带相同配对码 |
| **操作分级** | 只读操作直接执行；中危操作记录日志；高危操作需用户在浏览器弹窗中点击确认 |
| **Cookie 保护** | `browser_get_cookies` 默认脱敏（隐藏 value 中间部分）；`browser_set_cookie` 必须确认 |
| **域名白名单** | 用户可在插件设置中配置允许 AI 操作的域名列表（如仅允许 `*.company.com`） |
| **审计日志** | 所有 tool_call 记录到本地文件，含时间戳、工具名、参数摘要、执行结果 |
| **evaluate 沙箱** | `browser_evaluate` 默认禁止访问 `chrome.*` API；禁止 `fetch` 到非当前域 |

---

### 4.4 与其他方案的关键差异

| 维度 | 传统闭源方案 | TraeBridge |
|------|----------------|------------|
| **服务端** | 闭源桌面客户端 | 开源 MCP Server |
| **AI 客户端** | 单一 AI 产品绑定 | Trae / Claude Desktop / 任意 MCP 客户端 |
| **协议** | 自定义 JSON | 标准 MCP Protocol + JSON-RPC 2.0 |
| **Cookie 管理** | 无 | 新增 get/set/delete cookies 工具 |
| **多浏览器支持** | 单实例 | Session Manager 支持多浏览器同时连接 |
| **安全确认** | 无 | 敏感操作浏览器端弹窗确认 |
| **域名白名单** | 无 | 支持 |
| **审计日志** | 无 | 本地完整日志 |

---

## 五、技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 浏览器插件 | Chrome Extension MV3 | 标准支持，兼容 Chrome/Edge/Brave |
| CDP 通道 | `chrome.debugger` API | 免驱动核心，无需额外权限 |
| MCP Server | TypeScript + `@modelcontextprotocol/sdk` | 官方 SDK，类型安全 |
| WebSocket | `ws` (Node.js) | 成熟稳定，支持高并发 |
| 输入校验 | Zod | 与 MCP SDK 深度集成 |
| 打包 | tsup | 零配置 TS 打包 |
| 插件 UI | 原生 HTML/CSS/JS | 无框架依赖，体积小 |

---

## 六、开发计划

### Phase 1：插件端 MVP ✅ 已完成
- [x] manifest.json + background service worker 骨架
- [x] WebSocket Client（连接/断线重连/消息路由）
- [x] CDP Controller（attach/detach/sendCommand 封装）
- [x] 核心工具：navigate, snapshot, click, fill, evaluate, screenshot
- [x] Popup UI（连接状态 + 手动连接）

### Phase 2：MCP Server MVP ✅ 已完成
- [x] MCP Server 初始化（stdio transport）
- [x] WebSocket Server（端口 8765）
- [x] Tool Registry（映射到 WebSocket 消息）
- [x] 20 个 MCP Tool 实现
- [x] Trae MCP 配置集成验证（contract-test.js 30/30 PASS）

### Phase 3：完整工具集 ✅ 已完成
- [x] send_keys, type_text
- [x] network 抓包（start/stop/list/detail）
- [x] cookies 管理（get/set）
- [x] pdf, upload, tabs 管理
- [x] cdp raw 透传

### Phase 4：安全与体验（部分完成，待后续迭代）
- [ ] 敏感操作弹窗确认
- [ ] 域名白名单
- [ ] Cookie 脱敏显示
- [ ] 审计日志
- [ ] 配对码授权机制

### Phase 5：高级功能（待后续迭代）
- [ ] 多浏览器 Session 管理（代码已预留，UI 未实现）
- [ ] 页面变化事件推送（导航、弹窗、DOM 变更）
- [ ] AX Tree 智能压缩（大页面分页/过滤）
- [ ] 录制回放（操作序列保存为可重放脚本）

---

## 七、使用场景示例

### 场景 1：Trae 自动操作已登录的 GitHub

```
用户: "帮我把这个 PR 的 CI 失败日志抓出来"
Trae: 调用 browser_navigate → https://github.com/org/repo/pull/123
Trae: 调用 browser_snapshot → 获取页面结构
Trae: 调用 browser_click("@e5") → 点击 "Checks" 标签
Trae: 调用 browser_click("@e12") → 点击失败的 job
Trae: 调用 browser_evaluate → 提取日志文本
Trae: 分析日志，给出修复建议
```

### 场景 2：批量填写表单

```
用户: "把这 20 条数据录入到后台系统"
Trae: browser_navigate → 后台系统（已登录）
Trae: 循环 browser_fill + browser_click 完成录入
Trae: browser_screenshot 确认提交结果
```

### 场景 3：抓取需要登录才能访问的数据

```
用户: "帮我看看知乎热榜前 10 都是什么"
Trae: browser_navigate → zhihu.com（使用已登录 Cookie）
Trae: browser_snapshot → 获取热榜列表
Trae: browser_evaluate → 提取标题 + 链接
Trae: 整理输出
```

---

## 八、风险与应对

| 风险 | 应对 |
|------|------|
| `chrome.debugger` 会在标签页显示"正在调试"黄色警告条 | 在文档中说明；操作完成后自动 detach |
| 大页面 AX Tree 非常庞大 | 实现分页快照 + 智能过滤（只保留可交互元素） |
| WebSocket 断连导致 tool_call 丢失 | 每条消息带唯一 ID；超时未响应返回明确错误；客户端可重试 |
| 插件被浏览器自动停用（MV3 service worker 休眠） | 使用 `chrome.alarms` 保活；WS 连接本身也是保活信号 |
| 恶意网页通过 JS 检测 debugger | 接受此限制（CDP 的固有特征）；文档中说明适用场景 |

---

## 九、运行条件

- Chrome / Edge 浏览器（版本 ≥ 109，支持 MV3）
- Node.js ≥ 18
- Trae IDE（或任意支持 MCP 的客户端）
- 本机 8765 端口可用

---

## 十、运行说明

### 10.1 安装插件

1. 打开 `chrome://extensions/`，开启"开发者模式"
2. 点击"加载已解压的扩展程序"，选择 `extension/` 目录
3. 点击浏览器工具栏中的 TraeBridge 图标，在弹窗中点击"连接"按钮，确认 WebSocket 状态显示为"已连接（ws://127.0.0.1:8765）"

### 10.2 启动 MCP Server

```bash
npx traebridge-mcp-server
# 或指定端口
TRAEBRIDGE_WS_PORT=8765 npx traebridge-mcp-server
```

### 10.3 配置 Trae MCP

在 Trae 设置中添加 MCP Server 配置（见 4.2.4 节），重启 Trae 后即可在 AI 对话中使用 `browser_*` 系列工具。

---

## 十一、部署清单

### 11.1 文件结构

```
TraeBridge/
├── extension/                  # 浏览器插件（MV3）
│   ├── manifest.json           # 插件清单
│   ├── background.js           # Service Worker（WebSocket 客户端 + CDP 执行器）
│   ├── popup.html              # 弹窗 UI
│   ├── popup.js                # 弹窗逻辑
│   └── icons/                  # 插件图标（16/32/48/128）
├── mcp-server/                 # MCP Server（Node.js + TypeScript）
│   ├── package.json
│   ├── tsconfig.json
│   ├── contract-test.js        # 契约一致性测试（30 项）
│   ├── src/
│   │   ├── index.ts            # 入口
│   │   ├── mcp/
│   │   │   ├── server.ts       # MCP Server 初始化
│   │   │   ├── types.ts        # 工具定义类型
│   │   │   └── tools/          # 14 个工具文件（20 个 MCP 工具）
│   │   ├── ws/
│   │   │   ├── ws-server.ts    # WebSocket Server
│   │   │   ├── session-manager.ts  # 会话管理
│   │   │   └── protocol.ts     # JSON-RPC 2.0 协议
│   │   └── utils/
│   └── dist/                   # 编译输出（tsc）
├── .gitignore
├── LICENSE                     # MIT
├── package.json                # 根目录脚本入口
├── logo.png                    # 项目 Logo
└── README.md                   # 本文档
```

### 11.2 部署步骤

**Step 1：编译 MCP Server**

```bash
cd mcp-server
npm install
npm run build        # tsc -> dist/
```

**Step 2：加载浏览器插件**

1. 打开 Chrome/Edge，访问 `chrome://extensions/`（或 `edge://extensions/`）
2. 开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序"，选择 `TraeBridge/extension/` 目录
4. 记住插件 ID（例如 `abcdefghijklmnop`）

**Step 3：启动 MCP Server**

```bash
cd mcp-server
npm start            # node dist/index.js
# 或开发模式
npm run dev          # tsx src/index.ts
```

**Step 4：配置 Trae MCP**

编辑 `~/.trae/mcp.json`（Windows: `%USERPROFILE%\.trae\mcp.json`）：

```json
{
  "mcpServers": {
    "traebridge": {
      "command": "node",
      // 注意：将下面的路径改成你自己项目的实际路径
      "args": ["D:\\TraeBridge\\mcp-server\\dist\\index.js"],
      "env": {
        "TRAEBRIDGE_WS_PORT": "8765"
      }
    }
  }
}
```

**Step 5：验证连接**

1. 点击浏览器工具栏中的 TraeBridge 图标，确认状态为"已连接"
2. 在 Trae 中打开 MCP 面板，确认 `traebridge` 显示为已连接
3. 运行集成测试：`node mcp-server/contract-test.js`（应输出 30/30 PASS）

### 11.3 注意事项

| 事项 | 说明 |
|------|------|
| **chrome.debugger 警告条** | 插件 attach 后浏览器顶部会显示"正在调试"黄色警告条，这是 CDP 的固有特征，操作完成后自动消失 |
| **Service Worker 休眠** | MV3 SW 可能被浏览器自动休眠，插件使用 `chrome.alarms` 每 30 秒保活 |
| **端口占用** | 确保 8765 端口未被其他程序占用 |
| **Cookie 权限** | `cookies` 权限需要在 `host_permissions` 中包含目标域名 |
| **多浏览器** | 支持多个浏览器实例同时连接，MCP Server 通过 sessionId 路由 |
