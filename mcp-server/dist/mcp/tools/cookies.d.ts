export declare const getCookiesTool: import("../types").ToolDefinition<{
    url?: string | undefined;
    name?: string | undefined;
}>;
export declare const setCookieTool: import("../types").ToolDefinition<{
    value: string;
    name: string;
    path?: string | undefined;
    url?: string | undefined;
    domain?: string | undefined;
    secure?: boolean | undefined;
    httpOnly?: boolean | undefined;
    sameSite?: "strict" | "no_restriction" | "lax" | undefined;
    expirationDate?: number | undefined;
}>;
