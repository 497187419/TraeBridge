"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.fillTool = (0, types_1.defineTool)("browser_fill", "Fill", "Fill an input or textarea element (identified by CSS selector or @eN handle) with the given value, replacing any existing content.", {
    selector: zod_1.z
        .string()
        .describe("Input element selector: a CSS selector or an @eN handle obtained from browser_snapshot"),
    value: zod_1.z.string().describe("The value to fill into the input"),
});
//# sourceMappingURL=fill.js.map