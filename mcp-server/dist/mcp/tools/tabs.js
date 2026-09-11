"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeTabTool = exports.switchTabTool = exports.listTabsTool = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
/* ------------------------------------------------------------------ */
/* browser_list_tabs                                                    */
/* ------------------------------------------------------------------ */
exports.listTabsTool = (0, types_1.defineTool)("browser_list_tabs", "List tabs", "List all open browser tabs with their id, URL, title and active state.", {});
/* ------------------------------------------------------------------ */
/* browser_switch_tab                                                   */
/* ------------------------------------------------------------------ */
exports.switchTabTool = (0, types_1.defineTool)("browser_switch_tab", "Switch tab", "Activate (focus) the given browser tab.", {
    tabId: zod_1.z
        .number()
        .int()
        .describe("The id of the tab to activate (from browser_list_tabs)"),
});
/* ------------------------------------------------------------------ */
/* browser_close_tab                                                    */
/* ------------------------------------------------------------------ */
exports.closeTabTool = (0, types_1.defineTool)("browser_close_tab", "Close tab", "Close the given browser tab.", {
    tabId: zod_1.z
        .number()
        .int()
        .describe("The id of the tab to close (from browser_list_tabs)"),
});
//# sourceMappingURL=tabs.js.map