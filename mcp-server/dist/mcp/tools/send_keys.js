"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendKeysTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.sendKeysTool = (0, types_1.defineTool)("browser_send_keys", "Send keys", "Send individual key presses / keyboard shortcuts to the focused element. For typing literal text prefer browser_type.", {
    keys: zod_1.z
        .array(zod_1.z.string())
        .describe('List of keys to press in sequence, e.g. ["Control", "a"] or ["Enter"]. Use key names like "Enter", "Tab", "Escape", "ArrowDown", "Control", "Shift", etc.'),
    repeat: zod_1.z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Repeat the key sequence this many times (default 1)"),
}, 
// The extension expects a single space-joined "keys" string ("Ctrl+a Enter")
// plus an optional "repeat" count, so join the array here.
(args) => ({ keys: args.keys.join(" "), ...(args.repeat ? { repeat: args.repeat } : {}) }));
//# sourceMappingURL=send_keys.js.map