import React from "react";
import { Check, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { useSoundStore, playUiSound } from "../store/sound-store.ts";
import {
  SOUND_CATEGORIES,
  SOUND_DEFINITIONS,
  SOUND_THEMES,
  type SoundCategory,
  type SoundTheme,
} from "../audio/sound-types.ts";

const Switch: React.FC<{ checked: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  label,
  disabled,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    className="ui-switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  />
);

const Section: React.FC<{ title: string; hint?: string; disabled?: boolean; children: React.ReactNode }> = ({
  title,
  hint,
  disabled,
  children,
}) => (
  <section className={`sound-section${disabled ? " is-disabled" : ""}`}>
    <div className="sound-section__head">
      <span className="ui-section-label">{title}</span>
      {hint && <span className="sound-section__hint">{hint}</span>}
    </div>
    {children}
  </section>
);

export const SoundSettingsContent: React.FC = () => {
  const enabled = useSoundStore((s) => s.enabled);
  const volume = useSoundStore((s) => s.volume);
  const theme = useSoundStore((s) => s.theme);
  const categories = useSoundStore((s) => s.categories);

  const setEnabled = useSoundStore((s) => s.setEnabled);
  const setVolume = useSoundStore((s) => s.setVolume);
  const setTheme = useSoundStore((s) => s.setTheme);
  const setCategory = useSoundStore((s) => s.setCategory);

  const pct = Math.round(volume * 100);
  const VolumeIcon = !enabled || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="sound-settings">
      <Section title="General">
        <div className="ui-card sound-card">
          <div className="ui-row">
            <div>
              <div className="ui-row__title">Sound effects</div>
              <div className="ui-row__hint">Play short sounds for agent activity, plans, alerts and UI actions</div>
            </div>
            <Switch
              checked={enabled}
              label="Sound effects"
              onChange={(v) => {
                setEnabled(v);
                if (v) playUiSound("button_click");
              }}
            />
          </div>
          <div className={`ui-row${enabled ? "" : " is-dimmed"}`}>
            <div className="sound-volume">
              <VolumeIcon size={16} className="sound-volume__icon" />
              <input
                className="ui-range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!enabled}
                value={volume}
                aria-label="Volume"
                onChange={(e) => setVolume(Number(e.target.value))}
                onPointerUp={() => playUiSound("button_click")}
                style={{ "--track": `linear-gradient(to right, var(--accent-base) ${pct}%, rgba(var(--fg-rgb), 0.12) ${pct}%)` } as React.CSSProperties}
              />
              <span className="mono sound-volume__value">{pct}%</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Sound theme" hint="Click a theme to select it and hear a preview" disabled={!enabled}>
        <div className="sound-themes" role="radiogroup" aria-label="Sound theme">
          {SOUND_THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!enabled}
                className={`sound-theme${active ? " is-active" : ""}`}
                onClick={() => {
                  setTheme(t.id as SoundTheme);
                  playUiSound("agent_settled");
                }}
              >
                <span className="sound-theme__title">
                  {t.label}
                  {active && <Check size={13} />}
                </span>
                <span className="sound-theme__desc">{t.description}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="When to play" hint="Choose which events make sound" disabled={!enabled}>
        <div className="ui-card sound-card">
          {SOUND_CATEGORIES.map((cat) => (
            <div key={cat.id} className="ui-row">
              <div>
                <div className="ui-row__title">{cat.label}</div>
                <div className="ui-row__hint">{cat.description}</div>
              </div>
              <Switch
                checked={categories[cat.id]}
                label={cat.label}
                disabled={!enabled}
                onChange={(v) => {
                  setCategory(cat.id as SoundCategory, v);
                  if (v) playUiSound("button_click");
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Preview sounds" hint="Plays with the selected theme, even while muted">
        {SOUND_CATEGORIES.map((cat) => {
          const defs = Object.values(SOUND_DEFINITIONS).filter((d) => d.category === cat.id);
          if (defs.length === 0) return null;
          return (
            <div key={cat.id} className="sound-group">
              <div className="sound-group__title">{cat.label}</div>
              <div className="ui-card sound-card">
                {defs.map((def) => (
                  <div key={def.id} className="ui-row">
                    <div>
                      <div className="ui-row__title">{def.label}</div>
                      <div className="ui-row__hint">{def.description}</div>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn--icon"
                      title={`Play ${def.label}`}
                      aria-label={`Play ${def.label}`}
                      onClick={() => playUiSound(def.id, true)}
                    >
                      <Play size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </Section>
    </div>
  );
};
