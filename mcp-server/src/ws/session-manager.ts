/**
 * Session manager: owns every browser-extension WebSocket connection.
 *
 * - Each connection gets a unique session id (`sess-xxxx`).
 * - Tool calls are routed by sessionId, or to the first (default) session
 *   when no explicit sessionId is given.
 * - Pending `tool_call` requests are tracked by request id so the matching
 *   `tool_result` / JSON-RPC response can resolve the waiting promise.
 * - Timeouts (default 30 s) reject the pending call.
 */

import { WebSocket } from "ws";
import {
  buildToolCallRequest,
  generateRequestId,
  isJsonRpcError,
  isJsonRpcSuccess,
  parseJsonRpcMessage,
  type EventMessage,
  type HelloMessage,
  type JsonRpcId,
  type JsonRpcMessage,
  type ToolResultPayload,
} from "./protocol";
import { logger } from "../utils/logger";

/** Default timeout for a tool call round-trip. */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/** Information describing one extension session. */
export interface SessionInfo {
  sessionId: string;
  connectedAt: number;
  remoteAddress?: string;
  extensionVersion?: string;
  browser?: string;
}

interface PendingCall {
  resolve: (value: ToolResultPayload) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  tool: string;
}

interface Session {
  info: SessionInfo;
  socket: WebSocket;
  pending: Map<JsonRpcId, PendingCall>;
}

export type EventListener = (event: EventMessage) => void;

