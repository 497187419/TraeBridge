/**
 * MCP server (stdio transport) that exposes the browser extension tools.
 *
 * Flow of a tool call:
 *   MCP client --(stdio)--> McpServer --tool_call(JSON-RPC over WS)--> extension
 *   extension --result/error--> SessionManager --> McpServer --stdio--> MCP client
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { SessionManager } from "../ws/session-manager";
import type { ToolResultPayload } from "../ws/protocol";
import type { ToolDefinition } from "./types";
import { logger } from "../utils/logger";

// --- Tool definitions (18 tools across 14 files) ----------------------
import { navigateTool } from "./tools/navigate";
import { snapshotTool } from "./tools/snapshot";
import { clickTool } from "./tools/click";
import { fillTool } from "./tools/fill";
import { typeTextTool } from "./tools/type_text";
import { sendKeysTool } from "./tools/send_keys";
import { evaluateTool } from "./tools/evaluate";
import { screenshotTool } from "./tools/screenshot";
import {
  networkStartTool,
  networkStopTool,
  networkListTool,
  networkDetailTool,
  waitForRequestTool,
} from "./tools/network";
import { getCookiesTool, setCookieTool } from "./tools/cookies";
import { saveAsPdfTool } from "./tools/pdf";
import { uploadTool } from "./tools/upload";
import { listTabsTool, switchTabTool, closeTabTool } from "./tools/tabs";
import { cdpTool } from "./tools/cdp";

const ALL_TOOLS: ToolDefinition[] = [
  navigateTool,
  snapshotTool,
  clickTool,
  fillTool,
  typeTextTool,
  sendKeysTool,
  evaluateTool,
  screenshotTool,
  networkStartTool,
  networkStopTool,
  networkListTool,
  networkDetailTool,
  waitForRequestTool,
  getCookiesTool,
  setCookieTool,
  saveAsPdfTool,
  uploadTool,
  listTabsTool,
  switchTabTool,
  closeTabTool,
  cdpTool,
];

/** Format a payload returned by the extension as MCP tool content. */
type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | {
      type: "resource";
      resource:
        | { uri: string; text: string; mimeType?: string }
        | { uri: string; blob: string; mimeType?: string };
    };

function toMcpContent(payload: ToolResultPayload): {
  content: McpContentBlock[];
} {
  const content: McpContentBlock[] = [];

  // The extension returns bare result objects (not the { data, text, meta }
  // envelope). Handle the actual formats:
  //
  // 1. Screenshots / PDFs: { data: "base64...", format: "png" } or
  //    { data: "base64...", mimeType: "application/pdf" }
  // 2. Tools with text: { text: "...", ... } (snapshot, evaluate, list_tabs)
  // 3. Everything else: { success: true, ... } (network, cookies, navigate, etc.)

  // 1. Base64 data (screenshot, PDF)
  if (typeof payload.data === "string" && payload.data.length > 0) {
    const extra = payload as Record<string, unknown>;
    const format = (extra.format as string) || "png";
    const mimeType =
      (extra.mimeType as string) ||
      (format === "pdf" ? "application/pdf" : `image/${format}`);

    if (mimeType.startsWith("image/")) {
      content.push({ type: "image", data: payload.data, mimeType });
    } else {
      content.push({
        type: "resource",
        resource: {
          uri: `data:${mimeType};base64,${payload.data}`,
          blob: payload.data,
          mimeType,
        },
      });
    }
    return { content };
  }

  // 2. Human readable text (snapshot, evaluate, list_tabs)
  if (typeof payload.text === "string" && payload.text.length > 0) {
    content.push({ type: "text", text: payload.text });
    return { content };
  }

  // 3. Bare result object — show as formatted JSON.
  //    This is what network_start/list/detail/stop, get_cookies, set_cookie,
  //    navigate, click, fill, upload, switch_tab, close_tab, cdp return.
  if (payload && typeof payload === "object" && Object.keys(payload).length > 0) {
    content.push({ type: "text", text: JSON.stringify(payload, null, 2) });
    return { content };
  }

  content.push({ type: "text", text: "OK" });
  return { content };
}

export async function createMcpServer(
  sessionManager: SessionManager
): Promise<McpServer> {
  const server = new McpServer({
    name: "traebridge-mcp-server",
    version: "1.0.0",
  });

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as never,
      },
      (async (rawArgs: unknown) => {
        // 1. Validate input with Zod.
        const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid arguments for ${tool.name}: ${parsed.error.message}`
          );
        }

        // 2. Friendly error when no extension is connected.
        if (!sessionManager.hasSessions()) {
          throw new McpError(
            ErrorCode.InternalError,
            "No browser extension is connected to the TraeBridge MCP server. " +
              "Open the browser with the TraeBridge extension installed (it must connect to ws://127.0.0.1:8765) and retry."
          );
        }

        // 3. Forward the call to the extension and wait for the result.
        //    mapArgs adapts MCP-side arguments to the extension-side shape;
        //    timeoutMs lets long-polling tools (e.g. wait_for_request)
        //    override the default 30 s round-trip timeout.
        const extArgs = tool.mapArgs
          ? tool.mapArgs(parsed.data)
          : (parsed.data as Record<string, unknown>);
        const timeoutMs = tool.timeoutMs ? tool.timeoutMs(parsed.data) : undefined;
        let payload: ToolResultPayload;
        try {
          payload = await sessionManager.callTool(
            tool.name,
            extArgs,
            timeoutMs !== undefined ? { timeoutMs } : undefined
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Tool ${tool.name} failed: ${message}`);
          throw new McpError(ErrorCode.InternalError, message);
        }

        return toMcpContent(payload);
      }) as never
    );
  }

  logger.info(`Registered ${ALL_TOOLS.length} MCP tools`);
  return server;
}

/** Connect the MCP server to the stdio transport and start listening. */
export async function startMcpServer(
  sessionManager: SessionManager
): Promise<McpServer> {
  const server = await createMcpServer(sessionManager);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio transport");
  return server;
}
