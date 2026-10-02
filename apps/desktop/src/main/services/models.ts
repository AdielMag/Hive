import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { CompactionSettings, ModelCatalogItem, ModelsCatalogResponse } from "@hive/protocol";

/** Pi's built-in defaults (docs/compaction.md). */
const PI_DEFAULT_RESERVE = 16384;
const PI_DEFAULT_KEEP_RECENT = 20000;
/** Window used for the ordinary (non-override) values, which apply to models with an unknown window. */
const REFERENCE_WINDOW = 200_000;
export const DEFAULT_COMPACTION: CompactionSettings = { enabled: true, triggerPercent: 90, keepRecentPercent: 10 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keep percentages sane: trigger 10–98%, recent history 1% up to 5 points below the trigger. */
export function normalizeCompaction(s: CompactionSettings): CompactionSettings {
  const triggerPercent = Math.round(clamp(Number(s.triggerPercent) || DEFAULT_COMPACTION.triggerPercent, 10, 98));
  const keepRecentPercent = Math.round(clamp(Number(s.keepRecentPercent) || DEFAULT_COMPACTION.keepRecentPercent, 1, triggerPercent - 5));
  return { enabled: Boolean(s.enabled), triggerPercent, keepRecentPercent };
}

/** Pi's absolute token values for one context window. */
export function compactionTokensFor(contextWindow: number, s: CompactionSettings): { reserveTokens: number; keepRecentTokens: number } {
  return {
    reserveTokens: Math.round((contextWindow * (100 - s.triggerPercent)) / 100),
    keepRecentTokens: Math.round((contextWindow * s.keepRecentPercent) / 100),
  };
}

export class ModelsService {
  private configDir: string;
  private settingsPath: string;
  private modelsStorePath: string;
  /** Studio's own record of the chosen percentages (Pi's settings.json only holds token counts). */
  private compactionPrefsPath: string;

  constructor(customConfigDir?: string, studioDataDir?: string) {
    this.configDir = customConfigDir || process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
    this.settingsPath = join(this.configDir, "settings.json");
    this.modelsStorePath = join(this.configDir, "models-store.json");
    this.compactionPrefsPath = join(studioDataDir ?? this.configDir, "pi-studio-compaction.json");
  }

  private readSettings(): Record<string, any> {
    if (!existsSync(this.settingsPath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.settingsPath, "utf8"));
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  /** For read-modify-write: refuse to proceed on a corrupt file rather than overwrite the user's config. */
  private readSettingsForWrite(): Record<string, any> {
    if (!existsSync(this.settingsPath)) return {};
    const parsed = JSON.parse(readFileSync(this.settingsPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${this.settingsPath} is not a JSON object`);
    return parsed;
  }

  private writeSettings(settings: Record<string, any>): void {
    if (!existsSync(this.configDir)) mkdirSync(this.configDir, { recursive: true });
    const tmpPath = `${this.settingsPath}.tmp.${Date.now()}`;
    try {
      writeFileSync(tmpPath, JSON.stringify(settings, null, 2), "utf8");
      renameSync(tmpPath, this.settingsPath);
    } catch (err) {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {}
      }
      throw err;
    }
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
                  thinkingLevelMap: m.thinkingLevelMap,
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

  private readCompactionPrefs(): CompactionSettings | null {
    if (!existsSync(this.compactionPrefsPath)) return null;
    try {
      return normalizeCompaction(JSON.parse(readFileSync(this.compactionPrefsPath, "utf8")));
    } catch {
      return null;
    }
  }

  /**
   * The chosen percentages. Before the user has ever saved them in Studio, derive them from what
   * settings.json currently does for the default model (including hand-written modelOverrides).
   */
  getCompactionSettings(): CompactionSettings {
    const saved = this.readCompactionPrefs();
    if (saved) return saved;
    const settings = this.readSettings();
    const c = typeof settings.compaction === "object" && settings.compaction !== null ? settings.compaction : {};
    const enabled = typeof c.enabled === "boolean" ? c.enabled : DEFAULT_COMPACTION.enabled;
    const key = settings.defaultProvider && settings.defaultModel ? `${settings.defaultProvider}/${settings.defaultModel}` : null;
    const window = key ? this.getModelsCatalog().models.find((m) => `${m.provider}/${m.id}` === key)?.contextWindow : undefined;
    if (!window) return { ...DEFAULT_COMPACTION, enabled };
    const override = (key && c.modelOverrides?.[key]) || {};
    const reserve = override.reserveTokens ?? c.reserveTokens ?? PI_DEFAULT_RESERVE;
    const keep = override.keepRecentTokens ?? c.keepRecentTokens ?? PI_DEFAULT_KEEP_RECENT;
    return normalizeCompaction({
      enabled,
      triggerPercent: 100 - (reserve / window) * 100,
      keepRecentPercent: (keep / window) * 100,
    });
  }

  /** Save the percentages and write the matching per-model token values into Pi's settings.json. */
  saveCompactionSettings(input: CompactionSettings): { success: boolean; modelsUpdated: number } {
    const prefs = normalizeCompaction(input);
    const dir = dirname(this.compactionPrefsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.compactionPrefsPath, JSON.stringify(prefs, null, 2), "utf8");
    return { success: true, modelsUpdated: this.applyCompaction(prefs) };
  }

  /**
   * Re-write per-model overrides from the saved percentages (no-op if the user never saved them).
   * Run at startup so models added to the catalog since the last save also get the right values.
   */
  reapplyCompaction(): number {
    const prefs = this.readCompactionPrefs();
    return prefs ? this.applyCompaction(prefs) : 0;
  }

  private applyCompaction(prefs: CompactionSettings): number {
    const settings = this.readSettingsForWrite();
    const prev = typeof settings.compaction === "object" && settings.compaction !== null ? settings.compaction : {};
    const overrides: Record<string, any> = typeof prev.modelOverrides === "object" && prev.modelOverrides !== null ? { ...prev.modelOverrides } : {};
    let modelsUpdated = 0;
    for (const m of this.getModelsCatalog().models) {
      if (!m.contextWindow || m.contextWindow <= 0) continue;
      const key = `${m.provider}/${m.id}`;
      const existing = typeof overrides[key] === "object" && overrides[key] !== null ? overrides[key] : {};
      overrides[key] = { ...existing, ...compactionTokensFor(m.contextWindow, prefs) };
      modelsUpdated++;
    }
    const next = {
      ...prev,
      enabled: prefs.enabled,
      // Fallback for models whose window Studio doesn't know.
      ...compactionTokensFor(REFERENCE_WINDOW, prefs),
      modelOverrides: overrides,
    };
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      settings.compaction = next;
      this.writeSettings(settings);
    }
    return modelsUpdated;
  }
}

const FALLBACK_MODELS: ModelCatalogItem[] = [
  // Antigravity
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash (Antigravity)",
    provider: "antigravity",
    contextWindow: 1048576,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null },
    input: ["text", "image"],
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash (Antigravity)",
    provider: "antigravity",
    contextWindow: 1048576,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null },
    input: ["text", "image"],
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro (Antigravity)",
    provider: "antigravity",
    contextWindow: 1048576,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: null },
    input: ["text", "image"],
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Antigravity)",
    provider: "antigravity",
    contextWindow: 200000,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null },
    input: ["text", "image"],
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 (Antigravity)",
    provider: "antigravity",
    contextWindow: 250000,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null },
    input: ["text", "image"],
  },
  // Anthropic
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    contextWindow: 1000000,
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh", max: "max" },
    input: ["text", "image"],
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    contextWindow: 1000000,
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    input: ["text", "image"],
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    contextWindow: 1000000,
    reasoning: true,
    thinkingLevelMap: { max: "max" },
    input: ["text", "image"],
  },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", contextWindow: 200000, reasoning: true, input: ["text", "image"] },
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", contextWindow: 128000, reasoning: false, input: ["text", "image"] },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", contextWindow: 128000, reasoning: false, input: ["text", "image"] },
  { id: "o1", name: "o1", provider: "openai", contextWindow: 200000, reasoning: true, input: ["text", "image"] },
  { id: "o3-mini", name: "o3-mini", provider: "openai", contextWindow: 200000, reasoning: true, input: ["text"] },
];
