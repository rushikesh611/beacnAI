import type { Tool, AgentContext } from "../types.js";

export const memorySaveTool: Tool = {
    definition: {
        name: "memory_save",
        description:
            "Save something important to long-term memory. Use this when the user shares personal info, preferences, facts you should remember across conversations, or anything explicitly asked to be remembered.",
        parameters: {
            type: "object",
            properties: {
                key: {
                    type: "string",
                    description:
                        "A short unique identifier for this memory e.g. 'user-name', 'user-timezone', 'project-stack'",
                },
                content: {
                    type: "string",
                    description: "The content to remember. Be concise and factual.",
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional tags to categorize this memory e.g. ['user', 'profile']",
                },
            },
            required: ["key", "content"],
        },
    },

    async execute(params, ctx: AgentContext): Promise<string> {
        const key = params.key as string;
        const content = params.content as string;
        const tags = (params.tags as string[]) ?? [];

        ctx.memory.save(key, content, tags);
        return `Memory saved: "${key}"`;
    },
};

export const memoryGetTool: Tool = {
    definition: {
        name: "memory_get",
        description: "Retrieve a specific memory by its exact key.",
        parameters: {
            type: "object",
            properties: {
                key: {
                    type: "string",
                    description: "The exact key of the memory to retrieve",
                },
            },
            required: ["key"],
        },
    },

    async execute(params, ctx: AgentContext): Promise<string> {
        const key = params.key as string;
        const entry = ctx.memory.get(key);

        if (!entry) return `No memory found for key: "${key}"`;
        return `**${entry.key}**: ${entry.content}`;
    },
};

export const memorySearchTool: Tool = {
    definition: {
        name: "memory_search",
        description:
            "Search long-term memory by keyword. Use this to check if you already know something about the user or a topic before asking them.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Keyword or phrase to search for across all memories",
                },
            },
            required: ["query"],
        },
    },

    async execute(params, ctx: AgentContext): Promise<string> {
        const query = params.query as string;
        const results = ctx.memory.search(query);

        if (results.length === 0) return `No memories found matching: "${query}"`;

        return results
            .map((e) => `- **${e.key}**: ${e.content}`)
            .join("\n");
    },
};

export const memoryDeleteTool: Tool = {
    definition: {
        name: "memory_delete",
        description: "Delete a memory by key. Use when the user asks you to forget something.",
        parameters: {
            type: "object",
            properties: {
                key: {
                    type: "string",
                    description: "The exact key of the memory to delete",
                },
            },
            required: ["key"],
        },
    },

    async execute(params, ctx: AgentContext): Promise<string> {
        const key = params.key as string;
        const deleted = ctx.memory.delete(key);

        return deleted
            ? `Memory deleted: "${key}"`
            : `No memory found for key: "${key}"`;
    },
};