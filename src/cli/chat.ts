import * as readline from "readline";
import { type AppConfig } from "../config/schema.js";

export async function startChat(config: AppConfig) {
    console.log("💬 Chat mode — type your message, Ctrl+C to exit\n");
    console.log("(TODO:Agent loop — this is the CLI shell)\n");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = () => {
        rl.question("You: ", async (input) => {
            const trimmed = input.trim();
            if (!trimmed) {
                prompt();
                return;
            }

            console.log(`Agent: [Agent loop not yet implemented]`);
            console.log(`       (You said: "${trimmed}")\n`);

            prompt();
        });
    };

    prompt();

    rl.on("close", () => {
        console.log("\nBye 👋");
        process.exit(0);
    });
}