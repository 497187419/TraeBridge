import { z } from "zod";
import { defineTool } from "../types";

export const sendKeysTool = defineTool(
  "browser_send_keys",
  "Send keys",
  "Send individual key presses / keyboard shortcuts to the focused element. For typing literal text prefer browser_type.",
  {
    keys: z
      .array(z.string())
      .describe(
        'List of keys to press in sequence, e.g. ["Control", "a"] or ["Enter"]. Use key names like "Enter", "Tab", "Escape", "ArrowDown", "Control", "Shift", etc.'
      ),
    repeat: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Repeat the key sequence this many times (default 1)"),
  },
  // The extension expects a single space-joined "keys" string ("Ctrl+a Enter")
  // plus an optional "repeat" count, so join the array here.
  (args) => ({ keys: args.keys.join(" "), ...(args.repeat ? { repeat: args.repeat } : {}) })
);
