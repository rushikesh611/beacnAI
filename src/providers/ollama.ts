import type { ChatOptions, Message, Provider, ProviderResponse, ToolCall } from "./types";

interface OllamaMessage {
    role: string;
    content: string;
    tool_calls?: Array<{ function: { name: string, arguments: Record<string, unknown> } }>
}

interface OllamaResponse {
    message: OllamaMessage;
    done: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
    done_reason?: string
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
        const ollamaMessages: OllamaMessage[] = []

        if (options.systemPrompt) {
            ollamaMessages.push({ role: "system", content: options.systemPrompt });
        }

        for (const m of messages) {
            if (m.role === "system") continue;
            ollamaMessages.push({
                role: m.role,
                content: typeof m.content === "string"
                    ? m.content
                    : m.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
            });
        }

        const body = {
            model,
            messages: ollamaMessages,
            stream: !!options.onChunk,
            options: {
                temperature: options.temperature ?? 0.7,
                num_predict: options.maxTokens ?? 8096,
            },
            tools: options.tools?.map((t) => ({
                type: "function",
                function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
        };

        let fullText = "";
        const toolCalls: ToolCall[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: ProviderResponse["stopReason"] = "end_turn";

        if (options.onChunk) {
            const response = await fetch(`${this.apiBase}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok || !response.body) {
                throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const lines = decoder.decode(value).split("\n").filter(Boolean);
                for (const line of lines) {
                    try {
                        const chunk = JSON.parse(line) as OllamaResponse;
                        if (chunk.message?.content) {
                            fullText += chunk.message.content;
                            options.onChunk(chunk.message.content);
                        }
                        if (chunk.done) {
                            inputTokens = chunk.prompt_eval_count ?? 0;
                            outputTokens = chunk.eval_count ?? 0;
                            stopReason = this.mapStopReason(chunk.done_reason);
                        }
                    } catch {
                        // Skip malformed lines
                    }
                }
            }
        } else {
            const response = await fetch(`${this.apiBase}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...body, stream: false }),
            });

            if (!response.ok) {
                throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
            }

            const data = (await response.json()) as OllamaResponse;
            fullText = data.message?.content ?? "";
            inputTokens = data.prompt_eval_count ?? 0;
            outputTokens = data.eval_count ?? 0;
            stopReason = this.mapStopReason(data.done_reason);

            for (const tc of data.message?.tool_calls ?? []) {
                toolCalls.push({
                    id: crypto.randomUUID(),
                    name: tc.function.name,
                    input: tc.function.arguments,
                });
            }
        }

        return { content: fullText, toolCalls, inputTokens, outputTokens, stopReason };
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
