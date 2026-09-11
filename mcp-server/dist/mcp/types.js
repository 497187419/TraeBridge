"use strict";
/**
 * Shared definition shape for every MCP tool exposed by this server.
 * The MCP server registers one handler per definition and forwards the
 * call to the browser extension through the SessionManager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineTool = defineTool;
const zod_1 = require("zod");
/**
 * Build a tool definition from a zod raw shape. The returned zod object
 * schema is what `server.registerTool()` / `server.tool()` accepts; the
 * MCP SDK converts it to a JSON-Schema for clients automatically.
 */
function defineTool(name, title, description, shape, mapArgs) {
    return {
        name,
        title,
        description,
        inputSchema: zod_1.z.object(shape),
        mapArgs,
    };
}
//# sourceMappingURL=types.js.map