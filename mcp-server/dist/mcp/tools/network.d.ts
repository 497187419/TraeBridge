export declare const networkStartTool: import("../types").ToolDefinition<{
    filter?: string | undefined;
    includeBodies?: boolean | undefined;
}>;
export declare const networkStopTool: import("../types").ToolDefinition<{
    captureId: string;
}>;
export declare const networkListTool: import("../types").ToolDefinition<{
    captureId: string;
    method?: string | undefined;
    filter?: string | undefined;
    includeBodies?: boolean | undefined;
    limit?: number | undefined;
    maxBodySize?: number | undefined;
}>;
export declare const networkDetailTool: import("../types").ToolDefinition<{
    captureId: string;
    requestId: string;
}>;
export declare const waitForRequestTool: import("../types").ToolDefinition<{
    method?: string | undefined;
    filter?: string | undefined;
    timeout?: number | undefined;
}>;
