import { z } from "zod";
import { defineTool } from "../types";

export const navigateTool = defineTool(
  "browser_navigate",
  "Navigate",
  "Navigate the current browser tab (or a new tab) to the given URL.",
  {
    url: z.string().url().describe("The URL to navigate to"),
    newTab: z.boolean().optional().describe("Open the URL in a new tab (default: current tab)"),
  }
);
