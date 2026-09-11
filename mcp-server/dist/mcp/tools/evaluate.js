"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.evaluateTool = (0, types_1.defineTool)("browser_evaluate", "Evaluate JavaScript", "Evaluate arbitrary JavaScript code in the context of the current page and return the result (JSON-serializable values only).", {
    code: zod_1.z.string().describe("The JavaScript code to evaluate in the page context"),
});
//# sourceMappingURL=evaluate.js.map