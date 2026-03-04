import { OllamaProvider } from "./ollama.js";
import type { Provider } from "./types.js";
import type { AppConfig } from "../config/schema.js";

export class ProviderRegistry {
    private providers: Map<string, Provider> = new Map();

    constructor(config: AppConfig) {
        this.load(config);
    }

    private load(config: AppConfig) {
        for (const [name, providerConfig] of Object.entries(config.providers)) {
            let provider: Provider;

            switch (providerConfig.type) {
                case "ollama":
                    provider = new OllamaProvider(
                        providerConfig.apiBase,
                        providerConfig.defaultModel
                    );
                    break;
                default:
                    console.error(`  ❌ Unknown provider type: ${providerConfig.type} for provider: ${name}`);
                    continue;
            }

            this.providers.set(name, provider);
            console.log(`  ✅ Provider loaded: ${name} (${providerConfig.type} / ${providerConfig.defaultModel})`);
        }
    }

    get(name: string): Provider {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(
                `Provider "${name}" not found. Available: ${[...this.providers.keys()].join(", ")}`
            );
        }
        return provider;
    }

    has(name: string): boolean {
        return this.providers.has(name);
    }

    list(): string[] {
        return [...this.providers.keys()];
    }
}