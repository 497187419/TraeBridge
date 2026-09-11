/**
 * Minimal logger that writes to stdout (and optionally to a file).
 *
 * In MCP stdio mode the ONLY thing allowed on stdout is the JSON-RPC
 * protocol traffic between the server and the client. To stay safe we
 * write informational logs to stderr by default and only use stdout when
 * an explicit log file is configured via TRAEBRIDGE_LOG_FILE.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
declare class Logger {
    private readonly level;
    private readonly file;
    private constructor();
    private static instance;
    static getInstance(): Logger;
    private write;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
export declare const logger: Logger;
export {};
