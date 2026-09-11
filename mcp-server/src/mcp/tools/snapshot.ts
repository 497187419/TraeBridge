import { defineTool } from "../types";

export const snapshotTool = defineTool(
  "browser_snapshot",
  "Snapshot",
  "Capture an accessibility-tree (AX) snapshot of the current page. Element handles (@eN) returned by this tool can be used as selectors by the other tools.",
  {}
);
