import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ModelCatalogItem, ModelsCatalogResponse } from "@pi-studio/protocol";

export class ModelsService {
  private configDir: string;
  private settingsPath: string;
  private modelsStorePath: string;

  constructor(customConfigDir?: string) {
    this.configDir = customConfigDir || process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
    this.settingsPath = join(this.configDir, "settings.json");
    this.modelsStorePath = join(this.configDir, "models-store.json");
  }

  getModelsCatalog(): ModelsCatalogResponse {
    // 1. Load enabled models from settings.json
    let enabledModels: string[] = [];
    if (existsSync(this.settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(this.settingsPath, "utf8"));
        if (Array.isArray(settings.enabledModels)) {
          enabledModels = settings.enabledModels;
        }
      } catch (err) {
        console.error("Failed to read settings.json for enabledModels", err);
      }
    }

    // 2. Load available models from models-store.json
    const modelMap = new Map<string, ModelCatalogItem>();

    if (existsSync(this.modelsStorePath)) {
      try {
        const storeData = JSON.parse(readFileSync(this.modelsStorePath, "utf8"));
        if (typeof storeData === "object" && storeData !== null) {
          for (const [providerKey, providerObj] of Object.entries(storeData)) {
            const rawModels = (providerObj as any)?.models;
            if (Array.isArray(rawModels)) {
              for (const m of rawModels) {
                if (!m || !m.id) continue;
                const provider = m.provider || providerKey;
                const fullKey = `${provider}/${m.id}`;
                modelMap.set(fullKey, {
                  id: m.id,
                  name: m.name || m.id,
                  provider,
                  contextWindow: m.contextWindow,
                  maxTokens: m.maxTokens,
                  reasoning: Boolean(m.reasoning),
                  input: Array.isArray(m.input) ? m.input : ["text"],
                  cost: m.cost,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to read models-store.json", err);
      }
    }

    // 3. Fallback baseline if models-store is empty or missing
    if (modelMap.size === 0) {
      for (const m of FALLBACK_MODELS) {
        modelMap.set(`${m.provider}/${m.id}`, m);
      }
    }

    const models = Array.from(modelMap.values());

    // If enabledModels is empty, default to either the models in settings or all available models
    return {
      models,
      enabledModels,
    };
  }

  saveEnabledModels(enabledModels: string[]): { success: boolean } {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    let settings: Record<string, any> = {};
    if (existsSync(this.settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(this.settingsPath, "utf8"));
      } catch {
        settings = {};
      }
    }

    settings.enabledModels = enabledModels;

    const tmpPath = `${this.settingsPath}.tmp.${Date.now()}`;
    const bakPath = `${this.settingsPath}.bak`;

    try {
      writeFileSync(tmpPath, JSON.stringify(settings, null, 2), "utf8");
      if (existsSync(this.settingsPath)) {
        try {
          writeFileSync(bakPath, readFileSync(this.settingsPath));
        } catch {
          // ignore backup write failure
        }
      }
      renameSync(tmpPath, this.settingsPath);
      return { success: true };
    } catch (err) {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {}
      }
      console.error("Failed to save enabledModels to settings.json", err);
      throw err;
    }
  }
}

const FALLBACK_MODELS: ModelCatalogItem[] = [
  // Antigravity
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Antigravity)", provider: "antigravity", contextWindow: 1048576, reasoning: true, input: ["text", "image"] },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash (Antigravity)", provider: "antigravity", contextWindow: 1048576, reasoning: true, input: ["text", "image"] },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro (Antigravity)", provider: "antigravity", contextWindow: 1048576, reasoning: true, input: ["text", "image"] },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Antigravity)", provider: "antigravity", contextWindow: 200000, reasoning: true, input: ["text", "image"] },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6 (Antigravity)", provider: "antigravity", contextWindow: 250000, reasoning: true, input: ["text", "image"] },
  // Anthropic
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic", contextWindow: 1000000, reasoning: true, input: ["text", "image"] },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic", contextWindow: 1000000, reasoning: true, input: ["text", "image"] },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", contextWindow: 1000000, reasoning: true, input: ["text", "image"] },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", contextWindow: 200000, reasoning: true, input: ["text", "image"] },
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", contextWindow: 128000, reasoning: false, input: ["text", "image"] },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", contextWindow: 128000, reasoning: false, input: ["text", "image"] },
  { id: "o1", name: "o1", provider: "openai", contextWindow: 200000, reasoning: true, input: ["text", "image"] },
  { id: "o3-mini", name: "o3-mini", provider: "openai", contextWindow: 200000, reasoning: true, input: ["text"] },
];
