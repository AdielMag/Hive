import React from "react";
import { Play, Volume2, VolumeX, Sparkles, Sliders, Music, Radio } from "lucide-react";
import { useSoundStore, playUiSound } from "../store/sound-store.ts";
import {
  SOUND_CATEGORIES,
  SOUND_DEFINITIONS,
  SOUND_THEMES,
  type SoundCategory,
  type SoundTheme,
} from "../audio/sound-types.ts";

export const SoundSettingsContent: React.FC = () => {
  const enabled = useSoundStore((s) => s.enabled);
  const volume = useSoundStore((s) => s.volume);
  const theme = useSoundStore((s) => s.theme);
  const categories = useSoundStore((s) => s.categories);

  const setEnabled = useSoundStore((s) => s.setEnabled);
  const setVolume = useSoundStore((s) => s.setVolume);
  const setTheme = useSoundStore((s) => s.setTheme);
  const setCategory = useSoundStore((s) => s.setCategory);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Master Audio Controls */}
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span className="ui-section-label" style={{ display: "block" }}>Master Sound</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Enable procedural sound effects across the workbench
            </span>
          </div>
          <button
            className={`ui-btn ${enabled ? "ui-btn--primary" : "ui-btn--secondary"}`}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => {
              playUiSound("button_click", true);
              setEnabled(!enabled);
            }}
          >
            {enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{enabled ? "Enabled" : "Muted"}</span>
          </button>
        </div>

        {/* Volume Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: enabled ? 1 : 0.4 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 80 }}>Volume</label>
          <input
            className="ui-range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={!enabled}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="mono" style={{ fontSize: 12, minWidth: 40, textAlign: "right" }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      </section>

      {/* Sound Theme / Pack */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10, opacity: enabled ? 1 : 0.4 }}>
        <span className="ui-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={13} /> Sound Theme
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {SOUND_THEMES.map((t) => (
            <button
              key={t.id}
              disabled={!enabled}
              className={`ui-btn ${theme === t.id ? "ui-btn--primary" : "ui-btn--ghost"}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "8px 12px",
                textAlign: "left",
                border: theme === t.id ? "1px solid var(--accent)" : "1px solid var(--border-subtle)",
              }}
              onClick={() => {
                setTheme(t.id as SoundTheme);
                playUiSound("agent_settled", true);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
                <Music size={12} />
                <span>{t.label}</span>
              </div>
              <span style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12, opacity: enabled ? 1 : 0.4 }}>
        <span className="ui-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Sliders size={13} /> Sound Categories
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SOUND_CATEGORIES.map((cat) => (
            <label
              key={cat.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 12,
                cursor: enabled ? "pointer" : "default",
                padding: "4px 0",
              }}
            >
              <input
                type="checkbox"
                disabled={!enabled}
                checked={categories[cat.id]}
                onChange={(e) => {
                  playUiSound("button_click");
                  setCategory(cat.id as SoundCategory, e.target.checked);
                }}
                style={{ marginTop: 2 }}
              />
              <div>
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{cat.label}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)" }}>
                  {cat.description}
                </span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Preview Sound Matrix */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="ui-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Radio size={13} /> Test Sound Effects
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            maxHeight: 280,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {Object.values(SOUND_DEFINITIONS).map((def) => (
            <div
              key={def.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderRadius: 6,
                background: "var(--bg-subtle)",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{def.label}</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{def.description}</span>
              </div>
              <button
                className="ui-btn ui-btn--ghost ui-btn--icon"
                title={`Preview ${def.label}`}
                onClick={() => playUiSound(def.id, true)}
                style={{ padding: 4 }}
              >
                <Play size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
