/**
 * Entry point: start the WebSocket server (for browser extensions) and the
 * MCP server (stdio transport for AI agents).
 */

import { SessionManager } from "./ws/session-manager";
import { WsServer } from "./ws/ws-server";
import { startMcpServer } from "./mcp/server";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  logger.info("Starting traebridge-mcp-server ...");

  const sessionManager = new SessionManager();

  // Log extension events (they arrive unsolicited from the browser).
  sessionManager.onEvent((event) => {
    logger.info(
      `Extension event: type=${event.params.type} tabId=${event.params.tabId ?? "?"}`
    );
  });

  // 1. WebSocket server for browser extensions.
  const wsServer = new WsServer(sessionManager, {
    host: process.env.TRAEBRIDGE_WS_HOST ?? "127.0.0.1",
    port: Number(process.env.TRAEBRIDGE_WS_PORT ?? 8765),
  });
  await wsServer.start();

  // 2. MCP server over stdio.
  await startMcpServer(sessionManager);

  // Graceful shutdown.
  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down ...`);
    sessionManager.dispose();
    wsServer.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("traebridge-mcp-server is up (ws://127.0.0.1:8765 + stdio)");
}

main().catch((err: unknown) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
