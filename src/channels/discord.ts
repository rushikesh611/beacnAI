import {
    Client,
    GatewayIntentBits,
    Events,
    type Message,
    type TextChannel,
    ActivityType,
} from "discord.js";
import type { Channel, IncomingMessage } from "./types.js";
import type { AgentRuntime } from "../agent/runtime.js";
import type { DiscordChannelConfigSchema } from "../config/schema.js";
import type { z } from "zod";
import { globalBus } from "../bus/event-bus.js";

type DiscordConfig = z.infer<typeof DiscordChannelConfigSchema>;

const MAX_DISCORD_LENGTH = 2000;
const TYPING_INTERVAL_MS = 5000;

export class DiscordChannel implements Channel {
    readonly name = "discord";
    private client: Client;
    private config: DiscordConfig;
    private runtime: AgentRuntime;
    private typingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

    constructor(config: DiscordConfig, runtime: AgentRuntime) {
        this.config = config;
        this.runtime = runtime;

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });
    }

    async start(): Promise<void> {
        this.client.once(Events.ClientReady, (c) => {
            console.log(`  ✅ Discord bot ready: ${c.user.tag}`);
            c.user.setActivity("and thinking...", { type: ActivityType.Watching });
        });

        this.client.on(Events.MessageCreate, (message) => {
            this.handleMessage(message).catch((err) => {
                console.error("[Discord] Error handling message:", err);
            });
        });

        await this.client.login(this.config.token);
    }

    async stop(): Promise<void> {
        for (const interval of this.typingIntervals.values()) {
            clearInterval(interval);
        }
        this.client.destroy();
        console.log("[Discord] Bot stopped.");
    }

    async send({ channelId, content }: { channelId: string; content: string }): Promise<void> {
        let targetId = channelId;

        // If channelId is not a snowflake (all digits), use fallback
        if (!/^\d+$/.test(targetId)) {
            targetId = this.config.defaultChannelId || this.config.allowedChannelIds?.[0] || "";
        }

        if (!targetId) {
            throw new Error(`No valid Discord channel ID found for "${channelId}"`);
        }

        const channel = await this.client.channels.fetch(targetId);
        if (!channel?.isTextBased()) {
            throw new Error(`Channel ${targetId} is not a text channel`);
        }

        // Split long responses into chunks — Discord's 2000 char limit
        const chunks = this.splitMessage(content);
        for (const chunk of chunks) {
            await (channel as TextChannel).send(chunk);
        }
    }

    private async handleMessage(message: Message): Promise<void> {
        // Ignore messages from bots (including self)
        if (message.author.bot) return;

        // Check if message is in an allowed channel (if configured)
        if (
            this.config.allowedChannelIds?.length &&
            !this.config.allowedChannelIds.includes(message.channelId)
        ) {
            return;
        }

        // Only respond in guilds if guildId is set and matches
        if (this.config.guildId && message.guildId !== this.config.guildId) {
            return;
        }

        // Respond to DMs always, guild messages only when mentioned or replied to
        const isDM = !message.guildId;
        const isMentioned = message.mentions.has(this.client.user!.id);
        const isReply = message.reference?.messageId !== undefined;

        if (!isDM && !isMentioned && !isReply) return;

        // Strip the bot mention from the message content
        const content = message.content
            .replace(`<@${this.client.user!.id}>`, "")
            .replace(`<@!${this.client.user!.id}>`, "")
            .trim();

        if (!content) {
            await message.reply("Yes? How can I help?");
            return;
        }

        const incoming: IncomingMessage = {
            channelId: message.channelId,
            userId: message.author.id,
            username: message.author.username,
            content,
            raw: message,
        };

        await globalBus.emit("channel:message:incoming", incoming);

        // Start typing indicator
        this.startTyping(message.channelId, message.channel as TextChannel);

        // Placeholder message we'll edit as chunks stream in
        const placeholder = await message.reply("...");
        let accumulated = "";
        let lastEdit = Date.now();
        const EDIT_THROTTLE_MS = 1000; // edit at most once per second

        try {
            const result = await this.runtime.run({
                agentId: this.config.agentId,
                channelId: message.channelId,
                userId: message.author.id,
                message: content,
                onChunk: async (chunk) => {
                    accumulated += chunk;

                    // Throttle edits to avoid Discord rate limits
                    const now = Date.now();
                    if (now - lastEdit >= EDIT_THROTTLE_MS) {
                        lastEdit = now;
                        const display = this.truncateForDiscord(accumulated);
                        await placeholder.edit(display).catch(() => { });
                    }
                },
            });

            this.stopTyping(message.channelId);

            const finalResponse = result.response || accumulated;

            if (!finalResponse) {
                await placeholder.edit("_(no response)_");
                return;
            }

            // Final edit with complete response
            const chunks = this.splitMessage(finalResponse);

            const [firstChunk, ...remainingChunks] = chunks;

            if (firstChunk) {
                // Edit the placeholder with the first chunk
                await placeholder.edit(firstChunk).catch(() => { });

                // Send remaining chunks as follow-up messages
                for (const chunk of remainingChunks) {
                    await (message.channel as TextChannel).send(chunk);
                }
            }

            // Append token info as a subtle footer on the last message
            if (result.toolCallsMade.length > 0) {
                const footer =
                    `-# 🔧 ${result.toolCallsMade.join(", ")} · ${result.inputTokens}↑ ${result.outputTokens}↓`;
                await (message.channel as TextChannel).send(footer).catch(() => { });
            }

            await globalBus.emit("channel:message:sent", {
                channelId: message.channelId,
                userId: message.author.id,
                response: finalResponse,
            });
        } catch (err) {
            this.stopTyping(message.channelId);
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error("[Discord] Agent run error:", errMsg);
            await placeholder.edit(`❌ Error: ${errMsg}`).catch(() => { });
        }
    }

    private startTyping(channelId: string, channel: TextChannel) {
        this.stopTyping(channelId); // clear any existing interval
        channel.sendTyping().catch(() => { });

        const interval = setInterval(() => {
            channel.sendTyping().catch(() => { });
        }, TYPING_INTERVAL_MS);

        this.typingIntervals.set(channelId, interval);
    }

    private stopTyping(channelId: string) {
        const interval = this.typingIntervals.get(channelId);
        if (interval) {
            clearInterval(interval);
            this.typingIntervals.delete(channelId);
        }
    }

    private splitMessage(content: string): string[] {
        if (content.length <= MAX_DISCORD_LENGTH) return [content];

        const chunks: string[] = [];
        let remaining = content;

        while (remaining.length > 0) {
            if (remaining.length <= MAX_DISCORD_LENGTH) {
                chunks.push(remaining);
                break;
            }

            // Try to split at a newline within the limit
            let splitAt = remaining.lastIndexOf("\n", MAX_DISCORD_LENGTH);
            if (splitAt === -1 || splitAt < MAX_DISCORD_LENGTH / 2) {
                // No good newline — split at word boundary
                splitAt = remaining.lastIndexOf(" ", MAX_DISCORD_LENGTH);
            }
            if (splitAt === -1) {
                // No word boundary either — hard split
                splitAt = MAX_DISCORD_LENGTH;
            }

            chunks.push(remaining.slice(0, splitAt).trim());
            remaining = remaining.slice(splitAt).trim();
        }

        return chunks.filter(Boolean);
    }

    private truncateForDiscord(content: string): string {
        if (content.length <= MAX_DISCORD_LENGTH) return content;
        return content.slice(0, MAX_DISCORD_LENGTH - 3) + "...";
    }
}