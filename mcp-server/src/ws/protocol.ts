/**
 * JSON-RPC 2.0 protocol type definitions.
 *
 * The browser extension connects to this MCP server over a WebSocket and
 * speaks JSON-RPC 2.0. The server forwards MCP tool calls as
 * `tool_call` requests and expects `tool_result` responses (or JSON-RPC
 * errors) back from the extension.
 */

/** JSON-RPC 2.0 request identifier (string or number). */
export type JsonRpcId = string | number;

/** JSON-RPC 2.0 error object. */
export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

/** Base fields shared by every JSON-RPC 2.0 message. */
export interface JsonRpcMessageBase {
  jsonrpc: "2.0";
  id?: JsonRpcId;
}

/** JSON-RPC 2.0 request. */
export interface JsonRpcRequest<TParams = unknown> extends JsonRpcMessageBase {
  method: string;
  params?: TParams;
}

/** JSON-RPC 2.0 success response. */
export interface JsonRpcSuccessResponse<TResult = unknown>
  extends JsonRpcMessageBase {
  result: TResult;
}

/** JSON-RPC 2.0 error response. */
export interface JsonRpcErrorResponse extends JsonRpcMessageBase {
  error: JsonRpcErrorObject;
}

/** JSON-RPC 2.0 response (success or error). */
export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;

/** Discriminated union of every message that can arrive over the wire. */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse;

/* ------------------------------------------------------------------ */
/* Extension-facing protocol                                            */
/* ------------------------------------------------------------------ */

/** Methods initiated by the MCP server towards the extension. */
export const SERVER_METHODS = {
  TOOL_CALL: "tool_call",
  PING: "ping",
} as const;

/** Methods initiated by the extension towards the MCP server. */
export const EXTENSION_METHODS = {
  /** Extension reports a tool result (alternative to plain JSON-RPC response). */
  TOOL_RESULT: "tool_result",
  /** Extension pushes an unsolicited event (tab created, navigated, ...). */
  EVENT: "event",
  /** Extension announces itself after connecting. */
  HELLO: "hello",
  PONG: "pong",
} as const;

/** Parameters of a `tool_call` request sent to the extension. */
export interface ToolCallParams {
  /** Name of the tool to invoke, e.g. `browser_click`. */
  tool: string;
  /** Arguments for the tool. */
  args: Record<string, unknown>;
  /** Optional explicit session id (defaults to the routing session). */
  sessionId?: string;
}

/** A tool_call request as sent over the wire. */
export interface ToolCallRequest extends JsonRpcRequest<ToolCallParams> {
  method: typeof SERVER_METHODS.TOOL_CALL;
  params: ToolCallParams;
}

/** Successful tool result payload returned by the extension. */
export interface ToolResultPayload {
  /** Structured result data (tool specific). */
  data?: unknown;
  /** Human readable result text. */
  text?: string;
  /** Additional metadata. */
  meta?: Record<string, unknown>;
}

/**
 * A `tool_result` message from the extension. The id matches the
 * originating `tool_call` id when sent as a response, or is omitted/null
 * when sent as a notification.
 */
export interface ToolResultMessage
  extends JsonRpcSuccessResponse<ToolResultPayload> {
  method?: typeof EXTENSION_METHODS.TOOL_RESULT;
}

/** Event pushed by the extension without a preceding request. */
export interface EventMessageParams {
  /** Event type, e.g. `tab_updated`, `console_message`. */
  type: string;
  /** Event payload. */
  payload?: unknown;
  /** Tab id the event relates to (when applicable). */
  tabId?: number;
  /** Timestamp (ms since epoch). */
  timestamp?: number;
}

export interface EventMessage extends JsonRpcMessageBase {
  method: typeof EXTENSION_METHODS.EVENT;
  params: EventMessageParams;
}

/** Hello message the extension sends right after connecting. */
export interface HelloMessageParams {
  extensionVersion?: string;
  browser?: string;
  sessionId?: string;
}

export interface HelloMessage extends JsonRpcMessageBase {
  method: typeof EXTENSION_METHODS.HELLO;
  params: HelloMessageParams;
}

/** Union of all extension-initiated messages. */
export type ExtensionMessage =
  | ToolResultMessage
  | EventMessage
  | HelloMessage
  | JsonRpcRequest;

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Generate a request id like `req-3f9c1a7b`. */
export function generateRequestId(): string {
  return `req-${Math.random().toString(16).slice(2, 10)}`;
}

/** Type guard: is this a JSON-RPC error response? */
export function isJsonRpcError(
  msg: JsonRpcMessage
): msg is JsonRpcErrorResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "error" in msg &&
    typeof (msg as JsonRpcErrorResponse).error === "object"
  );
}

/** Type guard: is this a JSON-RPC success response? */
export function isJsonRpcSuccess(
  msg: JsonRpcMessage
): msg is JsonRpcSuccessResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "result" in msg &&
    !("method" in msg)
  );
}

/** Type guard: is this a JSON-RPC request / notification (has a method)? */
export function isJsonRpcRequest(
  msg: JsonRpcMessage
): msg is JsonRpcRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "method" in msg &&
    typeof (msg as JsonRpcRequest).method === "string"
  );
}

/**
 * Safely parse an incoming WebSocket frame into a JSON-RPC message.
 * Returns null when the payload is not valid JSON-RPC 2.0.
 */
export function parseJsonRpcMessage(raw: string): JsonRpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const msg = parsed as Record<string, unknown>;
    if (msg.jsonrpc !== "2.0") return null;
    if (!("method" in msg) && !("result" in msg) && !("error" in msg)) {
      return null;
    }
    return parsed as JsonRpcMessage;
  } catch {
    return null;
  }
}

/** Build a tool_call request message. */
export function buildToolCallRequest(
  id: JsonRpcId,
  tool: string,
  args: Record<string, unknown>,
  sessionId?: string
): ToolCallRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: SERVER_METHODS.TOOL_CALL,
    params: { tool, args, ...(sessionId ? { sessionId } : {}) },
  };
}
