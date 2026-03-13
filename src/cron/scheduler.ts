import type { AgentRuntime } from "../agent/runtime.js";
import type { AppConfig } from "../config/schema.js";
import type { ChannelRegistry } from "../channels/registry.js";
import { globalBus } from "../bus/event-bus.js";

interface CronJob {
    id: string;
    cronExpression: string;
    prompt: string;
    agentId: string;
    channelId?: string;
    userId?: string;
    nextRun: number;
    lastRun?: number;
    running: boolean;
}

export class CronScheduler {
    private jobs: Map<string, CronJob> = new Map();
    private runtime: AgentRuntime;
    private channels?: ChannelRegistry;
    private config: AppConfig;
    private tickInterval?: ReturnType<typeof setInterval>;

    constructor(
        config: AppConfig,
        runtime: AgentRuntime,
        channels?: ChannelRegistry
    ) {
        this.config = config;
        this.runtime = runtime;
        this.channels = channels;
        this.load();
    }

    private load() {
        const { cron } = this.config;

        // Register heartbeat job
        if (cron.heartbeat) {
            this.register({
                id: "heartbeat",
                cronExpression: cron.heartbeat,
                prompt: [
                    "This is your scheduled heartbeat check.",
                    "Review your memories and consider if there is anything proactive to do.",
                    "If there is nothing actionable right now, respond with exactly: NOOP",
                    "Otherwise, respond with a brief message to send to the default channel.",
                ].join(" "),
                agentId: "default",
            });
        }

        // Register user-defined cron jobs from config
        for (const job of cron.jobs) {
            this.register({
                id: job.id,
                cronExpression: job.cron,
                prompt: job.prompt,
                agentId: job.agentId ?? "default",
            });
        }

        console.log(`  ✅ Cron jobs registered: ${[...this.jobs.keys()].join(", ") || "none"}`);
    }

    register(job: Omit<CronJob, "nextRun" | "lastRun" | "running">) {
        const nextRun = this.getNextRun(job.cronExpression);
        this.jobs.set(job.id, {
            ...job,
            nextRun,
            running: false,
        });
    }

    start() {
        // Tick every 60 seconds — check which jobs are due
        this.tickInterval = setInterval(() => this.tick(), 60_000);
        console.log(`  ✅ Scheduler started — ticking every 60s`);

        globalBus.on("gateway:heartbeat", () => {
            this.tick();
        });
    }

    stop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = undefined;
        }
    }

    private async tick() {
        const now = Date.now();

        for (const job of this.jobs.values()) {
            if (job.running) continue;
            if (now < job.nextRun) continue;

            // Job is due — run it
            job.running = true;
            job.lastRun = now;
            job.nextRun = this.getNextRun(job.cronExpression);

            await globalBus.emit("cron:job:start", {
                id: job.id,
                ts: now,
                nextRun: job.nextRun,
            });

            console.log(`\n[Cron] Running job: ${job.id}`);

            this.runJob(job)
                .catch((err) => {
                    console.error(`[Cron] Job "${job.id}" failed:`, err);
                })
                .finally(() => {
                    job.running = false;
                });
        }
    }

    private async runJob(job: CronJob) {
        const result = await this.runtime.run({
            agentId: job.agentId,
            channelId: job.channelId ?? "cron",
            userId: job.userId ?? "scheduler",
            message: job.prompt,
        });

        const response = result.response.trim();

        await globalBus.emit("cron:job:complete", {
            id: job.id,
            response,
            toolCallsMade: result.toolCallsMade,
        });

        // NOOP — agent decided nothing to do
        if (response.toUpperCase() === "NOOP" || !response) {
            console.log(`[Cron] Job "${job.id}" — no action needed`);
            return;
        }

        console.log(`[Cron] Job "${job.id}" response: ${response.slice(0, 100)}...`);

        // If a channel is configured, send the response there
        if (job.channelId && this.channels) {
            const channel = this.channels.get(job.channelId);
            if (channel) {
                await channel.send({ channelId: job.channelId, content: response });
            }
        } else if (this.channels) {
            // Fall back to broadcasting to all channels
            for (const name of this.channels.list()) {
                const channel = this.channels.get(name);
                if (channel) {
                    await channel.send({
                        channelId: name,
                        content: `📅 **Scheduled update:**\n${response}`,
                    }).catch((err) => {
                        console.error(`[Cron] Failed to send to channel "${name}":`, err);
                    });
                }
            }
        }
    }

    // ── Cron expression parser ──────────────────────────────────────────────────
    // Supports standard 5-field cron: minute hour day month weekday
    // e.g. "0 * * * *" = every hour, "0 9 * * 1-5" = 9am weekdays

    private getNextRun(expression: string): number {
        try {
            return this.calculateNextRun(expression, new Date());
        } catch {
            // Fallback — run in 1 hour if expression is invalid
            console.warn(`[Cron] Invalid expression "${expression}" — defaulting to 1h interval`);
            return Date.now() + 60 * 60 * 1000;
        }
    }

    private calculateNextRun(expression: string, from: Date): number {
        const fields = expression.trim().split(/\s+/);
        if (fields.length !== 5) {
            throw new Error(`Expected 5 fields, got ${fields.length}`);
        }

        const [minuteF, hourF, domF, monthF, dowF] = fields as [string, string, string, string, string];

        // Start from next minute
        const next = new Date(from);
        next.setSeconds(0);
        next.setMilliseconds(0);
        next.setMinutes(next.getMinutes() + 1);

        // Search up to 1 year ahead
        const limit = new Date(from);
        limit.setFullYear(limit.getFullYear() + 1);

        while (next < limit) {
            if (
                this.fieldMatches(next.getMonth() + 1, monthF, 1, 12) &&
                this.fieldMatches(next.getDate(), domF, 1, 31) &&
                this.fieldMatches(next.getDay(), dowF, 0, 6) &&
                this.fieldMatches(next.getHours(), hourF, 0, 23) &&
                this.fieldMatches(next.getMinutes(), minuteF, 0, 59)
            ) {
                return next.getTime();
            }
            next.setMinutes(next.getMinutes() + 1);
        }

        throw new Error(`Could not calculate next run for: ${expression}`);
    }

    private fieldMatches(value: number, field: string, min: number, max: number): boolean {
        // Wildcard
        if (field === "*") return true;

        // Step values: */15, 0-59/5
        if (field.includes("/")) {
            const [range, stepStr] = field.split("/") as [string, string];
            const step = parseInt(stepStr);
            const rangeParts = range === "*"
                ? [min, max]
                : range.split("-").map(Number);
            const rangeMin = rangeParts[0]!;
            const rangeMax = rangeParts[1]!;
            if (value < rangeMin || value > rangeMax) return false;
            return (value - rangeMin) % step === 0;
        }

        // Range: 1-5
        if (field.includes("-")) {
            const parts = field.split("-").map(Number);
            const lo = parts[0]!;
            const hi = parts[1]!;
            return value >= lo && value <= hi;
        }

        // List: 1,3,5
        if (field.includes(",")) {
            return field.split(",").map(Number).includes(value);
        }

        // Exact value
        return parseInt(field) === value;
    }

    // Status info for the status command
    status(): Array<{ id: string; nextRun: string; lastRun: string | null; running: boolean }> {
        return [...this.jobs.values()].map((j) => ({
            id: j.id,
            cronExpression: j.cronExpression,
            nextRun: new Date(j.nextRun).toLocaleString(),
            lastRun: j.lastRun ? new Date(j.lastRun).toLocaleString() : null,
            running: j.running,
        }));
    }
}