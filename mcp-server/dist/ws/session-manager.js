"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = exports.DEFAULT_TOOL_TIMEOUT_MS = void 0;
const ws_1 = require("ws");
const protocol_1 = require("./protocol");
const logger_1 = require("../utils/logger");
/** Default timeout for a tool call round-trip. */
exports.DEFAULT_TOOL_TIMEOUT_MS = 30_000;
function generateSessionId() {
    return `sess-${Math.random().toString(16).slice(2, 10)}`;
}
class SessionManager {
    sessions = new Map();
    eventListeners = [];
    /** Register a listener for extension-pushed events. */
    onEvent(listener) {
        this.eventListeners.push(listener);
    }
    /** Register a freshly connected socket; returns the new session id. */
    addConnection(socket, remoteAddress) {
        const sessionId = generateSessionId();
        const session = {
            socket,
            pending: new Map(),
            info: {
                sessionId,
                connectedAt: Date.now(),
                remoteAddress,
            },
        };
        this.sessions.set(sessionId, session);
        logger_1.logger.info(`Session connected: ${sessionId} (${remoteAddress ?? "unknown"})`);
        return sessionId;
    }
    /** Remove a session and reject every pending call on it. */
    removeConnection(sessionId, reason) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        for (const [id, pending] of session.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`Extension session ${sessionId} disconnected (${reason ?? "closed"}) while waiting for "${pending.tool}" result (request ${String(id)}).`));
        }
        session.pending.clear();
        this.sessions.delete(sessionId);
        logger_1.logger.info(`Session removed: ${sessionId} (${reason ?? "closed"})`);
    }
    /** Attach hello metadata announced by the extension. */
    setSessionInfo(sessionId, hello) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        if (hello.extensionVersion)
            session.info.extensionVersion = hello.extensionVersion;
        if (hello.browser)
            session.info.browser = hello.browser;
    }
    /** List all active sessions. */
    listSessions() {
        return [...this.sessions.values()].map((s) => ({ ...s.info }));
    }
    /** Does any session exist? */
    hasSessions() {
        return this.sessions.size > 0;
    }
    /** Total number of connected sessions. */
    get sessionCount() {
        return this.sessions.size;
    }
    /**
     * Resolve the target session: explicit sessionId, otherwise the first
     * connected session (insertion order).
     */
    resolveSession(sessionId) {
        if (sessionId) {
            const session = this.sessions.get(sessionId);
            if (!session) {
                throw new Error(`No browser extension session with id "${sessionId}". Connected sessions: ${this.describeSessions()}.`);
            }
            if (session.socket.readyState !== ws_1.WebSocket.OPEN &&
                session.socket.readyState !== ws_1.WebSocket.CONNECTING) {
                throw new Error(`Browser extension session ${sessionId} is not connected.`);
            }
            return session;
        }
        const first = this.sessions.values().next().value;
        if (!first) {
            throw new Error("No browser extension is connected. Open the browser where the TraeBridge extension is installed, then retry.");
        }
        return first;
    }
    describeSessions() {
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
    async callTool(tool, args, opts = {}) {
        const session = this.resolveSession(opts.sessionId);
        const id = (0, protocol_1.generateRequestId)();
        const timeoutMs = opts.timeoutMs ?? exports.DEFAULT_TOOL_TIMEOUT_MS;
        const extTool = tool.startsWith("browser_") ? tool.slice("browser_".length) : tool;
        const message = (0, protocol_1.buildToolCallRequest)(id, extTool, args, session.info.sessionId);
        const payload = JSON.stringify(message);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                session.pending.delete(id);
                reject(new Error(`Tool "${tool}" timed out after ${timeoutMs} ms waiting for the browser extension to respond.`));
            }, timeoutMs);
            session.pending.set(id, { resolve, reject, timer, tool });
            logger_1.logger.debug(`-> ${session.info.sessionId} ${payload}`);
            session.socket.send(payload, (err) => {
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
    handleMessage(sessionId, raw) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger_1.logger.warn(`Received message for unknown session ${sessionId}`);
            return;
        }
        const msg = (0, protocol_1.parseJsonRpcMessage)(raw);
        if (!msg) {
            logger_1.logger.warn(`Ignoring malformed message from ${sessionId}: ${raw.slice(0, 200)}`);
            return;
        }
        logger_1.logger.debug(`<- ${sessionId} ${raw}`);
        // --- Response to one of our tool_call requests ---------------------
        if ("result" in msg || "error" in msg) {
            const id = msg.id;
            if (id === undefined) {
                logger_1.logger.warn(`Response without id from ${sessionId}, ignoring`);
                return;
            }
            const pending = session.pending.get(id);
            if (!pending) {
                logger_1.logger.warn(`No pending call for response id ${String(id)} from ${sessionId}`);
                return;
            }
            session.pending.delete(id);
            clearTimeout(pending.timer);
            if ((0, protocol_1.isJsonRpcError)(msg)) {
                pending.reject(new Error(msg.error.message ?? `Extension returned error code ${msg.error.code}`));
            }
            else if ((0, protocol_1.isJsonRpcSuccess)(msg)) {
                pending.resolve(msg.result ?? {});
            }
            else {
                pending.resolve({ data: msg.result });
            }
            return;
        }
        // --- Extension-initiated request / notification --------------------
        this.handleExtensionRequest(sessionId, msg);
    }
    handleExtensionRequest(sessionId, msg) {
        if (!("method" in msg) || typeof msg.method !== "string") {
            return;
        }
        switch (msg.method) {
            case "hello": {
                const hello = msg;
                this.setSessionInfo(sessionId, hello.params ?? {});
                logger_1.logger.info(`Extension hello from ${sessionId}: version=${hello.params?.extensionVersion ?? "?"} browser=${hello.params?.browser ?? "?"}`);
                break;
            }
            case "event": {
                const event = msg;
                for (const listener of this.eventListeners) {
                    try {
                        listener(event);
                    }
                    catch (err) {
                        logger_1.logger.error("Event listener error:", err);
                    }
                }
                break;
            }
            case "pong":
                logger_1.logger.debug(`Pong from ${sessionId}`);
                break;
            default:
                logger_1.logger.debug(`Ignoring unknown extension method "${msg.method}" from ${sessionId}`);
        }
    }
    /** Send a low-level ping frame through every session (heartbeat helper). */
    pingAll() {
        for (const [sessionId, session] of this.sessions) {
            if (session.socket.readyState === ws_1.WebSocket.OPEN) {
                try {
                    session.socket.ping();
                }
                catch (err) {
                    logger_1.logger.warn(`Ping failed for ${sessionId}:`, err);
                }
            }
        }
    }
    /** Close all sessions and reject pending calls. */
    dispose() {
        for (const [sessionId] of this.sessions) {
            this.removeConnection(sessionId, "server shutdown");
        }
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=session-manager.js.map