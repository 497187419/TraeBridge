/**
 * Shared definition shape for every MCP tool exposed by this server.
 * The MCP server registers one handler per definition and forwards the
 * call to the browser extension through the SessionManager.
 */

import { z } from "zod";

export interface ToolDefinition<TInput = Record<string, unknown>> {
  /** MCP tool name. */
  name: string;
  /** Human readable title. */
  title: string;
  /** Short description shown to the MCP client. */
  description: string;
  /**
   * Zod object schema used both to validate the tool input server-side and
   * to derive the JSON-Schema exposed to MCP clients (the SDK reads the
   * zod-to-json-schema metadata off the schema).
   */
  inputSchema: z.ZodType<TInput>;
  /**
   * Optional adapter that maps the MCP tool arguments to the shape the
   * browser extension expects. When omitted, the validated args are sent
   * as-is. Typed loosely (`any`) so a single tool list can hold tools with
   * heterogeneous argument shapes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapArgs?: (args: any) => Record<string, unknown>;
}

/**
 * Build a tool definition from a zod raw shape. The returned zod object
 * schema is what `server.registerTool()` / `server.tool()` accepts; the
 * MCP SDK converts it to a JSON-Schema for clients automatically.
 */
export function defineTool<T extends z.ZodRawShape>(
  name: string,
  title: string,
  description: string,
  shape: T,
  mapArgs?: (args: z.infer<z.ZodObject<T>>) => Record<string, unknown>
): ToolDefinition<z.infer<z.ZodObject<T>>> {
  return {
    name,
    title,
    description,
    inputSchema: z.object(shape) as unknown as z.ZodType<z.infer<z.ZodObject<T>>>,
    mapArgs,
  };
}
