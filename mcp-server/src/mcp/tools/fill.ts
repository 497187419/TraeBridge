import { z } from "zod";
import { defineTool } from "../types";

export const fillTool = defineTool(
  "browser_fill",
  "Fill",
  "Fill an input or textarea element (identified by CSS selector or @eN handle) with the given value, replacing any existing content.",
  {
    selector: z
      .string()
      .describe(
        "Input element selector: a CSS selector or an @eN handle obtained from browser_snapshot"
      ),
    value: z.string().describe("The value to fill into the input"),
  }
);
