import React, { useState, useMemo } from "react";
import {
  Search,
  X,
  Check,
  Brain,
  Eye,
  SlidersHorizontal,
  CheckSquare,
  Square,
  RotateCcw,
} from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";

function formatContext(tokens?: number): string {
  if (!tokens) return "";
  if (tokens >= 1_000_000) return `${tokens / 1_000_000 >= 10 ? Math.round(tokens / 1_000_000) : (tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k ctx`;
  return `${tokens} ctx`;
}

export const ModelsSettingsContent: React.FC = () => {
  const { allCatalogModels, models, enabledModelKeys, saveEnabledModels } = useSessionStore();

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
    const key2 = m.id;
    return enabledModelKeys.includes(key1) || enabledModelKeys.includes(key2);
  };

  // Toggle a single model
  const toggleModel = async (m: { provider: string; id: string }) => {
    const key = `${m.provider}/${m.id}`;
    const isCurrentlyEnabled = isModelEnabled(m);

    let nextKeys: string[];
    if (isCurrentlyEnabled) {
      nextKeys = enabledModelKeys.filter((k) => k !== key && k !== m.id);
    } else {
      nextKeys = [...enabledModelKeys, key];
    }

    await saveEnabledModels(nextKeys);
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

  // Count active models
  const totalModelsCount = combinedModels.length;
  const activeModelsCount = useMemo(() => {
    return combinedModels.filter((m) => isModelEnabled(m)).length;
  }, [combinedModels, enabledModelKeys]);

  // Enable all in current view
  const handleEnableAllInView = async () => {
    const keysToAdd = filteredModels.map((m) => `${m.provider}/${m.id}`);
    const nextSet = new Set([...enabledModelKeys, ...keysToAdd]);
    await saveEnabledModels(Array.from(nextSet));
  };

  // Disable all in current view
  const handleDisableAllInView = async () => {
    const keysToRemove = new Set(
      filteredModels.flatMap((m) => [`${m.provider}/${m.id}`, m.id]),
    );
    const nextKeys = enabledModelKeys.filter((k) => !keysToRemove.has(k));
    await saveEnabledModels(nextKeys);
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
    await saveEnabledModels(nextKeys);
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
            background: activeModelsCount > 0 ? "rgba(56, 139, 253, 0.15)" : "rgba(255, 255, 255, 0.05)",
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
                transition: "all 0.15s ease",
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
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 12,
                    border: "none",
                    background: isSelected ? "var(--accent-base)" : "var(--bg-card)",
                    color: isSelected ? "#fff" : "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
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
            No models found matching your search.
          </div>
        ) : (
          Object.entries(groupedModels).map(([provider, providerModels]) => {
            const providerActiveCount = providerModels.filter((m) => isModelEnabled(m)).length;
            const allProviderActive = providerActiveCount === providerModels.length;

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
                    background: "rgba(255, 255, 255, 0.02)",
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

                  <button
                    onClick={() => handleToggleProvider(provider, !allProviderActive)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-base)",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {allProviderActive ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {/* Model Rows */}
                <div style={{ display: "flex", flexDirection: "column" }}>
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
                          borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
                          cursor: "pointer",
                          background: enabled ? "rgba(56, 139, 253, 0.04)" : "transparent",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = enabled
                            ? "rgba(56, 139, 253, 0.08)"
                            : "rgba(255, 255, 255, 0.03)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = enabled
                            ? "rgba(56, 139, 253, 0.04)"
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
                              transition: "all 0.15s ease",
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
