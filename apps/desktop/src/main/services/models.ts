import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { CompactionSettings, ModelCatalogItem, ModelsCatalogResponse } from "@hive/protocol";
import { NEW_COMPACTION_FILE_NAME, migrateCompactionPrefs } from "../migrate-legacy.ts";

/** Pi's built-in defaults (docs/compaction.md). */
const PI_DEFAULT_RESERVE = 16384;
const PI_DEFAULT_KEEP_RECENT = 20000;
/** Window used for the ordinary (non-override) values, which apply to models with an unknown window. */
const REFERENCE_WINDOW = 200_000;
/** Raw recent history is the part of a compacted context that summarization can't shrink; cap it. */
export const DEFAULT_KEEP_RECENT_MAX = 20_000;
export const DEFAULT_COMPACTION: CompactionSettings = {
  enabled: true,
  triggerPercent: 90,
  keepRecentPercent: 10,
  keepRecentMaxTokens: DEFAULT_KEEP_RECENT_MAX,
};

const DISABLED_PROVIDERS_FILE_NAME = "hive-disabled-providers.json";
/** Hive's record of every model it has already seen, so genuinely new ones can be auto-enabled. */
const SEEN_MODELS_FILE_NAME = "hive-seen-models.json";

/**
 * Providers whose new models are NOT auto-enabled: aggregators add dozens of models a week and
 * would flood the picker. Their models stay available to tick by hand in Settings > Models.
 */
export const AUTO_ENABLE_EXCLUDED_PROVIDERS: ReadonlySet<string> = new Set(["openrouter"]);

interface SeenModelsLedger {
  autoEnable: boolean;
  seen: string[];
}

