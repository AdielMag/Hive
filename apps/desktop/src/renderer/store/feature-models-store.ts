import { create } from "zustand";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";

export type FeatureModelSource = "session" | "pi-default" | "custom" | "heuristic";

export interface FeatureModelPreference {
  source: FeatureModelSource;
  modelId?: string;
}

export interface FeatureModelsConfig {
  gitCommit: FeatureModelPreference;
  usageAnalysis: FeatureModelPreference;
}

export interface ResolvedFeatureModel {
  id: string;
  name: string;
  shortName: string;
  provider?: string;
  source: FeatureModelSource;
  sourceLabel: string;
  isHeuristic?: boolean;
}

export interface CatalogModelLike {
  id: string;
  name?: string;
  provider?: string;
}

const STORAGE_KEY = "hive.feature-models.v1";

export const DEFAULT_FEATURE_MODELS: FeatureModelsConfig = {
  gitCommit: { source: "session" },
  usageAnalysis: { source: "session" },
};

/**
 * Pulls a model version ("4.5", "3", "2.5") out of a model id/name, ignoring provider prefixes,
 * trailing date stamps (20241022) and parameter sizes (70b). Handles "4-5" and "4.5" spellings.
 */
export function extractModelVersion(id?: string, name?: string): string | undefined {
  for (const source of [id, name]) {
    if (!source) continue;
    let s = source.toLowerCase();
    if (s.includes("/")) s = s.split("/").slice(1).join("/");
    s = s.replace(/[-_]?\d{8}\b/g, "").replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
    const m = /(?<![a-z\d.])v?(\d{1,2})(?:[.\-_ ](\d{1,2}))?(?![\d]|[a-z])/.exec(s);
    if (m) return m[2] ? `${m[1]}.${m[2]}` : m[1];
  }
  return undefined;
}

/**
 * Derives a compact, recognizable short name for a model including its version number
 * (e.g. "haiku 3.5", "sonnet 4.5", "flash 2.5", "opus 4"). Names that already embed their
 * number (gpt-4o, o1, deepseek-r1) are returned as-is.
 */
export function getShortModelName(id?: string, name?: string): string {
  if (!id && !name) return "auto";
  const raw = `${id || ""} ${name || ""}`.toLowerCase();

  // Families whose short name already carries its number.
  if (/\b(gpt-4o-mini)\b/i.test(raw)) return "gpt-4o-mini";
  if (/\b(gpt-4o)\b/i.test(raw)) return "gpt-4o";
  if (/\b(o3-mini)\b/i.test(raw)) return "o3-mini";
  if (/\b(o1-mini)\b/i.test(raw)) return "o1-mini";
  if (/\b(o1)\b/i.test(raw)) return "o1";
  if (/\b(deepseek-r1|deepseek-reasoner)\b/i.test(raw)) return "deepseek-r1";

  const withVersion = (family: string): string => {
    const v = extractModelVersion(id, name);
    return v ? `${family} ${v}` : family;
  };

  if (/\b(flash-lite)\b/i.test(raw)) return withVersion("flash-lite");
  if (/\b(flash)\b/i.test(raw)) return withVersion("flash");
  if (/\b(haiku)\b/i.test(raw)) return withVersion("haiku");
  if (/\b(sonnet)\b/i.test(raw)) return withVersion("sonnet");
  if (/\b(opus)\b/i.test(raw)) return withVersion("opus");
  if (/\b(deepseek)\b/i.test(raw)) return withVersion("deepseek");
  if (/\b(qwen|coder)\b/i.test(raw)) return withVersion("coder");
  if (/\b(llama)\b/i.test(raw)) return withVersion("llama");
  if (/\b(mistral)\b/i.test(raw)) return withVersion("mistral");
  if (/\b(pro)\b/i.test(raw)) return withVersion("pro");

  // Fallback: strip provider and trailing version dates
  let cleaned = (id || name || "").trim();
  if (cleaned.includes("/")) {
    cleaned = cleaned.split("/").slice(1).join("/");
  }
  cleaned = cleaned.replace(/[-_]\d{8}$/, "").replace(/[-_](latest|preview)$/, "");
  return (cleaned.length > 9 ? cleaned.slice(0, 8) : cleaned).toLowerCase();
}

/**
 * Resolves a feature's configured model preference against available session and catalog models.
 */
