import { z } from "zod";
import { defineTool } from "../types";

/* ------------------------------------------------------------------ */
/* browser_network_start                                                */
/* ------------------------------------------------------------------ */

export const networkStartTool = defineTool(
  "browser_network_start",
  "Network capture: start",
  "Start capturing network requests made by the page. Returns a captureId used with the other browser_network_* tools.",
  {
    filter: z
      .string()
      .optional()
      .describe("Optional URL substring / pattern to filter captured requests"),
    includeBodies: z
      .boolean()
      .optional()
      .describe("Also capture request/response bodies (default: false)"),
  },
  // The extension currently runs a single capture per tab and does not
  // consume filter/includeBodies at start time; filtering is applied on
  // list. Drop them here so the extension receives a clean argument set.
  () => ({})
);

/* ------------------------------------------------------------------ */
/* browser_network_stop                                                 */
/* ------------------------------------------------------------------ */

export const networkStopTool = defineTool(
  "browser_network_stop",
  "Network capture: stop",
  "Stop a running network capture and return the captured requests.",
  {
    captureId: z.string().describe("The capture id returned by browser_network_start"),
  },
  // The extension stops the capture on the current tab and does not need
  // the captureId on the wire.
  () => ({})
);

/* ------------------------------------------------------------------ */
/* browser_network_list                                                 */
/* ------------------------------------------------------------------ */

export const networkListTool = defineTool(
  "browser_network_list",
  "Network capture: list",
  "List the requests captured so far by an active (or stopped) network capture.",
  {
    captureId: z.string().describe("The capture id returned by browser_network_start"),
    limit: z.number().int().positive().optional().describe("Max requests to return"),
    filter: z
      .string()
      .optional()
      .describe("Optional URL substring to filter the returned requests"),
  },
  // Forward only what the extension understands: filter + limit.
  (args) => ({
    ...(args.filter ? { filter: args.filter } : {}),
    ...(args.limit ? { limit: args.limit } : {}),
  })
);

/* ------------------------------------------------------------------ */
/* browser_network_detail                                               */
/* ------------------------------------------------------------------ */

export const networkDetailTool = defineTool(
  "browser_network_detail",
  "Network capture: detail",
  "Get the full details (headers, body, timing) of one captured request.",
  {
    captureId: z.string().describe("The capture id returned by browser_network_start"),
    requestId: z.string().describe("The request id from browser_network_list"),
  },
  // Only requestId is needed by the extension to fetch the response body.
  (args) => ({ requestId: args.requestId })
);
