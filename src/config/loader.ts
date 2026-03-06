import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { AppConfigSchema, type AppConfig } from './schema'

const CONFIG_FILES = ["beacnAI.json", "agent.json", "config.json"]

export function loadConfig(configPath?: string): AppConfig {
    const filePath = configPath ? resolve(configPath) : findConfigFile()

    if (!filePath || !existsSync(filePath)) {
        throw new Error(
            `Config file not found. Create beacnAI.json in your project root.\n` +
            `Run: cp beacnAI.example.json beacnAI.json`
        );
    }

    const raw = readFileSync(filePath, "utf-8");
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to parse config file at ${filePath}: ${e}`);
    }

    const result = AppConfigSchema.safeParse(parsed);
    if (!result.success) {
        const errors = result.error.issues
            .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
            .join("\n");
        throw new Error(`Config validation failed:\n${errors}`);
    }

    // Merge env vars
    const config = result.data;
    applyEnvOverrides(config);

    return config;
}

function findConfigFile(): string | undefined {
    const cwd = process.cwd();
    for (const name of CONFIG_FILES) {
        const full = resolve(cwd, name);
        if (existsSync(full)) return full;
    }
    return undefined;
}

function applyEnvOverrides(config: AppConfig): void {
    // Allow env vars to override sensitive fields
    // if (process.env.ANTHROPIC_API_KEY) {
    //     for (const [, provider] of Object.entries(config.providers)) {
    //         if (provider.type === "anthropic") {
    //             provider.apiKey = process.env.ANTHROPIC_API_KEY;
    //         }
    //     }
    // }

    // if (process.env.OPENAI_API_KEY) {
    //     for (const [, provider] of Object.entries(config.providers)) {
    //         if (provider.type === "openai") {
    //             provider.apiKey = process.env.OPENAI_API_KEY;
    //         }
    //     }
    // }

    if (process.env.DISCORD_TOKEN) {
        for (const [, channel] of Object.entries(config.channels)) {
            if (channel.type === "discord") {
                channel.token = process.env.DISCORD_TOKEN;
            }
        }
    }

    if (process.env.BEACNAI_GATEWAY_TOKEN) {
        config.gateway.token = process.env.BEACNAI_GATEWAY_TOKEN;
    }
}