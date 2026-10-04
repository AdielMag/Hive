import { describe, expect, it, beforeEach } from "vitest";
import {
  getShortModelName,
  resolveFeatureModel,
  useFeatureModelStore,
  DEFAULT_FEATURE_MODELS,
  type CatalogModelLike,
} from "./feature-models-store.ts";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("feature-models-store", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = createStorageMock();
    useFeatureModelStore.getState().reset();
  });

  describe("getShortModelName", () => {
    it("shortens Claude model family correctly", () => {
      expect(getShortModelName("anthropic/claude-3-5-haiku-20241022", "Claude 3.5 Haiku")).toBe("haiku 3.5");
      expect(getShortModelName("anthropic/claude-3-7-sonnet", "Claude 3.7 Sonnet")).toBe("sonnet 3.7");
      expect(getShortModelName("claude-opus-5-5", "Claude 5.5 Opus")).toBe("opus 5.5");
    });

    it("shortens Gemini models correctly", () => {
      expect(getShortModelName("antigravity/gemini-3.8-flash", "Gemini 3.8 Flash")).toBe("flash 3.8");
      expect(getShortModelName("antigravity/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite")).toBe("flash-lite 3.5");
      expect(getShortModelName("antigravity/gemini-3.1-pro", "Gemini 3.1 Pro")).toBe("pro 3.1");
    });

    it("shortens OpenAI models correctly", () => {
      expect(getShortModelName("openai/gpt-4o", "GPT-4o")).toBe("gpt-4o");
      expect(getShortModelName("openai/gpt-4o-mini", "GPT-4o mini")).toBe("gpt-4o-mini");
      expect(getShortModelName("openai/o1", "o1")).toBe("o1");
      expect(getShortModelName("openai/o3-mini", "o3-mini")).toBe("o3-mini");
    });

    it("does not match false substrings like 'proxy' or 'provider' as 'pro'", () => {
      expect(getShortModelName("custom/proxy-endpoint")).toBe("proxy-en");
      expect(getShortModelName("provider/generic-model")).toBe("generic-");
    });

    it("shortens other model providers and handles edge cases", () => {
      expect(getShortModelName("deepseek/deepseek-chat", "DeepSeek Chat")).toBe("deepseek");
      expect(getShortModelName("deepseek-reasoner", "DeepSeek R1")).toBe("deepseek-r1");
      expect(getShortModelName("qwen/qwen-2.5-coder-32b", "Qwen 2.5 Coder")).toBe("coder 2.5");
      expect(getShortModelName("meta/llama-3.3-70b-instruct", "Llama 3.3 70B")).toBe("llama 3.3");
      expect(getShortModelName(undefined, undefined)).toBe("auto");
      expect(getShortModelName("custom/my-model-20241022")).toBe("my-model");
    });
  });

  describe("getShortModelName versions", () => {
    it("handles dashed, dotted, dated and bare versions", () => {
      expect(getShortModelName("claude-sonnet-4-5-20250929")).toBe("sonnet 4.5");
      expect(getShortModelName("claude-opus-4-1")).toBe("opus 4.1");
      expect(getShortModelName("claude-sonnet-4-20250514")).toBe("sonnet 4");
      expect(getShortModelName("claude-3-opus-20240229")).toBe("opus 3");
      expect(getShortModelName("google/gemini-2.5-flash")).toBe("flash 2.5");
      expect(getShortModelName("meta/llama-3-70b-instruct")).toBe("llama 3");
      expect(getShortModelName("gemini-pro", "Gemini Pro")).toBe("pro");
    });
  });

  describe("resolveFeatureModel", () => {
    const mockCatalog: CatalogModelLike[] = [
      { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "antigravity" },
      { id: "claude-opus-5-5", name: "Claude 5.5 Opus", provider: "anthropic" },
    ];

    it("resolves to active session model when source is session", () => {
      const activeSession = { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic" };
      const res = resolveFeatureModel({ source: "session" }, activeSession, "claude-opus-5-5", mockCatalog);
      expect(res.id).toBe("anthropic/claude-3-5-haiku");
      expect(res.shortName).toBe("haiku 3.5");
      expect(res.sourceLabel).toBe("Active session");
    });

    it("falls back to pi default model with provider when session model is null", () => {
      const res = resolveFeatureModel({ source: "session" }, null, "gemini-3.8-flash", mockCatalog, "antigravity");
      expect(res.id).toBe("antigravity/gemini-3.8-flash");
      expect(res.shortName).toBe("flash 3.8");
      expect(res.sourceLabel).toContain("Pi CLI default");
    });

    it("resolves explicit pi-default preference with defaultProvider", () => {
      const activeSession = { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic" };
      const res = resolveFeatureModel({ source: "pi-default" }, activeSession, "claude-opus-5-5", mockCatalog, "anthropic");
      expect(res.id).toBe("anthropic/claude-opus-5-5");
      expect(res.shortName).toBe("opus 5.5");
      expect(res.sourceLabel).toBe("Pi CLI default");
    });

    it("resolves custom model preference", () => {
      const res = resolveFeatureModel(
        { source: "custom", modelId: "gemini-3.8-flash" },
        null,
        "claude-opus-5-5",
        mockCatalog,
      );
      expect(res.id).toBe("gemini-3.8-flash");
      expect(res.shortName).toBe("flash 3.8");
      expect(res.sourceLabel).toBe("Configured in Settings");
    });

    it("seeds first catalog model when custom modelId is missing", () => {
      const res = resolveFeatureModel(
        { source: "custom" },
        null,
        "claude-opus-5-5",
        mockCatalog,
      );
      expect(res.id).toBe("anthropic/claude-3-5-haiku");
      expect(res.shortName).toBe("haiku 3.5");
      expect(res.sourceLabel).toBe("Configured in Settings");
    });

    it("resolves heuristic mode for telemetry", () => {
      const res = resolveFeatureModel({ source: "heuristic" }, null, "claude-opus-5-5", mockCatalog);
      expect(res.id).toBe("");
      expect(res.shortName).toBe("local");
      expect(res.isHeuristic).toBe(true);
      expect(res.sourceLabel).toContain("Fast local");
    });
  });

  describe("store actions and persistence", () => {
    it("initializes with default preferences", () => {
      const config = useFeatureModelStore.getState().config;
      expect(config.gitCommit.source).toBe("session");
      expect(config.usageAnalysis.source).toBe("session");
    });

    it("updates git commit configuration and persists to localStorage", () => {
      useFeatureModelStore.getState().setGitCommitConfig({
        source: "custom",
        modelId: "anthropic/claude-3-5-haiku",
      });

      const updated = useFeatureModelStore.getState().config;
      expect(updated.gitCommit.source).toBe("custom");
      expect(updated.gitCommit.modelId).toBe("anthropic/claude-3-5-haiku");

      const savedRaw = localStorage.getItem("hive.feature-models.v1");
      expect(savedRaw).toBeTruthy();
      const parsed = JSON.parse(savedRaw!);
      expect(parsed.gitCommit.source).toBe("custom");
    });

    it("updates usage analysis configuration and persists to localStorage", () => {
      useFeatureModelStore.getState().setUsageAnalysisConfig({
        source: "heuristic",
      });

      const updated = useFeatureModelStore.getState().config;
      expect(updated.usageAnalysis.source).toBe("heuristic");
    });

    it("resets preferences back to defaults", () => {
      useFeatureModelStore.getState().setGitCommitConfig({ source: "custom", modelId: "custom-id" });
      useFeatureModelStore.getState().reset();

      const config = useFeatureModelStore.getState().config;
      expect(config).toEqual(DEFAULT_FEATURE_MODELS);
    });
  });
});
