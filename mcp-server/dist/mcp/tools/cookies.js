"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCookieTool = exports.getCookiesTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
/* ------------------------------------------------------------------ */
/* browser_get_cookies                                                  */
/* ------------------------------------------------------------------ */
exports.getCookiesTool = (0, types_1.defineTool)("browser_get_cookies", "Get cookies", "Read cookies from the browser, optionally filtered by URL and/or name.", {
    url: zod_1.z
        .string()
        .optional()
        .describe("Only return cookies that would be sent to this URL"),
    name: zod_1.z.string().optional().describe("Only return cookies with this name"),
});
/* ------------------------------------------------------------------ */
/* browser_set_cookie                                                   */
/* ------------------------------------------------------------------ */
exports.setCookieTool = (0, types_1.defineTool)("browser_set_cookie", "Set cookie", "Create or update a cookie in the browser for the current profile.", {
    name: zod_1.z.string().describe("Cookie name"),
    value: zod_1.z.string().describe("Cookie value"),
    url: zod_1.z
        .string()
        .optional()
        .describe("URL the cookie belongs to (used to derive domain/path)"),
    domain: zod_1.z.string().optional().describe("Explicit cookie domain"),
    path: zod_1.z.string().optional().describe("Cookie path (default: /)"),
    secure: zod_1.z.boolean().optional().describe("Only send over HTTPS"),
    httpOnly: zod_1.z.boolean().optional().describe("Not accessible from JavaScript"),
    sameSite: zod_1.z
        .enum(["no_restriction", "lax", "strict"])
        .optional()
        .describe("SameSite policy"),
    expirationDate: zod_1.z
        .number()
        .optional()
        .describe("Unix timestamp (seconds) when the cookie expires"),
});
//# sourceMappingURL=cookies.js.map