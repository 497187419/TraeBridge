"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenshotTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.screenshotTool = (0, types_1.defineTool)("browser_screenshot", "Screenshot", "Take a screenshot of the current page (or a specific element) and return it as a base64-encoded image.", {
    format: zod_1.z
        .enum(["png", "jpeg"])
        .optional()
        .describe("Image format of the screenshot (default: png)"),
    selector: zod_1.z
        .string()
        .optional()
        .describe("Optional CSS selector or @eN handle; when provided only that element is captured"),
    quality: zod_1.z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("JPEG quality 0-100 (only used with format jpeg)"),
});
//# sourceMappingURL=screenshot.js.map