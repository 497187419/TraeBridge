/**
 * WebSocket server (127.0.0.1:8765 by default).
 *
 * Browser extensions connect here. Every socket is handed to the
 * SessionManager; heartbeats (protocol-level ping/pong plus application
 * level ping messages) detect dead connections.
 */
import { SessionManager } from "./session-manager";
export interface WsServerOptions {
    host?: string;
    port?: number;
    /** Heartbeat interval in ms (default 30 s). */
    heartbeatIntervalMs?: number;
    /** Consider a connection dead after this many missed pongs. */
    heartbeatTimeoutMs?: number;
}
export declare class WsServer {
    private readonly sessionManager;
    private readonly options;
    private wss;
    private heartbeatTimer;
    /** sessionId -> last time a pong was seen. */
    private readonly lastPong;
    constructor(sessionManager: SessionManager, options?: WsServerOptions);
    get address(): {
        host: string;
        port: number;
    };
    start(): Promise<void>;
    private startHeartbeat;
    private terminateSession;
    stop(): void;
}
