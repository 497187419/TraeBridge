import { z } from "zod";
import { defineTool } from "../types";

export const saveAsPdfTool = defineTool(
  "browser_save_as_pdf",
  "Save as PDF",
  "Print the current page to a PDF and return it as base64-encoded data.",
  {
    paperWidth: z
      .number()
      .positive()
      .optional()
      .describe("Paper width in inches (default 8.5)"),
    paperHeight: z
      .number()
      .positive()
      .optional()
      .describe("Paper height in inches (default 11)"),
    landscape: z.boolean().optional().describe("Use landscape orientation"),
    printBackground: z
      .boolean()
      .optional()
      .describe("Print background graphics (default true)"),
    scale: z.number().positive().max(2).optional().describe("Scale factor (0.1-2, default 1)"),
    preferCSSPageSize: z
      .boolean()
      .optional()
      .describe("Use the page's own @page size if present"),
  }
);