function generateSessionId(): string {
  return `sess-${Math.random().toString(16).slice(2, 10)}`;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private eventListeners: EventListener[] = [];

  /** Register a listener for extension-pushed events. */
  onEvent(listener: EventListener): void {
    this.eventListeners.push(listener);
  }

  /** Register a freshly connected socket; returns the new session id. */
  addConnection(socket: WebSocket, remoteAddress?: string): string {
    const sessionId = generateSessionId();
    const session: Session = {
      socket,
      pending: new Map(),
      info: {
        sessionId,
        connectedAt: Date.now(),
        remoteAddress,
      },
    };
    this.sessions.set(sessionId, session);
    logger.info(`Session connected: ${sessionId} (${remoteAddress ?? "unknown"})`);
    return sessionId;
  }

  /** Remove a session and reject every pending call on it. */
  removeConnection(sessionId: string, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [id, pending] of session.pending) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error(
          `Extension session ${sessionId} disconnected (${reason ?? "closed"}) while waiting for "${pending.tool}" result (request ${String(id)}).`
        )
      );
    }
    session.pending.clear();
    this.sessions.delete(sessionId);
    logger.info(`Session removed: ${sessionId} (${reason ?? "closed"})`);
  }

  /** Attach hello metadata announced by the extension. */
  setSessionInfo(sessionId: string, hello: HelloMessage["params"]): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (hello.extensionVersion) session.info.extensionVersion = hello.extensionVersion;
    if (hello.browser) session.info.browser = hello.browser;
  }

  /** List all active sessions. */
  listSessions(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => ({ ...s.info }));
  }

  /** Does any session exist? */
  hasSessions(): boolean {
    return this.sessions.size > 0;
  }

  /** Total number of connected sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Resolve the target session: explicit sessionId, otherwise the first
   * connected session (insertion order).
   */
  private resolveSession(sessionId?: string): Session {
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(
          `No browser extension session with id "${sessionId}". Connected sessions: ${this.describeSessions()}.`
        );
      }
      if (
        session.socket.readyState !== WebSocket.OPEN &&
        session.socket.readyState !== WebSocket.CONNECTING
      ) {
        throw new Error(`Browser extension session ${sessionId} is not connected.`);
      }
      return session;
    }

    const first = this.sessions.values().next().value as Session | undefined;
    if (!first) {
      throw new Error(
        "No browser extension is connected. Open the browser where the TraeBridge extension is installed, then retry."
      );
    }
    return first;
  }

  private describeSessions(): string {
    const ids = this.listSessions().map((s) => s.sessionId);
    return ids.length > 0 ? ids.join(", ") : "none";
  }

  /**
   * Send a tool_call to the extension and wait for its result.
   *
   * The extension registers tools without the `browser_` MCP prefix, so the
   * prefix is stripped here before the call is placed on the wire.
   *
   * @param tool    MCP tool name, e.g. `browser_click`.
   * @param args    Tool arguments (already mapped to the extension-side shape).
   * @param opts    Optional sessionId and timeout override.
   */
  async callTool(
    tool: string,
    args: Record<string, unknown>,
    opts: { sessionId?: string; timeoutMs?: number } = {}
  ): Promise<ToolResultPayload> {
    const session = this.resolveSession(opts.sessionId);
    const id = generateRequestId();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    const extTool = tool.startsWith("browser_") ? tool.slice("browser_".length) : tool;

    const message = buildToolCallRequest(id, extTool, args, session.info.sessionId);
    const payload = JSON.stringify(message);

    return new Promise<ToolResultPayload>((resolve, reject) => {
      const timer: NodeJS.Timeout = setTimeout(() => {
        session.pending.delete(id);
        reject(
          new Error(
            `Tool "${tool}" timed out after ${timeoutMs} ms waiting for the browser extension to respond.`
          )
        );
      }, timeoutMs);

      session.pending.set(id, { resolve, reject, timer, tool });

      logger.debug(`-> ${session.info.sessionId} ${payload}`);
      session.socket.send(payload, (err?: Error) => {
        if (err) {
          clearTimeout(timer);
          session.pending.delete(id);
          reject(new Error(`Failed to send tool_call "${tool}": ${err.message}`));
        }
      });
    });
  }

  /**
   * Route a raw WebSocket frame to the owning session. Responses resolve
   * pending tool calls; requests/notifications (hello, event, pong) are
   * handled as extension-initiated messages.
   */
  handleMessage(sessionId: string, raw: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Received message for unknown session ${sessionId}`);
      return;
    }

    const msg = parseJsonRpcMessage(raw);
    if (!msg) {
      logger.warn(`Ignoring malformed message from ${sessionId}: ${raw.slice(0, 200)}`);
      return;
    }

    logger.debug(`<- ${sessionId} ${raw}`);

    // --- Response to one of our tool_call requests ---------------------
    if ("result" in msg || "error" in msg) {
      const id = msg.id;
      if (id === undefined) {
        logger.warn(`Response without id from ${sessionId}, ignoring`);
        return;
      }
      const pending = session.pending.get(id);
      if (!pending) {
        logger.warn(`No pending call for response id ${String(id)} from ${sessionId}`);
        return;
      }
      session.pending.delete(id);
      clearTimeout(pending.timer);

      if (isJsonRpcError(msg)) {
        pending.reject(
          new Error(msg.error.message ?? `Extension returned error code ${msg.error.code}`)
        );
      } else if (isJsonRpcSuccess(msg)) {
        pending.resolve((msg.result as ToolResultPayload | undefined) ?? {});
      } else {
        pending.resolve({ data: (msg as { result?: unknown }).result });
      }
      return;
    }

    // --- Extension-initiated request / notification --------------------
    this.handleExtensionRequest(sessionId, msg);
  }

  private handleExtensionRequest(sessionId: string, msg: JsonRpcMessage): void {
    if (!("method" in msg) || typeof msg.method !== "string") {
      return;
    }

    switch (msg.method) {
      case "hello": {
        const hello = msg as unknown as HelloMessage;
        this.setSessionInfo(sessionId, hello.params ?? {});
        logger.info(
          `Extension hello from ${sessionId}: version=${hello.params?.extensionVersion ?? "?"} browser=${hello.params?.browser ?? "?"}`
        );
        break;
      }
      case "event": {
        const event = msg as unknown as EventMessage;
        for (const listener of this.eventListeners) {
          try {
            listener(event);
          } catch (err) {
            logger.error("Event listener error:", err);
          }
        }
        break;
      }
      case "pong":
        logger.debug(`Pong from ${sessionId}`);
        break;
      default:
        logger.debug(`Ignoring unknown extension method "${msg.method}" from ${sessionId}`);
    }
  }

  /** Send a low-level ping frame through every session (heartbeat helper). */
  pingAll(): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.socket.readyState === WebSocket.OPEN) {
        try {
          session.socket.ping();
        } catch (err) {
          logger.warn(`Ping failed for ${sessionId}:`, err);
        }
      }
    }
  }

  /** Close all sessions and reject pending calls. */
  dispose(): void {
    for (const [sessionId] of this.sessions) {
      this.removeConnection(sessionId, "server shutdown");
    }
  }
}
