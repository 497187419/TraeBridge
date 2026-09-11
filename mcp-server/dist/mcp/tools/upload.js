"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
exports.uploadTool = (0, types_1.defineTool)("browser_upload", "Upload files", "Attach local files to a file input element on the page (as if picked via the file chooser).", {
    selector: zod_1.z
        .string()
        .describe("The file input element (CSS selector or @eN handle) to set files on"),
    files: zod_1.z
        .array(zod_1.z.string())
        .min(1)
        .describe("Absolute paths of the files to upload"),
});
//# sourceMappingURL=upload.js.map