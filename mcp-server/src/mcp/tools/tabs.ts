import { z } from "zod";
import { defineTool } from "../types";

/* ------------------------------------------------------------------ */
/* browser_list_tabs                                                    */
/* ------------------------------------------------------------------ */

export const listTabsTool = defineTool(
  "browser_list_tabs",
  "List tabs",
  "List all open browser tabs with their id, URL, title and active state.",
  {}
);

/* ------------------------------------------------------------------ */
/* browser_switch_tab                                                   */
/* ------------------------------------------------------------------ */

export const switchTabTool = defineTool(
  "browser_switch_tab",
  "Switch tab",
  "Activate (focus) the given browser tab.",
  {
    tabId: z
      .number()
      .int()
      .describe("The id of the tab to activate (from browser_list_tabs)"),
  }
);

/* ------------------------------------------------------------------ */
/* browser_close_tab                                                    */
/* ------------------------------------------------------------------ */

export const closeTabTool = defineTool(
  "browser_close_tab",
  "Close tab",
  "Close the given browser tab.",
  {
    tabId: z
      .number()
      .int()
      .describe("The id of the tab to close (from browser_list_tabs)"),
  }
);
