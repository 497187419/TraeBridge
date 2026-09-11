export declare const networkStartTool: import("../types").ToolDefinition<{
    filter?: string | undefined;
    includeBodies?: boolean | undefined;
}>;
export declare const networkStopTool: import("../types").ToolDefinition<{
    captureId: string;
}>;
export declare const networkListTool: import("../types").ToolDefinition<{
    captureId: string;
    filter?: string | undefined;
    limit?: number | undefined;
}>;
export declare const networkDetailTool: import("../types").ToolDefinition<{
    captureId: string;
    requestId: string;
}>;
