"use strict";
/**
 * Entry point: start the WebSocket server (for browser extensions) and the
 * MCP server (stdio transport for AI agents).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const session_manager_1 = require("./ws/session-manager");
const ws_server_1 = require("./ws/ws-server");
const server_1 = require("./mcp/server");
const logger_1 = require("./utils/logger");
async function main() {
    logger_1.logger.info("Starting traebridge-mcp-server ...");
    const sessionManager = new session_manager_1.SessionManager();
    // Log extension events (they arrive unsolicited from the browser).
    sessionManager.onEvent((event) => {
        logger_1.logger.info(`Extension event: type=${event.params.type} tabId=${event.params.tabId ?? "?"}`);
    });
    // 1. WebSocket server for browser extensions.
    const wsServer = new ws_server_1.WsServer(sessionManager, {
        host: process.env.TRAEBRIDGE_WS_HOST ?? "127.0.0.1",
        port: Number(process.env.TRAEBRIDGE_WS_PORT ?? 8765),
    });
    await wsServer.start();
    // 2. MCP server over stdio.
    await (0, server_1.startMcpServer)(sessionManager);
    // Graceful shutdown.
    const shutdown = (signal) => {
        logger_1.logger.info(`Received ${signal}, shutting down ...`);
        sessionManager.dispose();
        wsServer.stop();
        process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    logger_1.logger.info("traebridge-mcp-server is up (ws://127.0.0.1:8765 + stdio)");
}
main().catch((err) => {
    logger_1.logger.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map