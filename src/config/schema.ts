import { z } from 'zod'

export const GatewayConfigSchema = z.object({
    port: z.number().default(18789),
    host: z.string().default("127.0.0.1"),
    token: z.string().optional(),
})

export const ProviderConfigSchema = z.discriminatedUnion("type", [
    // z.object({
    //     type: z.literal("anthropic"),
    //     apiKey: z.string(),
    //     defaultModel: z.string().default("claude-sonnet-4-20250514"),
    // }),
    // z.object({
    //     type: z.literal("openai"),
    //     apiKey: z.string(),
    //     apiBase: z.string().optional(),
    //     defaultModel: z.string().default("gpt-4o"),
    // }),
    z.object({
        type: z.literal("ollama"),
        apiBase: z.string().default("http://localhost:11434"),
        defaultModel: z.string().default("qwen2.5")
    })
])

export const AgentConfigSchema = z.object({
    provider: z.string(),
    model: z.string().optional(),
    systemPromptFile: z.string().default("workspace/SOUL.md"),
    userFile: z.string().default("workspace/USER.md"),
    maxToolCallDepth: z.number().default(10),
    temperature: z.number().default(0.7),
})

export const DiscordChannelConfigSchema = z.object({
    type: z.literal("discord"),
    token: z.string(),
    guildId: z.string().optional(),
    allowedChannelIds: z.array(z.string()).optional(),
    defaultChannelId: z.string().optional(),
    agentId: z.string().default("default"),
});

export const ChannelConfigSchema = z.discriminatedUnion("type", [
    DiscordChannelConfigSchema,
]);

export const CronConfigSchema = z.object({
    heartbeat: z.string().default("0 * * * *"),
    jobs: z
        .array(
            z.object({
                id: z.string(),
                cron: z.string(),
                prompt: z.string(),
                agentId: z.string().default("default"),
            })
        )
        .default([]),
});

export const AppConfigSchema = z.object({
    gateway: GatewayConfigSchema.default({
        port: 18789,
        host: "127.0.0.1",
    }),
    providers: z.record(z.string(), ProviderConfigSchema),
    agents: z.record(z.string(), AgentConfigSchema),
    channels: z.record(z.string(), ChannelConfigSchema).default({}),
    cron: CronConfigSchema.default({
        heartbeat: "0 * * * *",
        jobs: [],
    }),
    skillsDir: z.string().default("skills"),
    workspaceDir: z.string().default("workspace"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;