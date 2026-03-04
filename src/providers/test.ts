import { loadConfig } from "../config/loader.js";
import { ProviderRegistry } from "./registry.js";

const config = loadConfig();
const registry = new ProviderRegistry(config);

// Test whichever provider you have a key for
const provider = registry.get("local"); // or "openai" or "local"

console.log("Sending test message...");
const response = await provider.chat(
    [{ role: "user", content: "Works" }],
    {
        temperature: 0,
        onChunk: (chunk) => process.stdout.write(chunk),
    }
);

console.log("\n\nTokens:", response.inputTokens, "in /", response.outputTokens, "out");
console.log("Stop reason:", response.stopReason);