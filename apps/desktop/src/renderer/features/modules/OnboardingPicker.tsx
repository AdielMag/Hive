/** First-run "Choose your setup" dialog (shown while modules.json says onboarded === false). */
import React, { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { normalizeEnabled } from "@hive/module-sdk";
import { MODULE_MANIFESTS } from "../../modules/manifests.ts";
import { useModules } from "../../modules/registry.ts";
import { PRESETS, TIER_LABEL, groupByTier, matchingPreset, presetIds, type PresetId } from "./presets.ts";

export const OnboardingPicker: React.FC = () => {
  const enabled = useModules((s) => s.enabled);
  const setEnabledSet = useModules((s) => s.setEnabledSet);
  const markOnboarded = useModules((s) => s.markOnboarded);
  const [selection, setSelection] = useState<string[]>(() => normalizeEnabled(MODULE_MANIFESTS, enabled));
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupByTier(MODULE_MANIFESTS).filter((g) => g.tier !== "core"), []);
  const preset = matchingPreset(MODULE_MANIFESTS, selection);

  const choose = (id: PresetId) => setSelection(presetIds(MODULE_MANIFESTS, id));
  const toggle = (id: string) =>
    setSelection((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return normalizeEnabled(MODULE_MANIFESTS, next);
    });

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await setEnabledSet(selection);
      await markOnboarded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim">
      <div className="onboarding" role="dialog" aria-modal="true" aria-label="Choose your setup">
        <h2>Choose your setup</h2>
        <p className="onboarding__sub">Hive starts lean. Pick what to include now; you can change this any time in Settings → Modules.</p>

        <div className="modules__presets">
          {PRESETS.map((p) => (
            <button key={p.id} className={`modules__preset${preset === p.id ? " is-active" : ""}`} onClick={() => choose(p.id)}>
              <span className="modules__preset-title">
                {preset === p.id && <Check size={13} />} {p.title}
              </span>
              <span className="modules__preset-blurb">{p.blurb}</span>
            </button>
          ))}
        </div>

        <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setCustom((v) => !v)} aria-expanded={custom}>
          {custom ? "Hide details" : "Customize…"}
        </button>

        {custom && (
          <div className="onboarding__list">
            {groups.map(({ tier, modules }) => (
              <div key={tier}>
                <h3 className="modules__group-title">{TIER_LABEL[tier]}</h3>
                {modules.map((m) => (
                  <label key={m.id} className="onboarding__row">
                    <input type="checkbox" checked={selection.includes(m.id)} onChange={() => toggle(m.id)} />
                    <span>
                      <strong>{m.title}</strong>
                      <span className="modules__card-desc">{m.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}

        {error && <div className="settings__alert">{error}</div>}

        <div className="onboarding__actions">
          <button className="ui-btn ui-btn--primary" disabled={busy} onClick={() => void finish()}>
            {busy ? "Setting up…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
};
