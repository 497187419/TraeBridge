import { z } from "zod";
import { defineTool } from "../types";

export const cdpTool = defineTool(
  "browser_cdp",
  "CDP passthrough",
  "Send an arbitrary Chrome DevTools Protocol command to the current tab and return the raw response. Use with care.",
  {
    method: z
      .string()
      .describe('The Chrome DevTools Protocol method, e.g. "Page.captureScreenshot"'),
    params: z
      .record(z.unknown())
      .optional()
      .describe("Parameters for the CDP method"),
  },
  // The extension's CDP passthrough only forwards method + params to the
  // currently attached tab; it has no notion of a separate CDP session id.
  (args) => ({
    method: args.method,
    ...(args.params ? { params: args.params } : {}),
  })
);
