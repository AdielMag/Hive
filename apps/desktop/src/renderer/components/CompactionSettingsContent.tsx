import React, { useEffect, useState } from "react";
import { Check, Info, RotateCcw, Save } from "lucide-react";

interface CompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

const DEFAULT_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16384,
  keepRecentTokens: 20000,
};

const RESERVE_PRESETS = [
  { label: "8K (Aggressive)", value: 8192 },
  { label: "16K (Default / Recommended)", value: 16384 },
  { label: "32K (Spacious Response)", value: 32768 },
  { label: "64K (Max Output Models)", value: 65536 },
];

const KEEP_RECENT_PRESETS = [
  { label: "10K tokens", value: 10000 },
  { label: "20K tokens (Default)", value: 20000 },
  { label: "30K tokens", value: 30000 },
  { label: "40K tokens", value: 40000 },
];

export const CompactionSettingsContent: React.FC = () => {
  const [settings, setSettings] = useState<CompactionSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const sampleWindow = 200000; // 200k tokens

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loaded = await window.studio.getCompactionSettings();
        if (active && loaded) {
          setSettings(loaded);
        }
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

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      await window.studio.saveCompactionSettings(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save compaction settings", err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const triggerTokens = Math.max(0, sampleWindow - settings.reserveTokens);
  const triggerPercent = Math.min(100, Math.round((triggerTokens / sampleWindow) * 100));

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
        Loading compaction settings...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
          Control automatic conversation context summarization. Settings sync directly with{" "}
          <code style={{ color: "var(--text-primary)" }}>~/.pi/agent/settings.json</code>.
        </div>
      </div>

      {savedSuccess && (
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
          <span>Compaction settings saved successfully!</span>
        </div>
      )}

      {/* Enable Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
            Enable Automatic Compaction
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Automatically summarizes conversation history when context reaches the threshold to prevent context overflow.
          </span>
        </div>

        <label style={{ position: "relative", display: "inline-block", width: 38, height: 20, cursor: "pointer" }}>
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

      {/* Reserve Tokens Setting */}
      <div
        style={{
          padding: "14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: settings.enabled ? 1 : 0.6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
              Response Reserve Budget (`reserveTokens`)
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Tokens reserved for the model's reply. Auto-compaction triggers when context tokens exceed{" "}
              <code style={{ color: "var(--accent-base)" }}>contextWindow - reserveTokens</code>.
            </span>
          </div>

          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "var(--accent-base)",
              fontSize: 12,
              background: "rgba(var(--accent-rgb), 0.12)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {settings.reserveTokens.toLocaleString()} tokens
          </span>
        </div>

        {/* Presets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
          {RESERVE_PRESETS.map((p) => {
            const isSelected = settings.reserveTokens === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setSettings({ ...settings, reserveTokens: p.value })}
                disabled={!settings.enabled}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  textAlign: "left",
                  borderRadius: 6,
                  border: `1px solid ${isSelected ? "var(--accent-base)" : "var(--border-subtle)"}`,
                  background: isSelected ? "rgba(var(--accent-rgb), 0.1)" : "transparent",
                  color: isSelected ? "var(--accent-base)" : "var(--text-secondary)",
                  cursor: settings.enabled ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{p.label}</span>
                {isSelected && <Check size={12} />}
              </button>
            );
          })}
        </div>

        {/* Custom Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Custom budget:</span>
          <input
            type="number"
            min={1024}
            max={200000}
            step={1024}
            value={settings.reserveTokens}
            onChange={(e) => setSettings({ ...settings, reserveTokens: Math.max(1024, Number(e.target.value) || 16384) })}
            disabled={!settings.enabled}
            style={{
              width: 110,
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
      </div>

      {/* Threshold Preview Meter */}
      <div
        style={{
          padding: "12px 14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
            Effective Trigger Threshold (on 200K window)
          </span>
          <span style={{ color: "var(--accent-base)", fontWeight: 700 }}>
            {triggerPercent}% ({triggerTokens.toLocaleString()} / 200,000 tokens)
          </span>
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 5,
            background: "rgba(var(--fg-rgb), 0.08)",
            overflow: "hidden",
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${triggerPercent}%`,
              background: "linear-gradient(90deg, #3fb950, var(--accent-base))",
              borderRadius: 5,
              transition: "width 0.2s ease",
            }}
          />
        </div>

        <div style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <Info size={11} />
          <span>
            Compacting triggers before turns whenever context fills {triggerPercent}% of available context window.
          </span>
        </div>
      </div>

      {/* Keep Recent Tokens Setting */}
      <div
        style={{
          padding: "14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: settings.enabled ? 1 : 0.6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
              Retained Recent History (`keepRecentTokens`)
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              The amount of recent message history kept in full detail without being compressed during compaction.
            </span>
          </div>

          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "var(--accent-base)",
              fontSize: 12,
              background: "rgba(var(--accent-rgb), 0.12)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {settings.keepRecentTokens.toLocaleString()} tokens
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
          {KEEP_RECENT_PRESETS.map((p) => {
            const isSelected = settings.keepRecentTokens === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setSettings({ ...settings, keepRecentTokens: p.value })}
                disabled={!settings.enabled}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  textAlign: "left",
                  borderRadius: 6,
                  border: `1px solid ${isSelected ? "var(--accent-base)" : "var(--border-subtle)"}`,
                  background: isSelected ? "rgba(var(--accent-rgb), 0.1)" : "transparent",
                  color: isSelected ? "var(--accent-base)" : "var(--text-secondary)",
                  cursor: settings.enabled ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{p.label}</span>
                {isSelected && <Check size={12} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8 }}>
        <button
          type="button"
          onClick={handleReset}
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
