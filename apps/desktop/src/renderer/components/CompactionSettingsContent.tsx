/**
 * Auto-compaction settings, expressed as % of each model's context window. Pi itself only takes token
 * counts, so main converts these into per-model `compaction.modelOverrides` in ~/.pi/agent/settings.json.
 */
import React, { useEffect, useState } from "react";
import { Check, Info, RotateCcw, Save } from "lucide-react";
import type { CompactionSettings } from "@hive/protocol";

const DEFAULT_SETTINGS: CompactionSettings = { enabled: true, triggerPercent: 90, keepRecentPercent: 10, keepRecentMaxTokens: 20_000 };

/**
 * What compaction can't shrink: system prompt + tool schemas + context files (~9K in a plain Hive session,
 * more with many tools/skills) and the summary itself (~4K). Rough, for the preview only.
 */
const FIXED_OVERHEAD_TOKENS = 9_000;
const SUMMARY_TOKENS = 4_000;

const KEEP_MAX_PRESETS = [
  { label: "10K (Leanest)", value: 10_000 },
  { label: "20K (Default)", value: 20_000 },
  { label: "50K", value: 50_000 },
  { label: "No cap", value: 0 },
];

const TRIGGER_PRESETS = [
  { label: "40% (Early, lean context)", value: 40 },
  { label: "60%", value: 60 },
  { label: "80%", value: 80 },
  { label: "90% (Default)", value: 90 },
];

const KEEP_RECENT_PRESETS = [
  { label: "2%", value: 2 },
  { label: "5%", value: 5 },
  { label: "10% (Default)", value: 10 },
  { label: "20%", value: 20 },
];

/** Example windows for the preview; actual values are computed per model from its own window. */
const PREVIEW_WINDOWS = [
  { label: "200K window", tokens: 200_000 },
  { label: "1M window", tokens: 1_000_000 },
];

