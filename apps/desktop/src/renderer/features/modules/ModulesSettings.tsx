/** Settings → Modules: install/remove optional features. Dependency logic comes from @hive/module-sdk. */
import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Blocks,
  Check,
  ClipboardCheck,
  Copy,
  Feather,
  FileDiff,
  Files,
  Gauge,
  GitBranch,
  GitCommit,
  Globe,
  Layers,
  Link2,
  Loader2,
  Lock,
  Palette,
  PieChart,
  Puzzle,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { dependentsOf, indexManifests, type ModuleManifest } from "@hive/module-sdk";
import { MODULE_MANIFESTS } from "../../modules/manifests.ts";
import { useModules } from "../../modules/registry.ts";
import { PRESETS, TIER_LABEL, groupByTier, matchingPreset, presetIds } from "./presets.ts";

const CORE_FEATURES = [
  "Sessions & transcript",
  "Composer & model picker",
  "Projects & workspaces",
  "AI provider accounts",
  "Settings & themes",
  "Command palette",
];

const MODULE_ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  "bar-chart-3": BarChart3,
  "shield-alert": ShieldAlert,
  "git-branch": GitBranch,
  globe: Globe,
  "pie-chart": PieChart,
  "file-diff": FileDiff,
  files: Files,
  "git-commit": GitCommit,
  gauge: Gauge,
  blocks: Blocks,
  "shopping-bag": ShoppingBag,
  "clipboard-check": ClipboardCheck,
  terminal: Terminal,
  palette: Palette,
  wrench: Wrench,
};

const PRESET_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  minimal: Feather,
  recommended: Sparkles,
  everything: Layers,
};

const ModuleIcon: React.FC<{ icon?: string; size?: number }> = ({ icon, size = 16 }) => {
  const IconComp = (icon && MODULE_ICON_MAP[icon]) || Puzzle;
  return <IconComp size={size} />;
};

