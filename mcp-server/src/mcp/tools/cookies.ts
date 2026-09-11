import { z } from "zod";
import { defineTool } from "../types";

/* ------------------------------------------------------------------ */
/* browser_get_cookies                                                  */
/* ------------------------------------------------------------------ */

export const getCookiesTool = defineTool(
  "browser_get_cookies",
  "Get cookies",
  "Read cookies from the browser, optionally filtered by URL and/or name.",
  {
    url: z
      .string()
      .optional()
      .describe("Only return cookies that would be sent to this URL"),
    name: z.string().optional().describe("Only return cookies with this name"),
  }
);

/* ------------------------------------------------------------------ */
/* browser_set_cookie                                                   */
/* ------------------------------------------------------------------ */

export const setCookieTool = defineTool(
  "browser_set_cookie",
  "Set cookie",
  "Create or update a cookie in the browser for the current profile.",
  {
    name: z.string().describe("Cookie name"),
    value: z.string().describe("Cookie value"),
    url: z
      .string()
      .optional()
      .describe("URL the cookie belongs to (used to derive domain/path)"),
    domain: z.string().optional().describe("Explicit cookie domain"),
    path: z.string().optional().describe("Cookie path (default: /)"),
    secure: z.boolean().optional().describe("Only send over HTTPS"),
    httpOnly: z.boolean().optional().describe("Not accessible from JavaScript"),
    sameSite: z
      .enum(["no_restriction", "lax", "strict"])
      .optional()
      .describe("SameSite policy"),
    expirationDate: z
      .number()
      .optional()
      .describe("Unix timestamp (seconds) when the cookie expires"),
  }
);
