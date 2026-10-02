import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Cpu, RotateCcw, Search, X } from "lucide-react";
import { useSessionStore } from "../../store/session-store.ts";
import { ProviderIcon } from "../../components/ProviderIcon.tsx";

interface Props {
  currentValue?: string | null;
  disabled?: boolean;
  onSelect: (modelKey: string | null) => void;
}

export const ModelPicker: React.FC<Props> = ({ currentValue, disabled, onSelect }) => {
  const allCatalogModels = useSessionStore((s) => s.allCatalogModels);
  const enabledModelKeys = useSessionStore((s) => s.enabledModelKeys);
  const loadModelsCatalog = useSessionStore((s) => s.loadModelsCatalog);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (allCatalogModels.length === 0) {
      void loadModelsCatalog();
    }
  }, [allCatalogModels.length, loadModelsCatalog]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Resolve matching catalog model for current value
  const matchedModel = useMemo(() => {
    if (!currentValue) return null;
    const clean = currentValue.trim();
    return (
      allCatalogModels.find(
        (m) => `${m.provider}/${m.id}` === clean || m.id === clean || `${m.provider}/${m.id}`.toLowerCase() === clean.toLowerCase(),
      ) ?? null
    );
  }, [currentValue, allCatalogModels]);

  const isFuzzyOrCustom = Boolean(currentValue && !matchedModel);

  // Filtered catalog
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCatalogModels;
    return allCatalogModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [allCatalogModels, search]);

  // Split into enabled / all
  const enabledModels = useMemo(() => {
    const set = new Set(enabledModelKeys);
    return filteredModels.filter((m) => set.has(`${m.provider}/${m.id}`) || set.has(m.id));
  }, [filteredModels, enabledModelKeys]);

  // Group rest by provider
  const groupedByProvider = useMemo(() => {
    const map = new Map<string, typeof allCatalogModels>();
    filteredModels.forEach((m) => {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredModels]);

  const formatTokens = (n?: number) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(n);
  };

  const handleSelect = (key: string | null) => {
    onSelect(key);
    setOpen(false);
  };

  return (
    <div className="lib-model-picker" ref={popoverRef}>
      <button
        type="button"
        className={`lib-model-picker__trigger ui-btn ${open ? "is-open" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        title={currentValue ?? "Inherit parent session model"}
      >
        <span className="lib-model-picker__trigger-icon">
          {matchedModel ? (
            <ProviderIcon provider={matchedModel.provider} size={14} />
          ) : currentValue ? (
            <Cpu size={14} />
          ) : (
            <RotateCcw size={13} className="text-muted" />
          )}
        </span>
        <span className="lib-model-picker__trigger-label">
          {matchedModel ? (
            <>
              <span className="lib-model-picker__name">{matchedModel.name}</span>
              <span className="lib-model-picker__provider text-muted">{matchedModel.provider}</span>
            </>
          ) : currentValue ? (
            <>
              <span className="lib-model-picker__name">{currentValue}</span>
              {isFuzzyOrCustom && (
                <span className="lib-model-picker__fuzzy-badge" title="Resolved fuzzily or via fallback by pi-subagents">
                  Custom
                </span>
              )}
            </>
          ) : (
            <span className="text-muted" style={{ fontStyle: "italic" }}>
              Inherit (parent model)
            </span>
          )}
        </span>
        <ChevronDown size={13} className="lib-model-picker__chevron text-muted" />
      </button>

      {open && (
        <div className="lib-model-picker__popover ui-card">
          <div className="lib-model-picker__search">
            <Search size={13} className="text-muted" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
            {search && (
              <button className="lib-model-picker__clear-btn" onClick={() => setSearch("")}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="lib-model-picker__list">
            {/* Option: Inherit parent model */}
            <button
              type="button"
              className={`lib-model-picker__item ${!currentValue ? "is-selected" : ""}`}
              onClick={() => handleSelect(null)}
            >
              <RotateCcw size={14} className="text-muted" />
              <div className="lib-model-picker__item-info">
                <span className="lib-model-picker__item-name">Inherit (parent model)</span>
                <span className="lib-model-picker__item-sub text-muted">Use whatever model the active session runs</span>
              </div>
              {!currentValue && <Check size={14} className="lib-model-picker__item-check" />}
            </button>

            {/* Custom/fuzzy row if current value isn't recognized */}
            {isFuzzyOrCustom && currentValue && (
              <div className="lib-model-picker__group">
                <div className="lib-model-picker__group-title">Current frontmatter value</div>
                <div className="lib-model-picker__item is-selected">
                  <Cpu size={14} />
                  <div className="lib-model-picker__item-info">
                    <span className="lib-model-picker__item-name">{currentValue}</span>
                    <span className="lib-model-picker__item-sub text-warning" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <AlertCircle size={11} /> Not in catalog (fuzzy match)
                    </span>
                  </div>
                  <Check size={14} className="lib-model-picker__item-check" />
                </div>
              </div>
            )}

            {/* Enabled models */}
            {enabledModels.length > 0 && !search && (
              <div className="lib-model-picker__group">
                <div className="lib-model-picker__group-title">Enabled in Studio</div>
                {enabledModels.map((m) => {
                  const key = `${m.provider}/${m.id}`;
                  const isSelected = currentValue === key || currentValue === m.id;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`lib-model-picker__item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleSelect(key)}
                    >
                      <ProviderIcon provider={m.provider} size={14} />
                      <div className="lib-model-picker__item-info">
                        <span className="lib-model-picker__item-name">{m.name}</span>
                        <span className="lib-model-picker__item-sub text-muted">{key}</span>
                      </div>
                      <div className="lib-model-picker__item-meta">
                        {m.contextWindow && <span className="lib-model-picker__token-badge">{formatTokens(m.contextWindow)}</span>}
                        {m.reasoning && <span className="lib-model-picker__reasoning-badge">Reasoning</span>}
                      </div>
                      {isSelected && <Check size={14} className="lib-model-picker__item-check" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* All models grouped by provider */}
            {groupedByProvider.map(([provider, models]) => (
              <div key={provider} className="lib-model-picker__group">
                <div className="lib-model-picker__group-title">{provider}</div>
                {models.map((m) => {
                  const key = `${m.provider}/${m.id}`;
                  const isSelected = currentValue === key || currentValue === m.id;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`lib-model-picker__item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleSelect(key)}
                    >
                      <ProviderIcon provider={m.provider} size={14} />
                      <div className="lib-model-picker__item-info">
                        <span className="lib-model-picker__item-name">{m.name}</span>
                        <span className="lib-model-picker__item-sub text-muted">{m.id}</span>
                      </div>
                      <div className="lib-model-picker__item-meta">
                        {m.contextWindow && <span className="lib-model-picker__token-badge">{formatTokens(m.contextWindow)}</span>}
                        {m.reasoning && <span className="lib-model-picker__reasoning-badge">Reasoning</span>}
                      </div>
                      {isSelected && <Check size={14} className="lib-model-picker__item-check" />}
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredModels.length === 0 && (
              <div className="lib-model-picker__empty text-muted">No models match &ldquo;{search}&rdquo;</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
