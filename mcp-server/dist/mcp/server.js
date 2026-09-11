"use strict";
/**
 * MCP server (stdio transport) that exposes the browser extension tools.
 *
 * Flow of a tool call:
 *   MCP client --(stdio)--> McpServer --tool_call(JSON-RPC over WS)--> extension
 *   extension --result/error--> SessionManager --> McpServer --stdio--> MCP client
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpServer = createMcpServer;
exports.startMcpServer = startMcpServer;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const logger_1 = require("../utils/logger");
// --- Tool definitions (18 tools across 14 files) ----------------------
const navigate_1 = require("./tools/navigate");
const snapshot_1 = require("./tools/snapshot");
const click_1 = require("./tools/click");
const fill_1 = require("./tools/fill");
const type_text_1 = require("./tools/type_text");
const send_keys_1 = require("./tools/send_keys");
const evaluate_1 = require("./tools/evaluate");
const screenshot_1 = require("./tools/screenshot");
const network_1 = require("./tools/network");
const cookies_1 = require("./tools/cookies");
const pdf_1 = require("./tools/pdf");
const upload_1 = require("./tools/upload");
const tabs_1 = require("./tools/tabs");
const cdp_1 = require("./tools/cdp");
const ALL_TOOLS = [
    navigate_1.navigateTool,
    snapshot_1.snapshotTool,
    click_1.clickTool,
    fill_1.fillTool,
    type_text_1.typeTextTool,
    send_keys_1.sendKeysTool,
    evaluate_1.evaluateTool,
    screenshot_1.screenshotTool,
    network_1.networkStartTool,
    network_1.networkStopTool,
    network_1.networkListTool,
    network_1.networkDetailTool,
    cookies_1.getCookiesTool,
    cookies_1.setCookieTool,
    pdf_1.saveAsPdfTool,
    upload_1.uploadTool,
    tabs_1.listTabsTool,
    tabs_1.switchTabTool,
    tabs_1.closeTabTool,
    cdp_1.cdpTool,
];
function toMcpContent(payload) {
    const content = [];
    const data = payload.data;
    // Screenshots / PDFs: base64 image or pdf payload -> typed content block.
    const base64 = (data?.base64 ?? data?.data);
    const mimeType = (data?.mimeType ?? data?.mime);
    if (typeof base64 === "string" && base64.length > 0) {
        if (typeof mimeType === "string" && mimeType.startsWith("image/")) {
            content.push({ type: "image", data: base64, mimeType });
        }
        else {
            content.push({
                type: "resource",
                resource: {
                    uri: `data:${mimeType ?? "application/octet-stream"};base64,${base64}`,
                    blob: base64,
                    mimeType: mimeType ?? "application/octet-stream",
                },
            });
        }
    }
    // Human readable text.
    if (typeof payload.text === "string" && payload.text.length > 0) {
        content.push({ type: "text", text: payload.text });
    }
    else if (data !== undefined && content.length === 0) {
        content.push({ type: "text", text: JSON.stringify(data, null, 2) });
    }
    if (content.length === 0) {
        content.push({ type: "text", text: "OK" });
    }
    return { content };
}
async function createMcpServer(sessionManager) {
    const server = new mcp_js_1.McpServer({
        name: "traebridge-mcp-server",
        version: "1.0.0",
    });
    for (const tool of ALL_TOOLS) {
        server.registerTool(tool.name, {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }, (async (rawArgs) => {
            // 1. Validate input with Zod.
            const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
            if (!parsed.success) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Invalid arguments for ${tool.name}: ${parsed.error.message}`);
            }
            // 2. Friendly error when no extension is connected.
            if (!sessionManager.hasSessions()) {
                throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, "No browser extension is connected to the TraeBridge MCP server. " +
                    "Open the browser with the TraeBridge extension installed (it must connect to ws://127.0.0.1:8765) and retry.");
            }
            // 3. Forward the call to the extension and wait for the result.
            //    mapArgs adapts MCP-side arguments to the extension-side shape.
            const extArgs = tool.mapArgs
                ? tool.mapArgs(parsed.data)
                : parsed.data;
            let payload;
            try {
                payload = await sessionManager.callTool(tool.name, extArgs);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger_1.logger.error(`Tool ${tool.name} failed: ${message}`);
                throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, message);
            }
            return toMcpContent(payload);
        }));
    }
    logger_1.logger.info(`Registered ${ALL_TOOLS.length} MCP tools`);
    return server;
}
/** Connect the MCP server to the stdio transport and start listening. */
async function startMcpServer(sessionManager) {
    const server = await createMcpServer(sessionManager);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    logger_1.logger.info("MCP server connected via stdio transport");
    return server;
}
//# sourceMappingURL=server.js.map