const fmtTokens = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}K`);

const card: React.CSSProperties = {
  padding: 14,
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const badge: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  color: "var(--accent-base)",
  fontSize: 12,
  background: "rgba(var(--accent-rgb), 0.12)",
  padding: "2px 8px",
  borderRadius: 4,
};

const TokenCapField: React.FC<{
  value: number;
  disabled: boolean;
  onChange(v: number): void;
}> = ({ value, disabled, onChange }) => (
  <div style={{ ...card, opacity: disabled ? 0.6 : 1 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>Cap on recent history</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Hard ceiling on the verbatim tail. The tail is raw tool output that summarization can&apos;t shrink, and a percentage
          of a big window gets huge (5% of 1M = 50K). The smaller of the two wins.
        </span>
      </div>
      <span style={badge}>{value > 0 ? fmtTokens(value) : "No cap"}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
      {KEEP_MAX_PRESETS.map((p) => {
        const isSelected = value === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            disabled={disabled}
            style={{
              padding: "6px 8px",
              fontSize: 11,
              textAlign: "left",
              borderRadius: 6,
              border: `1px solid ${isSelected ? "var(--accent-base)" : "var(--border-subtle)"}`,
              background: isSelected ? "rgba(var(--accent-rgb), 0.1)" : "transparent",
              color: isSelected ? "var(--accent-base)" : "var(--text-secondary)",
              cursor: disabled ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
            }}
          >
            <span>{p.label}</span>
            {isSelected && <Check size={12} />}
          </button>
        );
      })}
    </div>
  </div>
);

const PercentField: React.FC<{
  title: string;
  hint: React.ReactNode;
  value: number;
  min: number;
  max: number;
  presets: Array<{ label: string; value: number }>;
  disabled: boolean;
  onChange(v: number): void;
}> = ({ title, hint, value, min, max, presets, disabled, onChange }) => (
  <div style={{ ...card, opacity: disabled ? 0.6 : 1 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{title}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{hint}</span>
      </div>
      <span style={badge}>{value}%</span>
    </div>

    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%", accentColor: "var(--accent-base)" }}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
      {presets
        .filter((p) => p.value >= min && p.value <= max)
        .map((p) => {
          const isSelected = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              disabled={disabled}
              style={{
                padding: "6px 8px",
                fontSize: 11,
                textAlign: "left",
                borderRadius: 6,
                border: `1px solid ${isSelected ? "var(--accent-base)" : "var(--border-subtle)"}`,
                background: isSelected ? "rgba(var(--accent-rgb), 0.1)" : "transparent",
                color: isSelected ? "var(--accent-base)" : "var(--text-secondary)",
                cursor: disabled ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4,
              }}
            >
              <span>{p.label}</span>
              {isSelected && <Check size={12} />}
            </button>
          );
        })}
    </div>
  </div>
);

export const CompactionSettingsContent: React.FC = () => {
  const [settings, setSettings] = useState<CompactionSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loaded = await window.studio.getCompactionSettings();
        if (active && loaded) setSettings(loaded);
      } catch (err) {
        console.error("Failed to load compaction settings", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const maxKeep = settings.triggerPercent - 5;
  const setTrigger = (triggerPercent: number) =>
    setSettings((s) => ({ ...s, triggerPercent, keepRecentPercent: Math.min(s.keepRecentPercent, triggerPercent - 5) }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      const res = await window.studio.saveCompactionSettings(settings);
      setSaved(`Saved \u2014 applied to ${res.modelsUpdated} model${res.modelsUpdated === 1 ? "" : "s"}. New sessions pick it up.`);
      setTimeout(() => setSaved(null), 4000);
    } catch (err) {
      console.error("Failed to save compaction settings", err);
      setError(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading compaction settings...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
        Control automatic conversation summarization as a share of each model&apos;s context window. Studio converts these into
        per-model token limits in <code style={{ color: "var(--text-primary)" }}>~/.pi/agent/settings.json</code>, so a 1M-token
        model and a 200K-token model both compact at the same fill level.
      </div>

      {saved && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(63, 185, 80, 0.15)",
            border: "1px solid rgba(63, 185, 80, 0.3)",
            borderRadius: 6,
            color: "var(--success)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Check size={14} />
          <span>{saved}</span>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--danger, #f85149)" }}>{error}</div>}

      {/* Enable Toggle */}
      <div style={{ ...card, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>Enable Automatic Compaction</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Automatically summarizes conversation history when context reaches the threshold to prevent context overflow.
          </span>
        </div>
        <label style={{ position: "relative", display: "inline-block", width: 38, height: 20, cursor: "pointer", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: settings.enabled ? "var(--accent-base)" : "var(--border-prominent)",
              borderRadius: 20,
              transition: "0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                height: 14,
                width: 14,
                left: settings.enabled ? 21 : 3,
                bottom: 3,
                backgroundColor: "white",
                borderRadius: "50%",
                transition: "0.2s",
              }}
            />
          </span>
        </label>
      </div>

      <PercentField
        title="Compact when context reaches"
        hint="Share of the model's context window that triggers compaction. Lower keeps context lean (cheaper, faster); higher keeps more history."
        value={settings.triggerPercent}
        min={10}
        max={98}
        presets={TRIGGER_PRESETS}
        disabled={!settings.enabled}
        onChange={setTrigger}
      />

      <PercentField
        title="Keep recent history"
        hint="Share of the context window kept word-for-word after compaction; everything older is summarized."
        value={settings.keepRecentPercent}
        min={1}
        max={maxKeep}
        presets={KEEP_RECENT_PRESETS}
        disabled={!settings.enabled}
        onChange={(keepRecentPercent) => setSettings({ ...settings, keepRecentPercent })}
      />

      <TokenCapField
        value={settings.keepRecentMaxTokens ?? DEFAULT_SETTINGS.keepRecentMaxTokens!}
        disabled={!settings.enabled}
        onChange={(keepRecentMaxTokens) => setSettings({ ...settings, keepRecentMaxTokens })}
      />

      {/* Preview */}
      <div style={{ ...card, gap: 8, padding: "12px 14px" }}>
        <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>What this means per model</span>
        {PREVIEW_WINDOWS.map((w) => {
          const trigger = (w.tokens * settings.triggerPercent) / 100;
          const cap = settings.keepRecentMaxTokens ?? DEFAULT_SETTINGS.keepRecentMaxTokens!;
          const keep = Math.min((w.tokens * settings.keepRecentPercent) / 100, cap > 0 ? cap : Infinity);
          const after = FIXED_OVERHEAD_TOKENS + SUMMARY_TOKENS + keep;
          return (
            <div key={w.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                <span>{w.label}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  compacts at {fmtTokens(trigger)} · keeps last {fmtTokens(keep)} · ≈{fmtTokens(after)} after
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(var(--fg-rgb), 0.08)", overflow: "hidden", position: "relative" }}>
                <div
                  style={{
                    width: `${settings.triggerPercent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #3fb950, var(--accent-base))",
                    borderRadius: 4,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <Info size={11} />
          <span>
            Applied to every model in your catalog using its own context window. "After" = system prompt &amp; tools (~9K) +
            summary (~4K) + kept history; the first two can&apos;t be compacted.
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8 }}>
        <button
          type="button"
          onClick={() => setSettings(DEFAULT_SETTINGS)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            color: "var(--text-muted)",
            padding: "5px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <RotateCcw size={12} />
          <span>Reset Defaults</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent-base)",
            border: "none",
            borderRadius: 6,
            color: "var(--accent-contrast)",
            fontWeight: 600,
            padding: "6px 16px",
            fontSize: 12,
            cursor: saving ? "default" : "pointer",
          }}
        >
          <Save size={13} />
          <span>{saving ? "Saving..." : "Save Settings"}</span>
        </button>
      </div>
    </div>
  );
};
