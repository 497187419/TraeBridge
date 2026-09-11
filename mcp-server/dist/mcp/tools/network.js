"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.networkDetailTool = exports.networkListTool = exports.networkStopTool = exports.networkStartTool = void 0;
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
exports.networkListTool = (0, types_1.defineTool)("browser_network_list", "Network capture: list", "List the requests captured so far by an active (or stopped) network capture.", {
    captureId: zod_1.z.string().describe("The capture id returned by browser_network_start"),
    limit: zod_1.z.number().int().positive().optional().describe("Max requests to return"),
    filter: zod_1.z
        .string()
        .optional()
        .describe("Optional URL substring to filter the returned requests"),
}, 
// Forward only what the extension understands: filter + limit.
(args) => ({
    ...(args.filter ? { filter: args.filter } : {}),
    ...(args.limit ? { limit: args.limit } : {}),
}));
/* ------------------------------------------------------------------ */
/* browser_network_detail                                               */
/* ------------------------------------------------------------------ */
exports.networkDetailTool = (0, types_1.defineTool)("browser_network_detail", "Network capture: detail", "Get the full details (headers, body, timing) of one captured request.", {
    captureId: zod_1.z.string().describe("The capture id returned by browser_network_start"),
    requestId: zod_1.z.string().describe("The request id from browser_network_list"),
}, 
// Only requestId is needed by the extension to fetch the response body.
(args) => ({ requestId: args.requestId }));
//# sourceMappingURL=network.js.map