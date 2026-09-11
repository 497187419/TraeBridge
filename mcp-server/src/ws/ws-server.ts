/**
 * WebSocket server (127.0.0.1:8765 by default).
 *
 * Browser extensions connect here. Every socket is handed to the
 * SessionManager; heartbeats (protocol-level ping/pong plus application
 * level ping messages) detect dead connections.
 */

import { WebSocketServer, type WebSocket } from "ws";
import { SessionManager } from "./session-manager";
import { logger } from "../utils/logger";

export interface WsServerOptions {
  host?: string;
  port?: number;
  /** Heartbeat interval in ms (default 30 s). */
  heartbeatIntervalMs?: number;
  /** Consider a connection dead after this many missed pongs. */
  heartbeatTimeoutMs?: number;
}

export class WsServer {
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  /** sessionId -> last time a pong was seen. */
  private readonly lastPong = new Map<string, number>();

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly options: WsServerOptions = {}
  ) {}

  get address(): { host: string; port: number } {
    return {
      host: this.options.host ?? "127.0.0.1",
      port: this.options.port ?? 8765,
    };
  }

  start(): Promise<void> {
    const { host, port } = this.address;

    return new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ host, port });

      this.wss.on("listening", () => {
        logger.info(`WebSocket server listening on ws://${host}:${port}`);
        this.startHeartbeat();
        resolve();
      });

      this.wss.on("error", (err: Error) => {
        logger.error(`WebSocket server error: ${err.message}`);
        reject(err);
      });

      this.wss.on("connection", (socket: WebSocket, req) => {
        const remote = req.socket.remoteAddress;
        const sessionId = this.sessionManager.addConnection(socket, remote);
        this.lastPong.set(sessionId, Date.now());

        socket.on("message", (data: Buffer | string) => {
          const raw = typeof data === "string" ? data : data.toString("utf8");
          this.sessionManager.handleMessage(sessionId, raw);
        });

        socket.on("pong", () => {
          this.lastPong.set(sessionId, Date.now());
        });

        socket.on("error", (err: Error) => {
          logger.error(`Socket error on ${sessionId}: ${err.message}`);
        });

        socket.on("close", (code: number, reason: Buffer) => {
          const reasonText = reason.toString("utf8") || `code ${code}`;
          this.lastPong.delete(sessionId);
          this.sessionManager.removeConnection(sessionId, reasonText);
        });

        // Welcome the extension.
        try {
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "hello",
              params: { sessionId, server: "traebridge-mcp-server" },
            })
          );
        } catch (err) {
          logger.warn(`Failed to send hello to ${sessionId}:`, err);
        }
      });
    });
  }

  private startHeartbeat(): void {
    const intervalMs = this.options.heartbeatIntervalMs ?? 30_000;
    const timeoutMs = this.options.heartbeatTimeoutMs ?? 90_000;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, last] of this.lastPong) {
        if (now - last > timeoutMs) {
          logger.warn(`Session ${sessionId} missed heartbeats, terminating`);
          const session = this.sessionManager
            .listSessions()
            .find((s) => s.sessionId === sessionId);
          void session; // session lookup is informational only
          this.terminateSession(sessionId);
          continue;
        }
      }

      this.sessionManager.pingAll();
    }, intervalMs);

    // Do not keep the process alive solely for the heartbeat.
    this.heartbeatTimer.unref?.();
  }

  private terminateSession(sessionId: string): void {
    // The session manager owns the socket map; closing happens through the
    // 'close' event handler registered in start(). We poke the manager to
    // drop it and let the socket error out on the next send.
    this.sessionManager.removeConnection(sessionId, "heartbeat timeout");
    this.lastPong.delete(sessionId);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close(1001, "server shutdown");
      }
      this.wss.close();
      this.wss = null;
    }
    logger.info("WebSocket server stopped");
  }
}
