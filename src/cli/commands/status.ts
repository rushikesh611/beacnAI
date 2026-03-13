import type { AppConfig } from "../../config/schema.js";
import type { Memory } from "../../memory/memory.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { SkillLoader } from "../../skills/loader.js";
import type { ProviderRegistry } from "../../providers/registry.js";
import type { CronScheduler } from "../../cron/scheduler.js";

export function statusCommand(
    config: AppConfig,
    memory: Memory,
    tools: ToolRegistry,
    skills: SkillLoader,
    providers: ProviderRegistry,
    scheduler?: CronScheduler
) {
    const line = "─".repeat(48);

    console.log(`\n${line}`);
    console.log(`  🗼 BeacnAI — Status`);
    console.log(line);

    console.log(`\n  Gateway`);
    console.log(`    Host:      ${config.gateway.host}:${config.gateway.port}`);
    console.log(`    Auth:      ${config.gateway.token ? "token set" : "none (local only)"}`);

    console.log(`\n  Providers`);
    for (const [name, cfg] of Object.entries(config.providers)) {
        const model = "defaultModel" in cfg ? cfg.defaultModel : "unknown";
        console.log(`    ${name}: ${cfg.type} / ${model}`);
    }

    console.log(`\n  Agents`);
    for (const [name, agent] of Object.entries(config.agents)) {
        console.log(`    ${name}`);
        console.log(`      Provider:   ${agent.provider}`);
        console.log(`      Model:      ${agent.model ?? "provider default"}`);
        console.log(`      Temp:       ${agent.temperature}`);
        console.log(`      Max depth:  ${agent.maxToolCallDepth}`);
    }

    console.log(`\n  Channels`);
    const channelEntries = Object.entries(config.channels);
    if (channelEntries.length === 0) {
        console.log(`    none configured`);
    } else {
        for (const [name, ch] of channelEntries) {
            console.log(`    ${name}: ${ch.type}`);
        }
    }

    console.log(`\n  Tools (${tools.list().length})`);
    console.log(`    ${tools.list().join(", ")}`);

    console.log(`\n  Skills (${skills.list().length})`);
    if (skills.list().length === 0) {
        console.log(`    none loaded`);
    } else {
        for (const s of skills.list()) {
            console.log(`    ${s.meta.name}: ${s.meta.description}`);
        }
    }

    console.log(`\n  Memory`);
    const entries = memory.list();
    console.log(`    ${entries.length} entries stored`);
    if (entries.length > 0) {
        for (const e of entries.slice(0, 3)) {
            console.log(`    • ${e.key}: ${e.content.slice(0, 60)}${e.content.length > 60 ? "..." : ""}`);
        }
        if (entries.length > 3) console.log(`    ... and ${entries.length - 3} more`);
    }

    if (scheduler) {
        console.log(`\n  Cron Jobs`);
        const jobs = scheduler.status();
        if (jobs.length === 0) {
            console.log(`    none configured`);
        } else {
            for (const j of jobs) {
                console.log(`    ${j.id}`);
                console.log(`      Next run:  ${j.nextRun}`);
                console.log(`      Last run:  ${j.lastRun ?? "never"}`);
                console.log(`      Running:   ${j.running}`);
            }
        }
    }

    console.log(`\n${line}\n`);
}