export function resolveFeatureModel(
  pref: FeatureModelPreference | undefined,
  activeSessionModel: CatalogModelLike | null | undefined,
  piDefaultModel: string | undefined,
  catalog: CatalogModelLike[] = [],
  defaultProvider?: string,
): ResolvedFeatureModel {
  const source = pref?.source || "session";

  // Heuristic mode (for usage analysis)
  if (source === "heuristic") {
    return {
      id: "",
      name: "Fast Local Telemetry",
      shortName: "local",
      source: "heuristic",
      sourceLabel: "Fast local rules (no LLM)",
      isHeuristic: true,
    };
  }

  // Custom model configured in settings
  if (source === "custom") {
    const target = pref?.modelId?.trim() || (catalog[0] ? `${catalog[0].provider}/${catalog[0].id}` : "");
    if (!target) {
      return {
        id: "",
        name: "Unconfigured Model",
        shortName: "custom",
        source: "custom",
        sourceLabel: "Custom model unconfigured",
      };
    }
    const found = catalog.find(
      (m) => m.id === target || `${m.provider}/${m.id}` === target,
    );
    const displayName = found?.name || target;
    return {
      id: target,
      name: displayName,
      shortName: getShortModelName(target, displayName),
      provider: found?.provider,
      source: "custom",
      sourceLabel: "Configured in Settings",
    };
  }

  // Formulate full default ID if provider available
  const defaultTarget =
    piDefaultModel && defaultProvider && !piDefaultModel.includes("/")
      ? `${defaultProvider}/${piDefaultModel}`
      : piDefaultModel;

  // Explicit Pi CLI Default preference
  if (source === "pi-default") {
    if (defaultTarget) {
      const found = catalog.find(
        (m) => m.id === defaultTarget || `${m.provider}/${m.id}` === defaultTarget || m.id === piDefaultModel,
      );
      const displayName = found?.name || defaultTarget;
      return {
        id: defaultTarget,
        name: displayName,
        shortName: getShortModelName(defaultTarget, displayName),
        provider: found?.provider || defaultProvider,
        source: "pi-default",
        sourceLabel: "Pi CLI default",
      };
    }
    return {
      id: "",
      name: "Pi CLI Default",
      shortName: "default",
      source: "pi-default",
      sourceLabel: "Pi CLI default",
    };
  }

  // Session mode (default dynamic behavior)
  if (activeSessionModel) {
    const fullSessionId =
      activeSessionModel.provider && !activeSessionModel.id.includes("/")
        ? `${activeSessionModel.provider}/${activeSessionModel.id}`
        : activeSessionModel.id;

    return {
      id: fullSessionId,
      name: activeSessionModel.name || activeSessionModel.id,
      shortName: getShortModelName(activeSessionModel.id, activeSessionModel.name),
      provider: activeSessionModel.provider,
      source: "session",
      sourceLabel: "Active session",
    };
  }

  // Fallback if no session is active
  if (defaultTarget) {
    const found = catalog.find(
      (m) => m.id === defaultTarget || `${m.provider}/${m.id}` === defaultTarget || m.id === piDefaultModel,
    );
    const displayName = found?.name || defaultTarget;
    return {
      id: defaultTarget,
      name: displayName,
      shortName: getShortModelName(defaultTarget, displayName),
      provider: found?.provider || defaultProvider,
      source: "session",
      sourceLabel: "Pi CLI default (no active session)",
    };
  }

  return {
    id: "",
    name: "Default Model",
    shortName: "auto",
    source: "session",
    sourceLabel: "Default model",
  };
}

function loadConfig(): FeatureModelsConfig {
  try {
    const raw = getStoredItem(STORAGE_KEY, "pi-studio.feature-models.v1");
    if (!raw) return DEFAULT_FEATURE_MODELS;
    const parsed = JSON.parse(raw);

    const validCommitSources = ["session", "pi-default", "custom"] as const;
    let gitCommitSource = validCommitSources.includes(parsed?.gitCommit?.source)
      ? parsed.gitCommit.source
      : "session";
    let gitCommitModelId = typeof parsed?.gitCommit?.modelId === "string" ? parsed.gitCommit.modelId : undefined;
    if (gitCommitSource === "custom" && !gitCommitModelId) {
      gitCommitSource = "session";
    }

    const validUsageSources = ["session", "pi-default", "custom", "heuristic"] as const;
    let usageSource = validUsageSources.includes(parsed?.usageAnalysis?.source)
      ? parsed.usageAnalysis.source
      : "session";
    let usageModelId = typeof parsed?.usageAnalysis?.modelId === "string" ? parsed.usageAnalysis.modelId : undefined;
    if (usageSource === "custom" && !usageModelId) {
      usageSource = "session";
    }

    return {
      gitCommit: {
        source: gitCommitSource,
        modelId: gitCommitModelId,
      },
      usageAnalysis: {
        source: usageSource,
        modelId: usageModelId,
      },
    };
  } catch {
    return DEFAULT_FEATURE_MODELS;
  }
}

interface FeatureModelsState {
  config: FeatureModelsConfig;
  setGitCommitConfig(pref: Partial<FeatureModelPreference>): void;
  setUsageAnalysisConfig(pref: Partial<FeatureModelPreference>): void;
  reset(): void;
}

export const useFeatureModelStore = create<FeatureModelsState>((set) => ({
  config: loadConfig(),
  setGitCommitConfig: (pref) =>
    set((state) => {
      const next: FeatureModelsConfig = {
        ...state.config,
        gitCommit: { ...state.config.gitCommit, ...pref },
      };
      setStoredItem(STORAGE_KEY, JSON.stringify(next));
      return { config: next };
    }),
  setUsageAnalysisConfig: (pref) =>
    set((state) => {
      const next: FeatureModelsConfig = {
        ...state.config,
        usageAnalysis: { ...state.config.usageAnalysis, ...pref },
      };
      setStoredItem(STORAGE_KEY, JSON.stringify(next));
      return { config: next };
    }),
  reset: () => {
    setStoredItem(STORAGE_KEY, JSON.stringify(DEFAULT_FEATURE_MODELS));
    set({ config: DEFAULT_FEATURE_MODELS });
  },
}));
