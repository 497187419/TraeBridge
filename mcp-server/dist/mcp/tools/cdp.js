"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdpTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.cdpTool = (0, types_1.defineTool)("browser_cdp", "CDP passthrough", "Send an arbitrary Chrome DevTools Protocol command to the current tab and return the raw response. Use with care.", {
    method: zod_1.z
        .string()
        .describe('The Chrome DevTools Protocol method, e.g. "Page.captureScreenshot"'),
    params: zod_1.z
        .record(zod_1.z.unknown())
        .optional()
        .describe("Parameters for the CDP method"),
}, 
// The extension's CDP passthrough only forwards method + params to the
// currently attached tab; it has no notion of a separate CDP session id.
(args) => ({
    method: args.method,
    ...(args.params ? { params: args.params } : {}),
}));
//# sourceMappingURL=cdp.js.map