"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.navigateTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.navigateTool = (0, types_1.defineTool)("browser_navigate", "Navigate", "Navigate the current browser tab (or a new tab) to the given URL.", {
    url: zod_1.z.string().url().describe("The URL to navigate to"),
    newTab: zod_1.z.boolean().optional().describe("Open the URL in a new tab (default: current tab)"),
});
//# sourceMappingURL=navigate.js.map