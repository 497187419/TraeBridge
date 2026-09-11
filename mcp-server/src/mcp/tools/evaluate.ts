import { z } from "zod";
import { defineTool } from "../types";

export const evaluateTool = defineTool(
  "browser_evaluate",
  "Evaluate JavaScript",
  "Evaluate arbitrary JavaScript code in the context of the current page and return the result (JSON-serializable values only).",
  {
    code: z.string().describe("The JavaScript code to evaluate in the page context"),
  }
);
