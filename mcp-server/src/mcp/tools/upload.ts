import { z } from "zod";
import { defineTool } from "../types";

export const uploadTool = defineTool(
  "browser_upload",
  "Upload files",
  "Attach local files to a file input element on the page (as if picked via the file chooser).",
  {
    selector: z
      .string()
      .describe(
        "The file input element (CSS selector or @eN handle) to set files on"
      ),
    files: z
      .array(z.string())
      .min(1)
      .describe("Absolute paths of the files to upload"),
  }
);
