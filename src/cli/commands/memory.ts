import type { Memory } from "../../memory/memory.js";

export function memoryCommand(args: string[], memory: Memory) {
    const sub = args[0];

    switch (sub) {
        case "list":
        case undefined: {
            const entries = memory.list();
            if (entries.length === 0) {
                console.log("No memories saved.");
                return;
            }
            console.log(`\n${entries.length} memories:\n`);
            for (const e of entries) {
                const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
                const date = new Date(e.updatedAt).toLocaleDateString();
                console.log(`  ${e.key}${tags}`);
                console.log(`    ${e.content}`);
                console.log(`    Updated: ${date}\n`);
            }
            break;
        }

        case "get": {
            const key = args[1];
            if (!key) {
                console.error("Usage: memory get <key>");
                process.exit(1);
            }
            const entry = memory.get(key);
            if (!entry) {
                console.log(`No memory found for: "${key}"`);
                return;
            }
            console.log(`\nKey:     ${entry.key}`);
            console.log(`Content: ${entry.content}`);
            if (entry.tags.length) console.log(`Tags:    ${entry.tags.join(", ")}`);
            console.log(`Created: ${new Date(entry.createdAt).toLocaleString()}`);
            console.log(`Updated: ${new Date(entry.updatedAt).toLocaleString()}\n`);
            break;
        }

        case "set": {
            const key = args[1];
            const content = args.slice(2).join(" ");
            if (!key || !content) {
                console.error("Usage: memory set <key> <content>");
                process.exit(1);
            }
            memory.save(key, content);
            console.log(`✅ Saved: "${key}"`);
            break;
        }

        case "delete":
        case "del":
        case "rm": {
            const key = args[1];
            if (!key) {
                console.error("Usage: memory delete <key>");
                process.exit(1);
            }
            const deleted = memory.delete(key);
            console.log(deleted ? `✅ Deleted: "${key}"` : `Not found: "${key}"`);
            break;
        }

        case "search": {
            const query = args.slice(1).join(" ");
            if (!query) {
                console.error("Usage: memory search <query>");
                process.exit(1);
            }
            const results = memory.search(query);
            if (results.length === 0) {
                console.log(`No results for: "${query}"`);
                return;
            }
            console.log(`\n${results.length} result(s) for "${query}":\n`);
            for (const e of results) {
                console.log(`  ${e.key}: ${e.content}`);
            }
            console.log();
            break;
        }

        default:
            console.error(`Unknown memory subcommand: "${sub}"`);
            console.log(`Usage: memory <list|get|set|delete|search>`);
            process.exit(1);
    }
}