/** Whether a newly discovered model should be added to `enabledModels` automatically. */
export function isAutoEnableCandidate(key: string): boolean {
  const slash = key.indexOf("/");
  if (slash <= 0) return false;
  const provider = key.slice(0, slash);
  const id = key.slice(slash + 1);
  if (!id || AUTO_ENABLE_EXCLUDED_PROVIDERS.has(provider)) return false;
  // Catalogs sometimes advertise switched-off variants (e.g. Antigravity's `gemini-4-argon-disabled`).
  if (/(^|[-_])disabled$/i.test(id)) return false;
  return true;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keep percentages sane: trigger 10–98%, recent history 1% up to 5 points below the trigger. */
export function normalizeCompaction(s: CompactionSettings): CompactionSettings {
  const triggerPercent = Math.round(clamp(Number(s.triggerPercent) || DEFAULT_COMPACTION.triggerPercent, 10, 98));
  const keepRecentPercent = Math.round(clamp(Number(s.keepRecentPercent) || DEFAULT_COMPACTION.keepRecentPercent, 1, triggerPercent - 5));
  const rawCap = s.keepRecentMaxTokens;
  const keepRecentMaxTokens =
    rawCap === undefined || rawCap === null || !Number.isFinite(Number(rawCap))
      ? DEFAULT_KEEP_RECENT_MAX
      : Number(rawCap) <= 0
        ? 0
        : Math.max(1_000, Math.round(Number(rawCap)));
  return { enabled: Boolean(s.enabled), triggerPercent, keepRecentPercent, keepRecentMaxTokens };
}

/** Pi's absolute token values for one context window. */
export function compactionTokensFor(contextWindow: number, s: CompactionSettings): { reserveTokens: number; keepRecentTokens: number } {
  const keep = Math.round((contextWindow * s.keepRecentPercent) / 100);
  const cap = s.keepRecentMaxTokens && s.keepRecentMaxTokens > 0 ? s.keepRecentMaxTokens : Infinity;
  return {
    reserveTokens: Math.round((contextWindow * (100 - s.triggerPercent)) / 100),
    keepRecentTokens: Math.min(keep, cap),
  };
}

export class ModelsService {
  private configDir: string;
  private settingsPath: string;
  private modelsStorePath: string;
  /** Studio's own record of the chosen percentages (Pi's settings.json only holds token counts). */
  private compactionPrefsPath: string;
  /** Providers the user switched off (Hive-only: Pi's settings.json has no such concept). */
  private disabledProvidersPath: string;
  /** Hive-only ledger of models already seen + the auto-enable switch. */
  private seenModelsPath: string;

  constructor(customConfigDir?: string, studioDataDir?: string) {
    this.configDir = customConfigDir || process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
    this.settingsPath = join(this.configDir, "settings.json");
    this.modelsStorePath = join(this.configDir, "models-store.json");
    this.compactionPrefsPath = join(studioDataDir ?? this.configDir, NEW_COMPACTION_FILE_NAME);
    this.disabledProvidersPath = join(studioDataDir ?? this.configDir, DISABLED_PROVIDERS_FILE_NAME);
    this.seenModelsPath = join(studioDataDir ?? this.configDir, SEEN_MODELS_FILE_NAME);
    migrateCompactionPrefs(this.compactionPrefsPath);
  }

  getDisabledProviders(): string[] {
    if (!existsSync(this.disabledProvidersPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.disabledProvidersPath, "utf8"));
      return Array.isArray(parsed) ? [...new Set(parsed.filter((p): p is string => typeof p === "string" && p !== ""))] : [];
    } catch {
      return [];
    }
  }

  saveDisabledProviders(disabledProviders: string[]): { success: boolean } {
    const clean = [...new Set(disabledProviders.filter((p) => typeof p === "string" && p !== ""))];
    const dir = dirname(this.disabledProvidersPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.disabledProvidersPath, JSON.stringify(clean, null, 2), "utf8");
    return { success: true };
  }

  /** `null` when the ledger has never been written (first run). */
  private readSeenLedger(): SeenModelsLedger | null {
    if (!existsSync(this.seenModelsPath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.seenModelsPath, "utf8"));
      if (typeof parsed !== "object" || parsed === null) return null;
      return {
        autoEnable: typeof parsed.autoEnable === "boolean" ? parsed.autoEnable : true,
        seen: Array.isArray(parsed.seen) ? parsed.seen.filter((k: unknown): k is string => typeof k === "string") : [],
      };
    } catch {
      return null;
    }
  }

  private writeSeenLedger(ledger: SeenModelsLedger): void {
    const dir = dirname(this.seenModelsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.seenModelsPath}.tmp.${Date.now()}`;
    try {
      writeFileSync(tmpPath, JSON.stringify({ autoEnable: ledger.autoEnable, seen: [...new Set(ledger.seen)].sort() }, null, 2), "utf8");
      renameSync(tmpPath, this.seenModelsPath);
    } catch (err) {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {}
      }
      throw err;
    }
  }

  getAutoEnableNewModels(): boolean {
    return this.readSeenLedger()?.autoEnable ?? true;
  }

  saveAutoEnableNewModels(autoEnable: boolean): { success: boolean } {
    const ledger = this.readSeenLedger();
    // No ledger yet: seed it now so switching the feature on doesn't enable the whole backlog.
    let seen = ledger?.seen;
    if (!seen) {
      const catalog = this.readCatalog();
      seen = catalog.fromStore ? catalog.models.map((m) => `${m.provider}/${m.id}`) : [];
    }
    this.writeSeenLedger({ autoEnable: Boolean(autoEnable), seen });
    return { success: true };
  }

  /**
   * Record `keys` as seen and append the genuinely new, eligible ones to Pi's `enabledModels`.
   * The first time (no ledger yet) everything is only recorded, so an existing setup isn't flooded.
   * Models the user unticked stay off: they're already in the ledger, so they are never "new" again.
   * An empty `enabledModels` already means "show everything", so it is left empty.
   */
  private autoEnable(keys: string[], opts: { seedFromStore?: boolean } = {}): { enabledModels: string[]; added: string[] } {
    let settings: Record<string, any>;
    try {
      settings = this.readSettingsForWrite();
    } catch {
      // settings.json unreadable (maybe mid-write): touch nothing, or new models would be marked
      // seen without being enabled and never come back.
      const fallback = this.readSettings();
      return { enabledModels: Array.isArray(fallback.enabledModels) ? fallback.enabledModels : [], added: [] };
    }
    const enabledModels: string[] = Array.isArray(settings.enabledModels) ? settings.enabledModels : [];
    const ledger = this.readSeenLedger();
    const unique = [...new Set(keys.filter((k) => typeof k === "string" && k.includes("/")))];
    if (!ledger) {
      // First run: record only. Seed from the full store catalog too, so a partial list (e.g. one
      // live session's models) can't make the rest of the catalog look "new" next time.
      const seed = [...unique];
      if (opts.seedFromStore) {
        const catalog = this.readCatalog();
        if (catalog.fromStore) seed.push(...catalog.models.map((m) => `${m.provider}/${m.id}`));
      }
      this.writeSeenLedger({ autoEnable: true, seen: seed });
      return { enabledModels, added: [] };
    }
    const seen = new Set(ledger.seen);
    const fresh = unique.filter((k) => !seen.has(k));
    if (fresh.length === 0) return { enabledModels, added: [] };

    const enabledSet = new Set(enabledModels);
    // A provider Hive has never seen (just logged in, new extension) is only recorded: its whole
    // catalog is "new", and that's a backlog, not a release. Only later additions get auto-enabled.
    const knownProviders = new Set(ledger.seen.map((k) => k.slice(0, k.indexOf("/"))));
    const added =
      ledger.autoEnable && enabledModels.length > 0
        ? fresh.filter((k) => knownProviders.has(k.slice(0, k.indexOf("/"))) && isAutoEnableCandidate(k) && !enabledSet.has(k))
        : [];
    let nextEnabled = enabledModels;
    if (added.length > 0) {
      nextEnabled = [...enabledModels, ...added];
      try {
        this.saveEnabledModels(nextEnabled);
      } catch (err) {
        // Don't mark them seen if we couldn't enable them; retry next time.
        console.error("Failed to auto-enable new models", err);
        return { enabledModels, added: [] };
      }
    }
    this.writeSeenLedger({ autoEnable: ledger.autoEnable, seen: [...ledger.seen, ...fresh] });
    return { enabledModels: nextEnabled, added };
  }

  /** Models a live Pi session reported (it may know about models before models-store.json does). */
  syncDiscoveredModels(keys: string[]): { enabledModels: string[]; added: string[] } {
    try {
      return this.autoEnable(Array.isArray(keys) ? keys : [], { seedFromStore: true });
    } catch (err) {
      console.error("Failed to sync discovered models", err);
      const settings = this.readSettings();
      return { enabledModels: Array.isArray(settings.enabledModels) ? settings.enabledModels : [], added: [] };
    }
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
    const catalog = this.readCatalog();
    // Fallback models are a hard-coded guess, not a discovery: only track what Pi really reported.
    let enabledModels = catalog.enabledModels;
    if (catalog.fromStore) {
      try {
        enabledModels = this.autoEnable(catalog.models.map((m) => `${m.provider}/${m.id}`)).enabledModels;
      } catch (err) {
        // Bookkeeping must never break loading the catalog.
        console.error("Failed to auto-enable new models", err);
      }
    }
    return {
      models: catalog.models,
      enabledModels,
      disabledProviders: catalog.disabledProviders,
      defaultModel: catalog.defaultModel,
      defaultProvider: catalog.defaultProvider,
      autoEnableNewModels: this.getAutoEnableNewModels(),
    };
  }

  /** Side-effect-free catalog read. */
  private readCatalog(): ModelsCatalogResponse & { fromStore: boolean } {
    // 1. Load enabled models and defaults from settings.json
    let enabledModels: string[] = [];
    let defaultModel: string | undefined;
    let defaultProvider: string | undefined;
    if (existsSync(this.settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(this.settingsPath, "utf8"));
        if (Array.isArray(settings.enabledModels)) {
          enabledModels = settings.enabledModels;
        }
        if (typeof settings.defaultModel === "string") {
          defaultModel = settings.defaultModel;
        }
        if (typeof settings.defaultProvider === "string") {
          defaultProvider = settings.defaultProvider;
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
    const fromStore = modelMap.size > 0;
    if (!fromStore) {
      for (const m of FALLBACK_MODELS) {
        modelMap.set(`${m.provider}/${m.id}`, m);
      }
    }

    const models = Array.from(modelMap.values());

    // If enabledModels is empty, default to either the models in settings or all available models
    return {
      fromStore,
      models,
      enabledModels,
      disabledProviders: this.getDisabledProviders(),
      defaultModel,
      defaultProvider,
    };
  }

  saveEnabledModels(enabledModels: string[]): { success: boolean } {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    let settings: Record<string, any>;
    try {
      settings = this.readSettingsForWrite();
    } catch (err) {
      throw new Error(`Refusing to overwrite unreadable Pi settings: ${err instanceof Error ? err.message : String(err)}`);
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
    const window = key ? this.readCatalog().models.find((m) => `${m.provider}/${m.id}` === key)?.contextWindow : undefined;
    if (!window) return { ...DEFAULT_COMPACTION, enabled };
    const override = (key && c.modelOverrides?.[key]) || {};
    const reserve = override.reserveTokens ?? c.reserveTokens ?? PI_DEFAULT_RESERVE;
    const keep = override.keepRecentTokens ?? c.keepRecentTokens ?? PI_DEFAULT_KEEP_RECENT;
    return normalizeCompaction({
      enabled,
      triggerPercent: 100 - (reserve / window) * 100,
      keepRecentPercent: (keep / window) * 100,
      keepRecentMaxTokens: 0, // faithful to the existing hand-written values
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
    for (const m of this.readCatalog().models) {
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
