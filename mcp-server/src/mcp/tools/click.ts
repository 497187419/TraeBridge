import { z } from "zod";
import { defineTool } from "../types";

export const clickTool = defineTool(
  "browser_click",
  "Click",
  "Click an element on the page identified by a CSS selector or an @eN snapshot handle.",
  {
    selector: z
      .string()
      .describe(
        "Element selector: a CSS selector or an @eN handle obtained from browser_snapshot"
      ),
  }
);
