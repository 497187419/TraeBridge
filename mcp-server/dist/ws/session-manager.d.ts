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
import { type EventMessage, type HelloMessage, type ToolResultPayload } from "./protocol";
/** Default timeout for a tool call round-trip. */
export declare const DEFAULT_TOOL_TIMEOUT_MS = 30000;
/** Information describing one extension session. */
export interface SessionInfo {
    sessionId: string;
    connectedAt: number;
    remoteAddress?: string;
    extensionVersion?: string;
    browser?: string;
}
export type EventListener = (event: EventMessage) => void;
export declare class SessionManager {
    private readonly sessions;
    private eventListeners;
    /** Register a listener for extension-pushed events. */
    onEvent(listener: EventListener): void;
    /** Register a freshly connected socket; returns the new session id. */
    addConnection(socket: WebSocket, remoteAddress?: string): string;
    /** Remove a session and reject every pending call on it. */
    removeConnection(sessionId: string, reason?: string): void;
    /** Attach hello metadata announced by the extension. */
    setSessionInfo(sessionId: string, hello: HelloMessage["params"]): void;
    /** List all active sessions. */
    listSessions(): SessionInfo[];
    /** Does any session exist? */
    hasSessions(): boolean;
    /** Total number of connected sessions. */
    get sessionCount(): number;
    /**
     * Resolve the target session: explicit sessionId, otherwise the first
     * connected session (insertion order).
     */
    private resolveSession;
    private describeSessions;
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
    callTool(tool: string, args: Record<string, unknown>, opts?: {
        sessionId?: string;
        timeoutMs?: number;
    }): Promise<ToolResultPayload>;
    /**
     * Route a raw WebSocket frame to the owning session. Responses resolve
     * pending tool calls; requests/notifications (hello, event, pong) are
     * handled as extension-initiated messages.
     */
    handleMessage(sessionId: string, raw: string): void;
    private handleExtensionRequest;
    /** Send a low-level ping frame through every session (heartbeat helper). */
    pingAll(): void;
    /** Close all sessions and reject pending calls. */
    dispose(): void;
}
