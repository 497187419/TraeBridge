/**
 * 集成测试：验证 MCP Server 与 Extension 的契约一致性。
 * 模拟 extension 端 background.js 的 handleMessage 解析逻辑，
 * 确认 MCP 端发送的工具名（去前缀）和参数（mapArgs 映射）能被 extension 正确识别。
 */
const { spawn } = require("child_process");
const WebSocket = require("ws");

const PORT = 8765;
let passed = 0, failed = 0;
const failures = [];

function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? " :: " + detail : ""}`); }
}

// ---- 模拟 extension 端 background.js 的 handleMessage 解析 ----
// 这是从 background.js 摘录的真实解析逻辑，必须保持同步。
const extensionTools = new Set([
  "navigate","snapshot","click","fill","type","send_keys","evaluate",
  "screenshot","network_start","network_list","network_detail","network_stop",
  "get_cookies","set_cookie","save_as_pdf","upload","list_tabs","switch_tab",
  "close_tab","cdp",
]);

function parseExtensionMessage(msg) {
  const params = msg.params || {};
  const toolName = msg.method === "tool_call"
    ? (params.name || params.tool)
    : (msg.tool || params.name);
  const toolArgs = msg.method === "tool_call"
    ? (params.args || {})
    : (params || msg.args || {});
  return { toolName, toolArgs };
}

async function main() {
  const server = spawn("node", ["dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });
  await new Promise(r => setTimeout(r, 1200));

  // 模拟 extension 连接 WS，校验收到的 tool_call
  const receivedCalls = [];
  const ext = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise((res, rej) => { ext.on("open", res); ext.on("error", rej); });

  ext.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "tool_call") {
      receivedCalls.push(msg);
      const { toolName } = parseExtensionMessage(msg);
      // extension 校验工具名存在
      const known = extensionTools.has(toolName);
      ext.send(JSON.stringify({
        jsonrpc: "2.0", id: msg.id,
        result: known
          ? { data: { success: true, tool: toolName }, text: `ok ${toolName}` }
          : { data: { success: false }, text: `unknown ${toolName}` },
      }));
    } else if (msg.method === "ping") {
      ext.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: "pong" }));
    }
  });

  // MCP 客户端 stdio
  let buf = "";
  const pending = new Map();
  server.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      try { const msg = JSON.parse(line); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } } catch {}
    }
  });
  let nextId = 1;
  const mcpRequest = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout")); } }, 5000);
  });
  const mcpNotify = (method, params) => server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

  await mcpRequest("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } });
  mcpNotify("notifications/initialized", {});

  console.log("\n=== 工具名前缀剥离验证（MCP browser_xxx -> extension xxx）===");
  const cases = [
    ["browser_navigate", { url: "https://example.com" }, "navigate"],
    ["browser_snapshot", {}, "snapshot"],
    ["browser_click", { selector: "@e3" }, "click"],
    ["browser_fill", { selector: "@e1", value: "hi" }, "fill"],
    ["browser_type", { text: "hello" }, "type"],
    ["browser_evaluate", { code: "1+1" }, "evaluate"],
    ["browser_screenshot", {}, "screenshot"],
    ["browser_list_tabs", {}, "list_tabs"],
    ["browser_close_tab", { tabId: 5 }, "close_tab"],
    ["browser_cdp", { method: "Page.reload" }, "cdp"],
  ];
  for (const [mcpName, args, expectedExt] of cases) {
    receivedCalls.length = 0;
    const res = await mcpRequest("tools/call", { name: mcpName, arguments: args });
    const text = res.result?.content?.[0]?.text ?? "";
    const call = receivedCalls[0];
    const parsed = call ? parseExtensionMessage(call) : { toolName: null };
    assert(parsed.toolName === expectedExt, `${mcpName} -> ${expectedExt}`, `got ${parsed.toolName}`);
    assert(text.includes("ok"), `${mcpName} extension accepted`);
  }

  console.log("\n=== send_keys 参数映射（array -> 空格分隔字符串）===");
  receivedCalls.length = 0;
  await mcpRequest("tools/call", { name: "browser_send_keys", arguments: { keys: ["Control", "a", "Enter"] } });
  let call = receivedCalls[0];
  let parsedArgs = parseExtensionMessage(call).toolArgs;
  assert(parsedArgs.keys === "Control a Enter", "send_keys joins array", `got "${parsedArgs.keys}"`);

  console.log("\n=== network captureId 参数映射 ====");
  receivedCalls.length = 0;
  await mcpRequest("tools/call", { name: "browser_network_start", arguments: {} });
  call = receivedCalls[0];
  parsedArgs = parseExtensionMessage(call).toolArgs;
  assert(!("captureId" in parsedArgs), "network_start drops MCP-only params", JSON.stringify(parsedArgs));
  assert(!("filter" in parsedArgs), "network_start drops filter/includeBodies");

  receivedCalls.length = 0;
  await mcpRequest("tools/call", { name: "browser_network_list", arguments: { captureId: "cap-x", filter: "api", limit: 10 } });
  call = receivedCalls[0];
  parsedArgs = parseExtensionMessage(call).toolArgs;
  assert(!("captureId" in parsedArgs), "network_list drops captureId");
  assert(parsedArgs.filter === "api", "network_list forwards filter", JSON.stringify(parsedArgs));
  assert(parsedArgs.limit === 10, "network_list forwards limit");

  receivedCalls.length = 0;
  await mcpRequest("tools/call", { name: "browser_network_detail", arguments: { captureId: "cap-x", requestId: "123.45" } });
  call = receivedCalls[0];
  parsedArgs = parseExtensionMessage(call).toolArgs;
  assert(!("captureId" in parsedArgs), "network_detail drops captureId");
  assert(parsedArgs.requestId === "123.45", "network_detail forwards requestId");

  console.log("\n=== cdp 参数映射（去 sessionId）===");
  receivedCalls.length = 0;
  await mcpRequest("tools/call", { name: "browser_cdp", arguments: { method: "Page.reload", params: { ignoreCache: true } } });
  call = receivedCalls[0];
  parsedArgs = parseExtensionMessage(call).toolArgs;
  assert(parsedArgs.method === "Page.reload", "cdp forwards method");
  assert(!("sessionId" in parsedArgs), "cdp drops sessionId");

  console.log(`\n========== RESULT: ${passed} passed, ${failed} failed ==========`);
  if (failures.length) console.log("Failures:", failures.join(" | "));
  ext.close(); server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
