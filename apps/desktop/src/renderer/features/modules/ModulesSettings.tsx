/** Settings → Modules: install/remove optional features. Dependency logic comes from @hive/module-sdk. */
import React, { useMemo, useState } from "react";
import { AlertCircle, Check, Terminal } from "lucide-react";
import { dependentsOf, indexManifests, type ModuleManifest } from "@hive/module-sdk";
import { MODULE_MANIFESTS } from "../../modules/manifests.ts";
import { useModules } from "../../modules/registry.ts";
import { PRESETS, TIER_LABEL, groupByTier, matchingPreset, presetIds } from "./presets.ts";

const CORE_FEATURES = ["Sessions & transcript", "Composer & model picker", "Projects", "Accounts", "Settings", "Command palette"];

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

  const graph = useMemo(() => indexManifests(MODULE_MANIFESTS), []);
  const groups = useMemo(() => groupByTier(MODULE_MANIFESTS), []);
  const active = matchingPreset(MODULE_MANIFESTS, enabled);
  const hasCliModule = MODULE_MANIFESTS.some((m) => enabled.includes(m.id) && m.agent?.bin);

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

  return (
    <div className="settings__stack modules">
      <p className="modules__intro">
        Hive stays small until you add what you need. Turning a module off removes its UI, background work and the agent skills it installed.
      </p>

      <div className="modules__presets" role="group" aria-label="Setup presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`modules__preset${active === p.id ? " is-active" : ""}`}
            disabled={busy !== null}
            onClick={() => void run(`preset:${p.id}`, () => setEnabledSet(presetIds(MODULE_MANIFESTS, p.id)))}
          >
            <span className="modules__preset-title">
              {active === p.id && <Check size={13} />} {p.title}
            </span>
            <span className="modules__preset-blurb">{p.blurb}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="settings__alert">
          <AlertCircle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
          {error}
        </div>
      )}
      {notices.length > 0 && (
        <div className="modules__notice" role="status">
          {notices.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={clearNotices}>
            Dismiss
          </button>
        </div>
      )}

      <section className="ui-card modules__core">
        <h3>Always included</h3>
        <p>{CORE_FEATURES.join(" · ")}</p>
      </section>

      {groups.map(({ tier, modules }) => (
        <section key={tier} className="modules__group">
          <h3 className="modules__group-title">{TIER_LABEL[tier]}</h3>
          {modules.map((m) => {
            const on = enabled.includes(m.id);
            const requiredBy = dependentsOf(graph, enabled, m.id).map((id) => graph.get(id)?.title ?? id);
            const requires = (m.requires ?? []).map((id) => graph.get(id)?.title ?? id);
            const failed = errors[m.id];
            return (
              <article key={m.id} className={`ui-card modules__card${on ? " is-on" : ""}`}>
                <div className="modules__card-head">
                  <div className="modules__card-text">
                    <span className="modules__card-title">
                      {m.title}
                      {m.category && <span className="ui-chip">{m.category}</span>}
                    </span>
                    <span className="modules__card-desc">{m.description}</span>
                  </div>
                  <button
                    className="ui-switch"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Turn off" : "Turn on"} ${m.title}`}
                    disabled={busy !== null || m.tier === "core"}
                    onClick={() => toggle(m, !on)}
                  />
                </div>
                {(requires.length > 0 || (on && requiredBy.length > 0) || m.agent || failed) && (
                  <div className="modules__card-meta">
                    {requires.length > 0 && <span>Needs {requires.join(", ")}</span>}
                    {on && requiredBy.length > 0 && <span>Required by {requiredBy.join(", ")}. Turning this off turns those off too.</span>}
                    {m.agent?.skills && <span>Installs Pi skills</span>}
                    {m.agent?.bin && (
                      <span>
                        <Terminal size={11} style={{ verticalAlign: -1 }} /> Adds the {Object.keys(m.agent.bin).join(", ")} command
                      </span>
                    )}
                    {failed && <span className="modules__card-error">Problem: {failed}</span>}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}

      {hasCliModule && binDir && (
        <p className="modules__hint">
          Command-line tools from enabled modules live in <code>{binDir}</code>. Add it to your PATH to run them from a terminal.
        </p>
      )}
    </div>
  );
};
