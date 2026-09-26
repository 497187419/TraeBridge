"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForRequestTool = exports.networkDetailTool = exports.networkListTool = exports.networkStopTool = exports.networkStartTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
/* ------------------------------------------------------------------ */
/* browser_network_start                                                */
/* ------------------------------------------------------------------ */
exports.networkStartTool = (0, types_1.defineTool)("browser_network_start", "Network capture: start", "Start capturing network requests made by the page. Returns a captureId used with the other browser_network_* tools.", {
    filter: zod_1.z
        .string()
        .optional()
        .describe("Optional URL substring / pattern to filter captured requests"),
    includeBodies: zod_1.z
        .boolean()
        .optional()
        .describe("Also capture request/response bodies (default: false)"),
}, 
// The extension currently runs a single capture per tab and does not
// consume filter/includeBodies at start time; filtering is applied on
// list. Drop them here so the extension receives a clean argument set.
() => ({}));
/* ------------------------------------------------------------------ */
/* browser_network_stop                                                 */
/* ------------------------------------------------------------------ */
exports.networkStopTool = (0, types_1.defineTool)("browser_network_stop", "Network capture: stop", "Stop a running network capture and return the captured requests.", {
    captureId: zod_1.z.string().describe("The capture id returned by browser_network_start"),
}, 
// The extension stops the capture on the current tab and does not need
// the captureId on the wire.
() => ({}));
/* ------------------------------------------------------------------ */
/* browser_network_list                                                 */
/* ------------------------------------------------------------------ */
exports.networkListTool = (0, types_1.defineTool)("browser_network_list", "Network capture: list", "List the requests captured so far by an active (or stopped) network capture. Optional includeBodies fetches response bodies inline, eliminating N+1 detail calls.", {
    captureId: zod_1.z.string().describe("The capture id returned by browser_network_start"),
    limit: zod_1.z.number().int().positive().optional().describe("Max requests to return"),
    filter: zod_1.z
        .string()
        .optional()
        .describe("Optional URL substring to filter the returned requests"),
    method: zod_1.z
        .string()
        .optional()
        .describe("Optional HTTP method to filter (e.g. GET, POST). Excludes OPTIONS preflight noise."),
    includeBodies: zod_1.z
        .boolean()
        .optional()
        .describe("Also fetch response bodies inline for completed requests (default: false)"),
    maxBodySize: zod_1.z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Truncate inline bodies to this many chars if includeBodies is true (default: 2000)"),
}, 
// Forward only what the extension understands.
(args) => ({
    ...(args.filter ? { filter: args.filter } : {}),
    ...(args.method ? { method: args.method } : {}),
    ...(args.limit ? { limit: args.limit } : {}),
    ...(args.includeBodies ? { includeBodies: args.includeBodies } : {}),
    ...(args.maxBodySize ? { maxBodySize: args.maxBodySize } : {}),
}));
/* ------------------------------------------------------------------ */
/* browser_network_detail                                               */
/* ------------------------------------------------------------------ */
exports.networkDetailTool = (0, types_1.defineTool)("browser_network_detail", "Network capture: detail", "Get the full details (request headers, postData, response headers, timing, body) of one captured request.", {
    captureId: zod_1.z.string().describe("The capture id returned by browser_network_start"),
    requestId: zod_1.z.string().describe("The request id from browser_network_list"),
}, 
// Only requestId is needed by the extension to fetch the response body.
(args) => ({ requestId: args.requestId }));
/* ------------------------------------------------------------------ */
/* browser_wait_for_request                                             */
/* ------------------------------------------------------------------ */
exports.waitForRequestTool = (0, types_1.defineTool)("browser_wait_for_request", "Network: wait for request", "Wait until a network request matching the filter completes (or fails). Use after start_capture + triggering an action to eliminate race conditions before reading results. Entries already returned by a previous wait are not matched again within the same capture.", {
    filter: zod_1.z
        .string()
        .optional()
        .describe("URL substring to match. Omit to wait for ANY next completed request."),
    method: zod_1.z
        .string()
        .optional()
        .describe("HTTP method to match (e.g. POST). Recommended — without it a same-URL OPTIONS preflight can satisfy the wait before the real response arrives."),
    timeout: zod_1.z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Wait timeout in ms, 500–120000 (default: 15000)"),
}, (args) => ({
    ...(args.filter ? { filter: args.filter } : {}),
    ...(args.method ? { method: args.method } : {}),
    ...(args.timeout ? { timeout: args.timeout } : {}),
}), 
// Wait tools are long-polling. Give the MCP round-trip a 5 s margin over
// the extension-side wait timeout so the extension's descriptive error
// (or a just-in-time success at the deadline) reaches the caller instead
// of racing a simultaneous generic MCP-side timeout.
(args) => Math.min(Math.max(Number(args.timeout) || 15000, 500) + 5000, 125000));
//# sourceMappingURL=network.js.map