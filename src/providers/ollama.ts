import type {
    Provider,
    Message,
    ChatOptions,
    ProviderResponse,
    ToolCall,
} from "./types.js";

interface OllamaChatMessage {
    role: string;
    content: string;
    tool_calls?: Array<{
        function: {
            name: string;
            arguments: Record<string, unknown>;
        };
    }>;
}

interface OllamaStreamChunk {
    message?: OllamaChatMessage;
    done: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
    done_reason?: string;
}

interface OllamaTool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export class OllamaProvider implements Provider {
    readonly name = "ollama";
    readonly defaultModel: string;
    private apiBase: string;

    constructor(apiBase: string, defaultModel: string) {
        this.apiBase = apiBase.replace(/\/$/, "");
        this.defaultModel = defaultModel;
    }

    async chat(messages: Message[], options: ChatOptions): Promise<ProviderResponse> {
        const model = options.model ?? this.defaultModel;

        const ollamaMessages = this.convertMessages(messages, options.systemPrompt);

        const tools: OllamaTool[] | undefined = options.tools?.map((t) => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));

        const body = {
            model,
            messages: ollamaMessages,
            stream: true,
            options: {
                temperature: options.temperature ?? 0.7,
                num_predict: options.maxTokens ?? 8096,
            },
            ...(tools && tools.length > 0 ? { tools } : {}),
        };

        let fullText = "";
        const toolCalls: ToolCall[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: ProviderResponse["stopReason"] = "end_turn";

        const response = await fetch(`${this.apiBase}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
            const text = await response.text();
            throw new Error(`Ollama error: ${response.status} ${text}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // keep incomplete line in buffer

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                    const chunk = JSON.parse(trimmed) as OllamaStreamChunk;

                    if (chunk.message) {
                        // Text content
                        if (chunk.message.content) {
                            fullText += chunk.message.content;
                            if (options.onChunk) options.onChunk(chunk.message.content);
                        }

                        // Tool calls — Ollama sends these in the final chunk
                        if (chunk.message.tool_calls?.length) {
                            for (const tc of chunk.message.tool_calls) {
                                toolCalls.push({
                                    id: crypto.randomUUID(),
                                    name: tc.function.name,
                                    input: tc.function.arguments,
                                });
                            }
                            stopReason = "tool_use";
                        }
                    }

                    if (chunk.done) {
                        inputTokens = chunk.prompt_eval_count ?? 0;
                        outputTokens = chunk.eval_count ?? 0;
                        if (stopReason !== "tool_use") {
                            stopReason = this.mapStopReason(chunk.done_reason);
                        }
                    }
                } catch {
                    // skip malformed lines
                }
            }
        }

        return { content: fullText, toolCalls, inputTokens, outputTokens, stopReason };
    }

    private convertMessages(messages: Message[], systemPrompt?: string): OllamaChatMessage[] {
        const result: OllamaChatMessage[] = [];

        if (systemPrompt) {
            result.push({ role: "system", content: systemPrompt });
        }

        for (const m of messages) {
            if (m.role === "system") continue;

            // Tool result message
            if (m.role === "tool") {
                result.push({
                    role: "tool",
                    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
                });
                continue;
            }

            // Assistant message with tool calls (content block array)
            if (m.role === "assistant" && Array.isArray(m.content)) {
                const toolUseBlocks = m.content.filter((b) => b.type === "tool_use");
                const textBlocks = m.content.filter((b) => b.type === "text");

                result.push({
                    role: "assistant",
                    content: textBlocks.map((b) => b.text ?? "").join(""),
                    tool_calls: toolUseBlocks.map((b) => ({
                        function: {
                            name: b.name!,
                            arguments: b.input ?? {},
                        },
                    })),
                });
                continue;
            }

            // Regular text message
            result.push({
                role: m.role,
                content: typeof m.content === "string"
                    ? m.content
                    : m.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
            });
        }

        return result;
    }

    async listModels(): Promise<string[]> {
        try {
            const res = await fetch(`${this.apiBase}/api/tags`);
            const data = await res.json() as { models: Array<{ name: string }> };
            return data.models.map((m) => m.name);
        } catch {
            return [];
        }
    }

    private mapStopReason(reason?: string): ProviderResponse["stopReason"] {
        switch (reason) {
            case "tool_calls": return "tool_use";
            case "length": return "max_tokens";
            default: return "end_turn";
        }
    }
}