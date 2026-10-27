import React, { useState, useMemo } from "react";
import {
  Search,
  X,
  Check,
  Brain,
  Eye,
  CheckSquare,
  Square,
  Sparkles,
  GitCommit,
  BarChart3,
  Archive,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { useFeatureModelStore, resolveFeatureModel } from "../store/feature-models-store.ts";
import { AiModelChip } from "./AiModelChip.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { useContributions } from "../modules/registry.ts";
import { ProviderEnabledToggle } from "./ProviderEnabledToggle.tsx";
import { filterDisabledProviders } from "../lib/provider-filter.ts";
import { useUi } from "../store/ui-store.ts";
import { toast } from "../modules/toast-store.ts";
import { askChoice } from "./ChoiceDialog.tsx";

function formatContext(tokens?: number): string {
  if (!tokens) return "";
  if (tokens >= 1_000_000) return `${tokens / 1_000_000 >= 10 ? Math.round(tokens / 1_000_000) : (tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k ctx`;
  return `${tokens} ctx`;
}

export const ModelsSettingsContent: React.FC = () => {
  const aiFeatures = useContributions("aiFeatures");
  const hasGitCommit = aiFeatures.some((f) => f.id === "gitCommit");
  const hasUsageAnalysis = aiFeatures.some((f) => f.id === "usageAnalysis");
  const { allCatalogModels, models, enabledModelKeys, disabledProviders, saveEnabledModels, selectedModel, defaultModel, defaultProvider } =
    useSessionStore(
      useShallow((s) => ({
        allCatalogModels: s.allCatalogModels,
        models: s.models,
        enabledModelKeys: s.enabledModelKeys,
        disabledProviders: s.disabledProviders,
        saveEnabledModels: s.saveEnabledModels,
        selectedModel: s.selectedModel,
        defaultModel: s.defaultModel,
        defaultProvider: s.defaultProvider,
      })),
    );

  const { config, setGitCommitConfig, setUsageAnalysisConfig, setSessionTidyConfig } = useFeatureModelStore(
    useShallow((s) => ({
      config: s.config,
      setGitCommitConfig: s.setGitCommitConfig,
      setUsageAnalysisConfig: s.setUsageAnalysisConfig,
      setSessionTidyConfig: s.setSessionTidyConfig,
    })),
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");

  // Merge catalog models and session models deduplicated by provider/id
  const combinedModels = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of allCatalogModels) {
      map.set(`${m.provider}/${m.id}`, m);
    }
    for (const m of models) {
      const key = `${m.provider}/${m.id}`;
      if (!map.has(key)) {
        map.set(key, m);
      }
    }
    return Array.from(map.values());
  }, [allCatalogModels, models]);

  // Unique providers
  const providers = useMemo(() => {
    const set = new Set<string>();
    for (const m of combinedModels) {
      if (m.provider) set.add(m.provider);
    }
    return Array.from(set);
  }, [combinedModels]);

  // Check if a model is enabled
  const isModelEnabled = (m: { provider: string; id: string }): boolean => {
    const key1 = `${m.provider}/${m.id}`;
    if (enabledModelKeys.includes(key1)) return true;
    return enabledModelKeys.some((k) => !k.includes("/") && k === m.id);
  };

  /**
   * Persist the enabled list. An empty list means "no filter" to the composer (every model stays available),
   * so refuse to save it rather than show "0 active" while the picker lists everything.
   * The store setter swallows IO errors, so verify the write landed.
   */
  const save = async (nextKeys: string[]): Promise<void> => {
    if (nextKeys.length === 0) {
      await askChoice({
        title: "Keep at least one model enabled",
        body: [
          "With no models selected, Hive falls back to showing every model in the picker, so nothing would actually be turned off.",
          "Leave at least one model enabled, or turn off whole providers in AI Providers instead.",
        ],
        choices: [{ id: "ok", label: "OK", tone: "primary" }],
      });
      return;
    }
    try {
      await saveEnabledModels(nextKeys);
    } catch (err) {
      toast({ kind: "error", message: `Couldn't save model selection: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    const saved = useSessionStore.getState().enabledModelKeys;
    if (saved.length !== nextKeys.length || !nextKeys.every((k) => saved.includes(k))) {
      toast({ kind: "error", message: "Couldn't save model selection. Check that ~/.pi/agent/settings.json is writable." });
    }
  };

  // Toggle a single model
  const toggleModel = async (m: { provider: string; id: string }) => {
    const key = `${m.provider}/${m.id}`;
    const isCurrentlyEnabled = isModelEnabled(m);

    let nextKeys: string[];
    if (isCurrentlyEnabled) {
      nextKeys = enabledModelKeys.filter((k) => k !== key && (!k.includes("/") ? k !== m.id : false));
    } else {
      nextKeys = [...enabledModelKeys, key];
    }

    await save(nextKeys);
  };

  // Filtered models by search query and provider
  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedModels.filter((m) => {
      const matchesProvider = selectedProvider === "all" || m.provider === selectedProvider;
      if (!matchesProvider) return false;
      if (!q) return true;
      return (
        (m.name || "").toLowerCase().includes(q) ||
        (m.id || "").toLowerCase().includes(q) ||
        (m.provider || "").toLowerCase().includes(q)
      );
    });
  }, [combinedModels, searchQuery, selectedProvider]);

  // Group filtered models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof combinedModels> = {};
    for (const m of filteredModels) {
      const p = m.provider || "other";
      if (!groups[p]) groups[p] = [];
      groups[p]!.push(m);
    }
    return groups;
  }, [filteredModels]);

  // "Specific Model..." only offers models of providers that are switched on.
  const selectableModels = useMemo(
    () => filterDisabledProviders(combinedModels, disabledProviders),
    [combinedModels, disabledProviders],
  );
  const defaultCustomKey = selectableModels[0] ? `${selectableModels[0].provider}/${selectableModels[0].id}` : "";

  /** Options for a "Specific Model..." select. A model chosen earlier from a now-disabled provider stays visible, flagged. */
  const renderModelOptions = (currentKey: string | undefined) => {
    const current = currentKey ? combinedModels.find((m) => `${m.provider}/${m.id}` === currentKey) : undefined;
    const orphan = current && disabledProviders.includes(current.provider) ? current : undefined;
    return (
      <>
        {orphan && (
          <option key={`${orphan.provider}/${orphan.id}`} value={`${orphan.provider}/${orphan.id}`}>
            {orphan.name || orphan.id} ({orphan.provider}, provider disabled)
          </option>
        )}
        {selectableModels.map((m) => (
          <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
            {m.name || m.id} ({m.provider})
          </option>
        ))}
      </>
    );
  };

  const resolvedCommitModel = useMemo(
    () => resolveFeatureModel(config.gitCommit, selectedModel, defaultModel, combinedModels, defaultProvider),
    [config.gitCommit, selectedModel, defaultModel, combinedModels, defaultProvider],
  );

  const resolvedUsageModel = useMemo(
    () => resolveFeatureModel(config.usageAnalysis, selectedModel, defaultModel, combinedModels, defaultProvider),
    [config.usageAnalysis, selectedModel, defaultModel, combinedModels, defaultProvider],
  );

  const resolvedTidyModel = useMemo(
    () => resolveFeatureModel(config.sessionTidy, selectedModel, defaultModel, combinedModels, defaultProvider),
    [config.sessionTidy, selectedModel, defaultModel, combinedModels, defaultProvider],
  );

  // Count active models
  const totalModelsCount = selectableModels.length;
  const activeModelsCount = useMemo(() => {
    return selectableModels.filter((m) => isModelEnabled(m)).length;
  }, [selectableModels, enabledModelKeys]);

  // Enable all in current view
  const handleEnableAllInView = async () => {
    const keysToAdd = filterDisabledProviders(filteredModels, disabledProviders).map((m) => `${m.provider}/${m.id}`);
    const nextSet = new Set([...enabledModelKeys, ...keysToAdd]);
    await save(Array.from(nextSet));
  };

  // Disable all in current view
  const handleDisableAllInView = async () => {
    const keysToRemove = new Set(
      filteredModels.flatMap((m) => [`${m.provider}/${m.id}`, m.id]),
    );
    const nextKeys = enabledModelKeys.filter((k) => !keysToRemove.has(k));
    await save(nextKeys);
  };

  // Toggle all for a specific provider
  const handleToggleProvider = async (provider: string, enable: boolean) => {
    const providerModels = combinedModels.filter((m) => m.provider === provider);
    const providerKeys = providerModels.map((m) => `${m.provider}/${m.id}`);
    const providerIds = new Set(providerModels.flatMap((m) => [`${m.provider}/${m.id}`, m.id]));

    let nextKeys: string[];
    if (enable) {
      nextKeys = Array.from(new Set([...enabledModelKeys, ...providerKeys]));
    } else {
      nextKeys = enabledModelKeys.filter((k) => !providerIds.has(k));
    }
    await save(nextKeys);
  };

  const getProviderDisplayName = (p: string): string => {
    switch (p.toLowerCase()) {
      case "antigravity":
        return "Google Antigravity";
      case "anthropic":
        return "Anthropic (Claude)";
      case "openai":
        return "OpenAI";
      case "zai":
        return "ZAI Coding Plan";
      case "openrouter":
        return "OpenRouter";
      default:
        return p.charAt(0).toUpperCase() + p.slice(1);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Intro banner */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          Select which models appear in the Composer prompt dropdown. Changes sync automatically with your Pi CLI configuration (<code style={{ color: "var(--text-primary)" }}>~/.pi/agent/settings.json</code>).
        </div>
        <div
          style={{
            padding: "4px 10px",
            borderRadius: 12,
            background: activeModelsCount > 0 ? "color-mix(in srgb, var(--accent-base) 15%, transparent)" : "rgba(var(--fg-rgb), 0.05)",
            color: activeModelsCount > 0 ? "var(--accent-base)" : "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {activeModelsCount} of {totalModelsCount} active
        </div>
      </div>

      {/* Dedicated Auxiliary AI Models Card: git/analytics rows come from module `aiFeatures`; Archive old is core. */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Sparkles size={15} color="var(--accent-base)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Auxiliary AI Models
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Configure models used for background and auxiliary AI features
          </span>
        </div>

        {/* Feature 1: Git Commit Message (git module) */}
        {hasGitCommit && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            padding: "10px 12px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            gap: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <GitCommit size={14} color="var(--accent-base)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                AI Git Commit Message
              </span>
              <AiModelChip model={resolvedCommitModel} clickable={false} />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Used when clicking "AI Message" on staged files in the Git sidebar
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={config.gitCommit.source}
              onChange={(e) => {
                const nextSource = e.target.value as any;
                setGitCommitConfig({
                  source: nextSource,
                  modelId: nextSource === "custom" ? (config.gitCommit.modelId || defaultCustomKey) : config.gitCommit.modelId,
                });
              }}
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 5,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="session">Active Session Model (Dynamic)</option>
              <option value="pi-default">Pi CLI Default ({defaultModel || "Default"})</option>
              <option value="custom">Specific Model...</option>
            </select>

            {config.gitCommit.source === "custom" && (
              <select
                value={config.gitCommit.modelId || defaultCustomKey}
                onChange={(e) => setGitCommitConfig({ modelId: e.target.value })}
                style={{
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 5,
                  padding: "4px 8px",
                  fontSize: 11,
                  maxWidth: 200,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {renderModelOptions(config.gitCommit.modelId || defaultCustomKey)}
              </select>
            )}
          </div>
        </div>
        )}

        {/* Feature 2: AI Usage Insights (analytics module) */}
        {hasUsageAnalysis && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            padding: "10px 12px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            gap: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BarChart3 size={14} color="var(--accent-base)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                AI Usage Insights
              </span>
              <AiModelChip model={resolvedUsageModel} clickable={false} />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Used when clicking "Analyze with AI" in the Usage & Analytics view
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={config.usageAnalysis.source}
              onChange={(e) => {
                const nextSource = e.target.value as any;
                setUsageAnalysisConfig({
                  source: nextSource,
                  modelId: nextSource === "custom" ? (config.usageAnalysis.modelId || defaultCustomKey) : config.usageAnalysis.modelId,
                });
              }}
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 5,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="session">Active Session Model (Dynamic)</option>
              <option value="pi-default">Pi CLI Default ({defaultModel || "Default"})</option>
              <option value="custom">Specific Model...</option>
              <option value="heuristic">Fast Local Telemetry (Deterministic)</option>
            </select>

            {config.usageAnalysis.source === "custom" && (
              <select
                value={config.usageAnalysis.modelId || defaultCustomKey}
                onChange={(e) => setUsageAnalysisConfig({ modelId: e.target.value })}
                style={{
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 5,
                  padding: "4px 8px",
                  fontSize: 11,
                  maxWidth: 200,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {renderModelOptions(config.usageAnalysis.modelId || defaultCustomKey)}
              </select>
            )}
          </div>
        </div>
        )}

        {/* Archive old sessions (core sessions panel, always available) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            padding: "10px 12px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            gap: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Archive size={14} color="var(--accent-base)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                Archive Old Sessions
              </span>
              <AiModelChip model={resolvedTidyModel} clickable={false} />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Used when clicking "Archive old" in the Sessions panel (right-click it to change)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={config.sessionTidy.source}
              onChange={(e) => {
                const nextSource = e.target.value as any;
                setSessionTidyConfig({
                  source: nextSource,
                  modelId: nextSource === "custom" ? (config.sessionTidy.modelId || defaultCustomKey) : config.sessionTidy.modelId,
                });
              }}
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 5,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="session">Active Session Model (Dynamic)</option>
              <option value="pi-default">Pi CLI Default ({defaultModel || "Default"})</option>
              <option value="custom">Specific Model...</option>
            </select>

            {config.sessionTidy.source === "custom" && (
              <select
                value={config.sessionTidy.modelId || defaultCustomKey}
                onChange={(e) => setSessionTidyConfig({ modelId: e.target.value })}
                style={{
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 5,
                  padding: "4px 8px",
                  fontSize: 11,
                  maxWidth: 200,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {renderModelOptions(config.sessionTidy.modelId || defaultCustomKey)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Search and Provider Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Search box */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 6,
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models by name, ID, or provider..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "var(--text-primary)",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Bulk Action Buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleEnableAllInView}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontSize: 11,
                cursor: "pointer",
              }}
              title="Enable all models matching current search/filter"
            >
              <CheckSquare size={13} color="var(--accent-base)" />
              <span>Enable All</span>
            </button>
            <button
              onClick={handleDisableAllInView}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
              }}
              title="Disable all models matching current search/filter"
            >
              <Square size={13} />
              <span>Disable All</span>
            </button>
          </div>
        </div>

        {/* Provider Chips */}
        {providers.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => setSelectedProvider("all")}
              style={{
                padding: "3px 10px",
                borderRadius: 12,
                border: "none",
                background: selectedProvider === "all" ? "var(--accent-base)" : "var(--bg-card)",
                color: selectedProvider === "all" ? "#fff" : "var(--text-secondary)",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
              }}
            >
              All ({combinedModels.length})
            </button>
            {providers.map((p) => {
              const count = combinedModels.filter((m) => m.provider === p).length;
              const isSelected = selectedProvider === p;
              return (
                <button
                  key={p}
                  onClick={() => setSelectedProvider(p)}
                  title={disabledProviders.includes(p) ? `${getProviderDisplayName(p)} is disabled` : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 12,
                    border: "none",
                    opacity: disabledProviders.includes(p) ? 0.5 : 1,
                    textDecoration: disabledProviders.includes(p) ? "line-through" : "none",
                    background: isSelected ? "var(--accent-base)" : "var(--bg-card)",
                    color: isSelected ? "#fff" : "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                  }}
                >
                  <ProviderIcon provider={p} size={12} />
                  <span>{getProviderDisplayName(p)}</span>
                  <span style={{ opacity: 0.7, fontSize: 10 }}>({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Model List by Provider */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.keys(groupedModels).length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              background: "var(--bg-card)",
              borderRadius: 8,
              border: "1px dashed var(--border-subtle)",
              fontSize: 12,
            }}
          >
            {combinedModels.length === 0 ? (
              <>
                <div>No models available. Connect a provider in AI Providers.</div>
                <button className="ui-btn ui-btn--sm" style={{ marginTop: 10 }} onClick={() => useUi.getState().openSettings("accounts")}>
                  Open AI Providers
                </button>
              </>
            ) : (
              "No models found matching your search."
            )}
          </div>
        ) : (
          Object.entries(groupedModels).map(([provider, providerModels]) => {
            const providerActiveCount = providerModels.filter((m) => isModelEnabled(m)).length;
            const allProviderActive = providerActiveCount === providerModels.length;
            const providerOff = disabledProviders.includes(provider);

            return (
              <div
                key={provider}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {/* Provider Section Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "rgba(var(--fg-rgb), 0.02)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ProviderIcon provider={provider} size={16} />
                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>
                      {getProviderDisplayName(provider)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      ({providerActiveCount} of {providerModels.length} active)
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => handleToggleProvider(provider, !allProviderActive)}
                      disabled={providerOff}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-base)",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: providerOff ? "default" : "pointer",
                        opacity: providerOff ? 0.4 : 1,
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {allProviderActive ? "Deselect All" : "Select All"}
                    </button>
                    <ProviderEnabledToggle provider={provider} name={getProviderDisplayName(provider)} />
                  </div>
                </div>

                {/* Model Rows (dimmed and inert while the provider is disabled; selections are kept) */}
                <div style={{ display: "flex", flexDirection: "column", opacity: providerOff ? 0.4 : 1, pointerEvents: providerOff ? "none" : "auto" }}>
                  {providerModels.map((m) => {
                    const enabled = isModelEnabled(m);
                    const ctxStr = formatContext(m.contextWindow);

                    return (
                      <div
                        key={`${m.provider}/${m.id}`}
                        onClick={() => toggleModel(m)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "9px 14px",
                          borderBottom: "1px solid rgba(var(--fg-rgb), 0.03)",
                          cursor: "pointer",
                          background: enabled ? "color-mix(in srgb, var(--accent-base) 5%, transparent)" : "transparent",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = enabled
                            ? "color-mix(in srgb, var(--accent-base) 10%, transparent)"
                            : "rgba(var(--fg-rgb), 0.03)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = enabled
                            ? "color-mix(in srgb, var(--accent-base) 5%, transparent)"
                            : "transparent";
                        }}
                      >
                        {/* Left: Checkbox + Name + ID */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                          {/* Custom Checkbox */}
                          <div
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: enabled
                                ? "1.5px solid var(--accent-base)"
                                : "1.5px solid var(--border-prominent)",
                              background: enabled ? "var(--accent-base)" : "var(--bg-input)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                            }}
                          >
                            {enabled && <Check size={11} color="#fff" strokeWidth={3} />}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: enabled ? 600 : 500,
                                  color: enabled ? "var(--text-primary)" : "var(--text-secondary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {m.name || m.id}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-mono)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {m.id}
                            </span>
                          </div>
                        </div>

                        {/* Right: Capabilities Pills */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {ctxStr && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-subtle)",
                                fontSize: 10,
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-mono)",
                              }}
                              title={`Context Window: ${m.contextWindow?.toLocaleString()} tokens`}
                            >
                              {ctxStr}
                            </span>
                          )}

                          {m.reasoning && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(187, 128, 255, 0.12)",
                                border: "1px solid rgba(187, 128, 255, 0.3)",
                                fontSize: 10,
                                color: "#d2a8ff",
                              }}
                              title="Supports reasoning / thinking mode"
                            >
                              <Brain size={11} />
                              <span>Reasoning</span>
                            </span>
                          )}

                          {m.input?.includes("image") && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(87, 171, 90, 0.12)",
                                border: "1px solid rgba(87, 171, 90, 0.3)",
                                fontSize: 10,
                                color: "var(--success)",
                              }}
                              title="Supports image / multimodal input"
                            >
                              <Eye size={11} />
                              <span>Vision</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
