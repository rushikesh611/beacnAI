import type { Channel } from "./types.js";
import { DiscordChannel } from "./discord.js";
import type { AppConfig } from "../config/schema.js";
import type { AgentRuntime } from "../agent/runtime.js";

export class ChannelRegistry {
    private channels: Map<string, Channel> = new Map();

    constructor(config: AppConfig, runtime: AgentRuntime) {
        this.load(config, runtime);
    }

    private load(config: AppConfig, runtime: AgentRuntime) {
        for (const [name, channelConfig] of Object.entries(config.channels)) {
            switch (channelConfig.type) {
                case "discord": {
                    const channel = new DiscordChannel(channelConfig, runtime);
                    this.channels.set(name, channel);
                    console.log(`  ✅ Channel registered: ${name} (discord)`);
                    break;
                }
                default:
                    console.warn(`[ChannelRegistry] Unknown channel type for "${name}"`);
            }
        }
    }

    async startAll(): Promise<void> {
        for (const [name, channel] of this.channels) {
            console.log(`  🔌 Starting channel: ${name}`);
            await channel.start();
        }
    }

    async stopAll(): Promise<void> {
        for (const channel of this.channels.values()) {
            await channel.stop();
        }
    }

    get(name: string): Channel | undefined {
        return this.channels.get(name);
    }

    list(): string[] {
        return [...this.channels.keys()];
    }
}