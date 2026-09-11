/**
 * Minimal logger that writes to stdout (and optionally to a file).
 *
 * In MCP stdio mode the ONLY thing allowed on stdout is the JSON-RPC
 * protocol traffic between the server and the client. To stay safe we
 * write informational logs to stderr by default and only use stdout when
 * an explicit log file is configured via TRAEBRIDGE_LOG_FILE.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.TRAEBRIDGE_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function resolveLogFile(): string | null {
  return process.env.TRAEBRIDGE_LOG_FILE ?? null;
}

function timestamp(): string {
  return new Date().toISOString();
}

class Logger {
  private readonly level: LogLevel = resolveLevel();
  private readonly file: string | null = resolveLogFile();

  private constructor() {
    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
      } catch {
        /* ignore */
      }
    }
  }

  private static instance: Logger | null = null;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private write(level: LogLevel, args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const line = `[${timestamp()}] [${level.toUpperCase()}] ${args
      .map((a) => (typeof a === "string" ? a : safeStringify(a)))
      .join(" ")}`;

    // Stdout is reserved for MCP protocol traffic -> always use stderr.
    process.stderr.write(line + "\n");

    if (this.file) {
      try {
        appendFileSync(this.file, line + "\n", "utf8");
      } catch {
        /* ignore file write errors */
      }
    }
  }

  debug(...args: unknown[]): void {
    this.write("debug", args);
  }

  info(...args: unknown[]): void {
    this.write("info", args);
  }

  warn(...args: unknown[]): void {
    this.write("warn", args);
  }

  error(...args: unknown[]): void {
    this.write("error", args);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = Logger.getInstance();