export const ModulesSettings: React.FC = () => {
  const enabled = useModules((s) => s.enabled);
  const errors = useModules((s) => s.errors);
  const notices = useModules((s) => s.notices);
  const binDir = useModules((s) => s.binDir);
  const setEnabled = useModules((s) => s.setEnabled);
  const setEnabledSet = useModules((s) => s.setEnabledSet);
  const clearNotices = useModules((s) => s.clearNotices);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [copiedBin, setCopiedBin] = useState(false);

  const graph = useMemo(() => indexManifests(MODULE_MANIFESTS), []);
  const active = matchingPreset(MODULE_MANIFESTS, enabled);
  const hasCliModule = MODULE_MANIFESTS.some((m) => enabled.includes(m.id) && m.agent?.bin);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of MODULE_MANIFESTS) {
      if (m.category) set.add(m.category);
    }
    return Array.from(set).sort();
  }, []);

  const counts = useMemo(() => {
    const res: Record<string, number> = {
      all: MODULE_MANIFESTS.length,
      active: enabled.length,
      recommended: MODULE_MANIFESTS.filter((m) => m.recommended || m.tier === "recommended").length,
    };
    for (const cat of categories) {
      res[cat] = MODULE_MANIFESTS.filter((m) => m.category === cat).length;
    }
    return res;
  }, [categories, enabled]);

  const filteredManifests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MODULE_MANIFESTS.filter((m) => {
      if (selectedCategory === "active" && !enabled.includes(m.id)) return false;
      if (selectedCategory === "recommended" && !m.recommended && m.tier !== "recommended") return false;
      if (selectedCategory !== "all" && selectedCategory !== "active" && selectedCategory !== "recommended") {
        if (m.category !== selectedCategory) return false;
      }
      if (!q) return true;
      const inTitle = m.title.toLowerCase().includes(q);
      const inDesc = m.description.toLowerCase().includes(q);
      const inId = m.id.toLowerCase().includes(q);
      const inCat = m.category?.toLowerCase().includes(q);
      const inBin = m.agent?.bin && Object.keys(m.agent.bin).some((b) => b.toLowerCase().includes(q));
      return inTitle || inDesc || inId || inCat || Boolean(inBin);
    });
  }, [search, selectedCategory, enabled]);

  const groups = useMemo(() => groupByTier(filteredManifests), [filteredManifests]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (m: ModuleManifest, on: boolean) => {
    if (!on) {
      const also = dependentsOf(graph, enabled, m.id).map((id) => graph.get(id)?.title ?? id);
      if (also.length && !window.confirm(`Turning off ${m.title} also turns off: ${also.join(", ")}. Continue?`)) return;
    }
    void run(m.id, () => setEnabled(m.id, on));
  };

  const copyBinDir = () => {
    if (!binDir) return;
    void navigator.clipboard.writeText(binDir);
    setCopiedBin(true);
    setTimeout(() => setCopiedBin(false), 2000);
  };

  return (
    <div className="settings__stack modules">
      <div className="modules__intro-box">
        <p className="modules__intro">
          Hive stays lean until you add what you need. Turning a module off removes its UI, background tasks, and Pi agent skills.
        </p>
      </div>

      <div className="modules__presets" role="group" aria-label="Setup presets">
        {PRESETS.map((p) => {
          const Icon = PRESET_ICONS[p.id] ?? Sparkles;
          const count = presetIds(MODULE_MANIFESTS, p.id).length;
          const isCurrent = active === p.id;
          return (
            <button
              key={p.id}
              className={`modules__preset${isCurrent ? " is-active" : ""}`}
              disabled={busy !== null}
              onClick={() => void run(`preset:${p.id}`, () => setEnabledSet(presetIds(MODULE_MANIFESTS, p.id)))}
            >
              <div className="modules__preset-head">
                <span className="modules__preset-title">
                  <span className="modules__preset-icon">
                    <Icon size={13} />
                  </span>
                  {p.title}
                </span>
                <span className="modules__preset-count">{count} modules</span>
              </div>
              <span className="modules__preset-blurb">{p.blurb}</span>
              {isCurrent && (
                <span className="modules__preset-badge">
                  <Check size={11} /> Active
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="settings__alert">
          <AlertCircle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {error}
        </div>
      )}

      {notices.length > 0 && (
        <div className="modules__notice" role="status">
          <div className="modules__notice-list">
            {notices.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={clearNotices}>
            Dismiss
          </button>
        </div>
      )}

      <section className="modules__core">
        <div className="modules__core-head">
          <span className="modules__core-title">
            <Lock size={12} /> Always Included
          </span>
          <span className="ui-chip ui-chip--ok">Core</span>
        </div>
        <div className="modules__core-pills">
          {CORE_FEATURES.map((feat) => (
            <span key={feat} className="modules__core-pill">
              <Check size={11} style={{ color: "var(--accent-base)" }} />
              {feat}
            </span>
          ))}
        </div>
      </section>

      <div className="modules__toolbar">
        <div className="modules__search-row">
          <div className="modules__search-wrap">
            <Search size={14} className="modules__search-icon" />
            <input
              type="text"
              className="modules__search-input"
              placeholder="Search modules by name, description, or CLI tool..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="modules__search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        <div className="modules__filter-bar">
          <button
            className={`modules__filter-pill${selectedCategory === "all" ? " is-active" : ""}`}
            onClick={() => setSelectedCategory("all")}
          >
            All <span className="modules__filter-count">{counts.all}</span>
          </button>
          <button
            className={`modules__filter-pill${selectedCategory === "active" ? " is-active" : ""}`}
            onClick={() => setSelectedCategory("active")}
          >
            Active <span className="modules__filter-count">{counts.active}</span>
          </button>
          <button
            className={`modules__filter-pill${selectedCategory === "recommended" ? " is-active" : ""}`}
            onClick={() => setSelectedCategory("recommended")}
          >
            Recommended <span className="modules__filter-count">{counts.recommended}</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`modules__filter-pill${selectedCategory === cat ? " is-active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat} <span className="modules__filter-count">{counts[cat]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="modules__status-bar">
        <span>
          Showing {filteredManifests.length} of {MODULE_MANIFESTS.length} modules
          {enabled.length > 0 && ` (${enabled.length} active)`}
        </span>
        {(search || selectedCategory !== "all") && (
          <button
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => {
              setSearch("");
              setSelectedCategory("all");
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      {filteredManifests.length === 0 ? (
        <div className="modules__empty">
          <Search size={24} />
          <p>
            No modules match <strong>&quot;{search}&quot;</strong>
            {selectedCategory !== "all" ? ` in category "${selectedCategory}"` : ""}
          </p>
          <button
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => {
              setSearch("");
              setSelectedCategory("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        groups.map(({ tier, modules }) => (
          <section key={tier} className="modules__group">
            <div className="modules__group-head">
              <h3 className="modules__group-title">{TIER_LABEL[tier]}</h3>
              <div className="modules__group-line" />
            </div>
            {modules.map((m) => {
              const on = enabled.includes(m.id);
              const requiredBy = dependentsOf(graph, enabled, m.id).map((id) => graph.get(id)?.title ?? id);
              const requires = (m.requires ?? []).map((id) => graph.get(id)?.title ?? id);
              const failed = errors[m.id];
              return (
                <article key={m.id} className={`modules__card${on ? " is-on" : ""}`}>
                  <div className="modules__card-head">
                    <div className="modules__card-icon">
                      <ModuleIcon icon={m.icon} size={18} />
                    </div>
                    <div className="modules__card-text">
                      <div className="modules__card-title-row">
                        <span className="modules__card-title">{m.title}</span>
                        {m.recommended && <span className="ui-chip ui-chip--accent">Recommended</span>}
                        {m.category && <span className="ui-chip">{m.category}</span>}
                        <span className={`modules__status-pill ${on ? "is-on" : "is-off"}`}>
                          {on ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <p className="modules__card-desc">{m.description}</p>
                    </div>
                    <div className="modules__card-toggle">
                      {busy === m.id ? (
                        <Loader2 size={16} className="spin" style={{ color: "var(--accent-base)" }} />
                      ) : (
                        <button
                          className="ui-switch"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${on ? "Turn off" : "Turn on"} ${m.title}`}
                          disabled={busy !== null || m.tier === "core"}
                          onClick={() => toggle(m, !on)}
                        />
                      )}
                    </div>
                  </div>
                  {(requires.length > 0 || (on && requiredBy.length > 0) || m.agent || failed) && (
                    <div className="modules__card-meta">
                      {requires.length > 0 && (
                        <span className="modules__pill modules__pill--req">
                          <Link2 size={11} /> Requires {requires.join(", ")}
                        </span>
                      )}
                      {on && requiredBy.length > 0 && (
                        <span className="modules__pill modules__pill--dep">
                          <AlertTriangle size={11} /> Required by {requiredBy.join(", ")}
                        </span>
                      )}
                      {m.agent?.skills && (
                        <span className="modules__pill modules__pill--skill">
                          <Sparkles size={11} /> Pi skills
                        </span>
                      )}
                      {m.agent?.extensions && (
                        <span className="modules__pill modules__pill--safety">
                          <ShieldAlert size={11} /> Safety guard
                        </span>
                      )}
                      {m.agent?.bin && (
                        <span className="modules__pill modules__pill--cli">
                          <Terminal size={11} /> Adds <code>{Object.keys(m.agent.bin).join(", ")}</code> command
                        </span>
                      )}
                      {failed && (
                        <span className="modules__pill modules__pill--err">
                          <AlertCircle size={11} /> {failed}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))
      )}

      {hasCliModule && binDir && (
        <div className="modules__cli-card">
          <div className="modules__cli-info">
            <div className="modules__cli-icon">
              <Terminal size={15} />
            </div>
            <div className="modules__cli-text">
              <span>CLI tools location: </span>
              <code>{binDir}</code>
            </div>
          </div>
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={copyBinDir} title="Copy path to clipboard">
            {copiedBin ? <Check size={12} style={{ color: "var(--success)" }} /> : <Copy size={12} />}
            <span>{copiedBin ? "Copied" : "Copy Path"}</span>
          </button>
        </div>
      )}
    </div>
  );
};
