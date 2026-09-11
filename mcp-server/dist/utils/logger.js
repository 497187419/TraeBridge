"use strict";
/**
 * Minimal logger that writes to stdout (and optionally to a file).
 *
 * In MCP stdio mode the ONLY thing allowed on stdout is the JSON-RPC
 * protocol traffic between the server and the client. To stay safe we
 * write informational logs to stderr by default and only use stdout when
 * an explicit log file is configured via TRAEBRIDGE_LOG_FILE.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const LEVEL_ORDER = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
function resolveLevel() {
    const raw = (process.env.TRAEBRIDGE_LOG_LEVEL ?? "info").toLowerCase();
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
        return raw;
    }
    return "info";
}
function resolveLogFile() {
    return process.env.TRAEBRIDGE_LOG_FILE ?? null;
}
function timestamp() {
    return new Date().toISOString();
}
class Logger {
    level = resolveLevel();
    file = resolveLogFile();
    constructor() {
        if (this.file) {
            try {
                (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(this.file), { recursive: true });
            }
            catch {
                /* ignore */
            }
        }
    }
    static instance = null;
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    write(level, args) {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level])
            return;
        const line = `[${timestamp()}] [${level.toUpperCase()}] ${args
            .map((a) => (typeof a === "string" ? a : safeStringify(a)))
            .join(" ")}`;
        // Stdout is reserved for MCP protocol traffic -> always use stderr.
        process.stderr.write(line + "\n");
        if (this.file) {
            try {
                (0, node_fs_1.appendFileSync)(this.file, line + "\n", "utf8");
            }
            catch {
                /* ignore file write errors */
            }
        }
    }
    debug(...args) {
        this.write("debug", args);
    }
    info(...args) {
        this.write("info", args);
    }
    warn(...args) {
        this.write("warn", args);
    }
    error(...args) {
        this.write("error", args);
    }
}
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
exports.logger = Logger.getInstance();
//# sourceMappingURL=logger.js.map