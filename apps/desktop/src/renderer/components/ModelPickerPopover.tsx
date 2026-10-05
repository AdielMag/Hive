/** Compact, searchable model picker shown on right-click of an AiModelChip. Rendered in a portal at the cursor. */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Brain, Check, Search, SlidersHorizontal, Zap, Cpu, Star } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useFeatureModelStore, type FeatureModelPreference } from "../store/feature-models-store.ts";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { formatContextWindow, getSupportedThinkingLevels } from "../lib/models/thinking.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";

export type ModelPickerFeature = "gitCommit" | "usageAnalysis" | "session";

export interface ModelPickerAnchor {
  x: number;
  y: number;
}

interface Props {
  anchor: ModelPickerAnchor | null;
  feature: ModelPickerFeature;
  onClose: () => void;
}

interface SourceRow {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  active: boolean;
  onPick: () => void;
}

interface ModelRow {
  key: string;
  provider: string;
  id: string;
  name: string;
  contextWindow?: number;
  reasoning: boolean;
  levels: string[];
  active: boolean;
  onPick: () => void;
}

const WIDTH = 300;
const MAX_HEIGHT = 340;

export const ModelPickerPopover: React.FC<Props> = ({ anchor, feature, onClose }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const { models, allCatalogModels, enabledModelKeys, selectedModel, defaultModel, setModel } = useSessionStore(
    useShallow((s) => ({
      models: s.models,
      allCatalogModels: s.allCatalogModels,
      enabledModelKeys: s.enabledModelKeys,
      selectedModel: s.selectedModel,
      defaultModel: s.defaultModel,
      setModel: s.setModel,
    })),
  );
  const { config, setGitCommitConfig, setUsageAnalysisConfig } = useFeatureModelStore(
    useShallow((s) => ({
      config: s.config,
      setGitCommitConfig: s.setGitCommitConfig,
      setUsageAnalysisConfig: s.setUsageAnalysisConfig,
    })),
  );

  const pref: FeatureModelPreference | null =
    feature === "gitCommit" ? config.gitCommit : feature === "usageAnalysis" ? config.usageAnalysis : null;
  const apply = feature === "gitCommit" ? setGitCommitConfig : setUsageAnalysisConfig;

  // Same visibility rules as the Composer's picker: only enabled models, falling back to all.
  const visibleModels = useMemo(() => {
    const map = new Map<string, (typeof models)[0]>();
    for (const m of allCatalogModels) map.set(`${m.provider}/${m.id}`, m);
    for (const m of models) map.set(`${m.provider}/${m.id}`, m);
    const base = Array.from(map.values());
    if (!enabledModelKeys || enabledModelKeys.length === 0) return base;
    const enabled = new Set(enabledModelKeys);
    const filtered = base.filter(
      (m) => enabled.has(`${m.provider}/${m.id}`) || enabledModelKeys.some((k) => !k.includes("/") && k === m.id),
    );
    return filtered.length > 0 ? filtered : base;
  }, [allCatalogModels, models, enabledModelKeys]);

  const q = query.trim().toLowerCase();

  const sourceRows = useMemo<SourceRow[]>(() => {
    if (!pref) return [];
    const rows: SourceRow[] = [
      {
        key: "session",
        label: "Active session model",
        icon: <Cpu size={13} />,
        active: pref.source === "session",
        onPick: () => apply({ source: "session" }),
      },
      {
        key: "pi-default",
        label: "Pi CLI default",
        hint: defaultModel || undefined,
        icon: <Star size={13} />,
        active: pref.source === "pi-default",
        onPick: () => apply({ source: "pi-default" }),
      },
    ];
    if (feature === "usageAnalysis") {
      rows.push({
        key: "heuristic",
        label: "Fast local rules",
        hint: "no LLM",
        icon: <Zap size={13} />,
        active: pref.source === "heuristic",
        onPick: () => apply({ source: "heuristic" }),
      });
    }
    return q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref?.source, defaultModel, feature, q]);

  const modelRows = useMemo<ModelRow[]>(() => {
    const matching = q
      ? visibleModels.filter(
          (m) =>
            (m.name || "").toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q) ||
            (m.provider || "").toLowerCase().includes(q),
        )
      : visibleModels;
    return matching
      .map((m): ModelRow => {
        const key = `${m.provider}/${m.id}`;
        const levels = getSupportedThinkingLevels(m).filter((l) => l !== "off");
        const active =
          feature === "session"
            ? selectedModel?.id === m.id && selectedModel?.provider === m.provider
            : pref?.source === "custom" && (pref.modelId === key || pref.modelId === m.id);
        return {
          key,
          provider: m.provider,
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.contextWindow,
          reasoning: Boolean(m.reasoning) && levels.length > 0,
          levels,
          active,
          onPick: () => (feature === "session" ? void setModel(m.provider, m.id) : apply({ source: "custom", modelId: key })),
        };
      })
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleModels, q, feature, selectedModel, pref]);

  // Flat list drives keyboard navigation across both sections.
  const flat = useMemo(
    () => [
      ...sourceRows.map((r) => ({ key: `s:${r.key}`, pick: r.onPick })),
      ...modelRows.map((r) => ({ key: `m:${r.key}`, pick: r.onPick })),
    ],
    [sourceRows, modelRows],
  );

  useEffect(() => setCursor(0), [q]);

  // Reset state each time the popover opens.
  useEffect(() => {
    if (!anchor) return;
    setQuery("");
    setCursor(0);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [anchor]);

  // Clamp to viewport once rendered; flip upward if it would overflow the bottom.
  useLayoutEffect(() => {
    if (!anchor || !rootRef.current) {
      setPos(null);
      return;
    }
    const { width, height } = rootRef.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.max(pad, Math.min(anchor.x, window.innerWidth - width - pad));
    const below = anchor.y;
    const top =
      below + height + pad <= window.innerHeight ? below : Math.max(pad, anchor.y - height);
    setPos({ left, top });
  }, [anchor, flat.length]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [anchor, onClose]);

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!anchor) return null;

  const choose = (pick: () => void) => {
    pick();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[cursor];
      if (item) choose(item.pick);
    }
  };

  const rowStyle = (active: boolean, highlighted: boolean): React.CSSProperties => ({
    padding: "5px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    cursor: "pointer",
    fontSize: 11,
    background: highlighted ? "var(--bg-card-hover)" : active ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
    color: active ? "var(--accent-base)" : "var(--text-primary)",
  });

  const sectionLabel: React.CSSProperties = {
    padding: "6px 10px 2px",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  };

  let lastProvider = "";
  const title = feature === "session" ? "Switch session model" : "Model for this action";

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        zIndex: 10000,
        left: pos?.left ?? anchor.x,
        top: pos?.top ?? anchor.y,
        visibility: pos ? "visible" : "hidden",
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-prominent)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-card)",
        }}
      >
        <Search size={12} color="var(--text-muted)" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${title} — search…`}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 11,
            width: "100%",
          }}
        />
      </div>

      <div ref={listRef} style={{ overflowY: "auto", padding: "2px 0 4px", flex: 1 }}>
        {flat.length === 0 && (
          <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
            No matching models
          </div>
        )}

        {sourceRows.map((r, i) => (
          <div
            key={r.key}
            data-idx={i}
            role="option"
            aria-selected={r.active}
            onClick={() => choose(r.onPick)}
            onMouseEnter={() => setCursor(i)}
            style={rowStyle(r.active, cursor === i)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {r.icon}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
              {r.hint && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{r.hint}</span>}
            </span>
            {r.active && <Check size={12} style={{ flexShrink: 0 }} />}
          </div>
        ))}

        {modelRows.map((m, j) => {
          const i = sourceRows.length + j;
          const header = m.provider !== lastProvider;
          lastProvider = m.provider;
          const ctx = formatContextWindow(m.contextWindow);
          return (
            <React.Fragment key={m.key}>
              {header && (
                <div style={{ ...sectionLabel, display: "flex", alignItems: "center", gap: 5 }}>
                  <ProviderIcon provider={m.provider} size={10} />
                  {m.provider}
                </div>
              )}
              <div
                data-idx={i}
                role="option"
                aria-selected={m.active}
                onClick={() => choose(m.onPick)}
                onMouseEnter={() => setCursor(i)}
                style={rowStyle(m.active, cursor === i)}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: m.active ? 600 : 500,
                    paddingLeft: 4,
                  }}
                >
                  {m.name}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  {ctx && (
                    <span
                      title={`Context window: ${m.contextWindow?.toLocaleString()} tokens`}
                      style={{
                        fontSize: 9,
                        padding: "1px 4px",
                        borderRadius: 3,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {ctx}
                    </span>
                  )}
                  {m.reasoning && (
                    <span title={`Supports reasoning (${m.levels.join(", ")})`} style={{ display: "flex", color: "var(--accent-base)" }}>
                      <Brain size={12} />
                    </span>
                  )}
                  {m.active && <Check size={12} />}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-card)",
          fontSize: 10,
          color: "var(--text-muted)",
        }}
      >
        <span>↑↓ navigate · Enter select</span>
        <button
          type="button"
          onClick={() => {
            onClose();
            useUi.getState().openSettings("models");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            background: "transparent",
            border: "none",
            color: "var(--accent-base)",
            fontSize: 10,
            cursor: "pointer",
            padding: 0,
            fontWeight: 500,
          }}
        >
          <SlidersHorizontal size={10} />
          <span>Manage…</span>
        </button>
      </div>
    </div>,
    document.body,
  );
};
