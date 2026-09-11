"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeTextTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.typeTextTool = (0, types_1.defineTool)("browser_type", "Type text", "Type text into the element that currently has focus, as if the user was typing on the keyboard.", {
    text: zod_1.z.string().describe("The text to type into the focused element"),
});
//# sourceMappingURL=type_text.js.map