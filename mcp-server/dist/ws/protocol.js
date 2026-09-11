"use strict";
/**
 * JSON-RPC 2.0 protocol type definitions.
 *
 * The browser extension connects to this MCP server over a WebSocket and
 * speaks JSON-RPC 2.0. The server forwards MCP tool calls as
 * `tool_call` requests and expects `tool_result` responses (or JSON-RPC
 * errors) back from the extension.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTENSION_METHODS = exports.SERVER_METHODS = void 0;
exports.generateRequestId = generateRequestId;
exports.isJsonRpcError = isJsonRpcError;
exports.isJsonRpcSuccess = isJsonRpcSuccess;
exports.isJsonRpcRequest = isJsonRpcRequest;
exports.parseJsonRpcMessage = parseJsonRpcMessage;
exports.buildToolCallRequest = buildToolCallRequest;
/* ------------------------------------------------------------------ */
/* Extension-facing protocol                                            */
/* ------------------------------------------------------------------ */
/** Methods initiated by the MCP server towards the extension. */
exports.SERVER_METHODS = {
    TOOL_CALL: "tool_call",
    PING: "ping",
};
/** Methods initiated by the extension towards the MCP server. */
exports.EXTENSION_METHODS = {
    /** Extension reports a tool result (alternative to plain JSON-RPC response). */
    TOOL_RESULT: "tool_result",
    /** Extension pushes an unsolicited event (tab created, navigated, ...). */
    EVENT: "event",
    /** Extension announces itself after connecting. */
    HELLO: "hello",
    PONG: "pong",
};
/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
/** Generate a request id like `req-3f9c1a7b`. */
function generateRequestId() {
    return `req-${Math.random().toString(16).slice(2, 10)}`;
}
/** Type guard: is this a JSON-RPC error response? */
function isJsonRpcError(msg) {
    return (typeof msg === "object" &&
        msg !== null &&
        "error" in msg &&
        typeof msg.error === "object");
}
/** Type guard: is this a JSON-RPC success response? */
function isJsonRpcSuccess(msg) {
    return (typeof msg === "object" &&
        msg !== null &&
        "result" in msg &&
        !("method" in msg));
}
/** Type guard: is this a JSON-RPC request / notification (has a method)? */
function isJsonRpcRequest(msg) {
    return (typeof msg === "object" &&
        msg !== null &&
        "method" in msg &&
        typeof msg.method === "string");
}
/**
 * Safely parse an incoming WebSocket frame into a JSON-RPC message.
 * Returns null when the payload is not valid JSON-RPC 2.0.
 */
function parseJsonRpcMessage(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null)
            return null;
        const msg = parsed;
        if (msg.jsonrpc !== "2.0")
            return null;
        if (!("method" in msg) && !("result" in msg) && !("error" in msg)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
/** Build a tool_call request message. */
function buildToolCallRequest(id, tool, args, sessionId) {
    return {
        jsonrpc: "2.0",
        id,
        method: exports.SERVER_METHODS.TOOL_CALL,
        params: { tool, args, ...(sessionId ? { sessionId } : {}) },
    };
}
//# sourceMappingURL=protocol.js.map