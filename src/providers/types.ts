
export interface Message {
    role: "user" | "assistant" | "system" | "tool";
    content: string | ContentBlock[];
    tool_call_id?: string;
    name?: string;
}

export interface ContentBlock {
    type: "text" | "tool_use" | "tool_result";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    content?: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}

export interface ToolCall {
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ProviderResponse {
    content: string;
    toolCalls: ToolCall[];
    inputTokens: number;
    outputTokens: number;
    stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop";
}

export type ChunkHandler = (chunk: string) => void;

export interface Provider {
    readonly name: string;
    readonly defaultModel: string;
    chat(
        messages: Message[],
        options: ChatOptions
    ): Promise<ProviderResponse>;
}

export interface ChatOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
    systemPrompt?: string;
    onChunk?: ChunkHandler;
}