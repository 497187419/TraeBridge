import { z } from "zod";
import { defineTool } from "../types";

export const typeTextTool = defineTool(
  "browser_type",
  "Type text",
  "Type text into the element that currently has focus, as if the user was typing on the keyboard.",
  {
    text: z.string().describe("The text to type into the focused element"),
  }
);
