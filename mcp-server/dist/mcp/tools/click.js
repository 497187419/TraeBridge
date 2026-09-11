"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clickTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.clickTool = (0, types_1.defineTool)("browser_click", "Click", "Click an element on the page identified by a CSS selector or an @eN snapshot handle.", {
    selector: zod_1.z
        .string()
        .describe("Element selector: a CSS selector or an @eN handle obtained from browser_snapshot"),
});
//# sourceMappingURL=click.js.map