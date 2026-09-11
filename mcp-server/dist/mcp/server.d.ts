/**
 * MCP server (stdio transport) that exposes the browser extension tools.
 *
 * Flow of a tool call:
 *   MCP client --(stdio)--> McpServer --tool_call(JSON-RPC over WS)--> extension
 *   extension --result/error--> SessionManager --> McpServer --stdio--> MCP client
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionManager } from "../ws/session-manager";
export declare function createMcpServer(sessionManager: SessionManager): Promise<McpServer>;
/** Connect the MCP server to the stdio transport and start listening. */
export declare function startMcpServer(sessionManager: SessionManager): Promise<McpServer>;
