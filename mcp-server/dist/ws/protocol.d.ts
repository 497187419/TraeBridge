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
export interface JsonRpcSuccessResponse<TResult = unknown> extends JsonRpcMessageBase {
    result: TResult;
}
/** JSON-RPC 2.0 error response. */
export interface JsonRpcErrorResponse extends JsonRpcMessageBase {
    error: JsonRpcErrorObject;
}
/** JSON-RPC 2.0 response (success or error). */
export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccessResponse<TResult> | JsonRpcErrorResponse;
/** Discriminated union of every message that can arrive over the wire. */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse;
/** Methods initiated by the MCP server towards the extension. */
export declare const SERVER_METHODS: {
    readonly TOOL_CALL: "tool_call";
    readonly PING: "ping";
};
/** Methods initiated by the extension towards the MCP server. */
export declare const EXTENSION_METHODS: {
    /** Extension reports a tool result (alternative to plain JSON-RPC response). */
    readonly TOOL_RESULT: "tool_result";
    /** Extension pushes an unsolicited event (tab created, navigated, ...). */
    readonly EVENT: "event";
    /** Extension announces itself after connecting. */
    readonly HELLO: "hello";
    readonly PONG: "pong";
};
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
export interface ToolResultMessage extends JsonRpcSuccessResponse<ToolResultPayload> {
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
export type ExtensionMessage = ToolResultMessage | EventMessage | HelloMessage | JsonRpcRequest;
/** Generate a request id like `req-3f9c1a7b`. */
export declare function generateRequestId(): string;
/** Type guard: is this a JSON-RPC error response? */
export declare function isJsonRpcError(msg: JsonRpcMessage): msg is JsonRpcErrorResponse;
/** Type guard: is this a JSON-RPC success response? */
export declare function isJsonRpcSuccess(msg: JsonRpcMessage): msg is JsonRpcSuccessResponse;
/** Type guard: is this a JSON-RPC request / notification (has a method)? */
export declare function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest;
/**
 * Safely parse an incoming WebSocket frame into a JSON-RPC message.
 * Returns null when the payload is not valid JSON-RPC 2.0.
 */
export declare function parseJsonRpcMessage(raw: string): JsonRpcMessage | null;
/** Build a tool_call request message. */
export declare function buildToolCallRequest(id: JsonRpcId, tool: string, args: Record<string, unknown>, sessionId?: string): ToolCallRequest;
