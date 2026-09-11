import { z } from "zod";
import { defineTool } from "../types";

export const screenshotTool = defineTool(
  "browser_screenshot",
  "Screenshot",
  "Take a screenshot of the current page (or a specific element) and return it as a base64-encoded image.",
  {
    format: z
      .enum(["png", "jpeg"])
      .optional()
      .describe("Image format of the screenshot (default: png)"),
    selector: z
      .string()
      .optional()
      .describe(
        "Optional CSS selector or @eN handle; when provided only that element is captured"
      ),
    quality: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("JPEG quality 0-100 (only used with format jpeg)"),
  }
);
