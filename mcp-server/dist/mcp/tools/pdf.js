"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveAsPdfTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.saveAsPdfTool = (0, types_1.defineTool)("browser_save_as_pdf", "Save as PDF", "Print the current page to a PDF and return it as base64-encoded data.", {
    paperWidth: zod_1.z
        .number()
        .positive()
        .optional()
        .describe("Paper width in inches (default 8.5)"),
    paperHeight: zod_1.z
        .number()
        .positive()
        .optional()
        .describe("Paper height in inches (default 11)"),
    landscape: zod_1.z.boolean().optional().describe("Use landscape orientation"),
    printBackground: zod_1.z
        .boolean()
        .optional()
        .describe("Print background graphics (default true)"),
    scale: zod_1.z.number().positive().max(2).optional().describe("Scale factor (0.1-2, default 1)"),
    preferCSSPageSize: zod_1.z
        .boolean()
        .optional()
        .describe("Use the page's own @page size if present"),
});
//# sourceMappingURL=pdf.js.map