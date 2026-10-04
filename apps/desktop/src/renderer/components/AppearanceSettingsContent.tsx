import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAppearance } from "../features/appearance/appearance-store.ts";
import { Slot } from "../modules/ModuleViews.tsx";
import { useSlot } from "../modules/registry.ts";

const ModeSwitch: React.FC<{ value: "auto" | "dark" | "light"; onChange: (mode: "auto" | "dark" | "light") => void }> = ({ value, onChange }) => (
  <div className="ui-seg" role="radiogroup" aria-label="Theme mode">
    <button className={`ui-seg__btn${value === "dark" ? " is-active" : ""}`} onClick={() => onChange("dark")}>
      <Moon size={13} /> Dark
    </button>
    <button className={`ui-seg__btn${value === "light" ? " is-active" : ""}`} onClick={() => onChange("light")}>
      <Sun size={13} /> Light
    </button>
    <button className={`ui-seg__btn${value === "auto" ? " is-active" : ""}`} onClick={() => onChange("auto")}>
      <Monitor size={13} /> Auto
    </button>
  </div>
);

export const AppearanceSettingsContent: React.FC = () => {
  const theme = useAppearance((s) => s.theme);
  const editor = useAppearance((s) => s.editor);
  const setTheme = useAppearance((s) => s.setTheme);
  const setEditor = useAppearance((s) => s.setEditor);
  const studio = useSlot("settings.appearance").length > 0;

  // A module (Theme Studio) that fills the slot replaces this basic page entirely.
  if (studio) return <Slot name="settings.appearance" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Theme Mode */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="ui-section-label">Theme Mode</span>
        <ModeSwitch value={theme.mode} onChange={(mode: "auto" | "dark" | "light") => setTheme({ mode })} />
      </section>

      {/* Editor Typography */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="ui-section-label">Editor Typography</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Code font size</label>
          <input
            className="ui-range"
            type="range"
            min={10}
            max={18}
            step={0.5}
            value={editor.codeFontSize}
            onChange={(e) => setEditor({ codeFontSize: Number(e.target.value) })}
          />
          <span className="mono" style={{ fontSize: 12 }}>{editor.codeFontSize}px</span>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={editor.ligatures}
            onChange={(e) => setEditor({ ligatures: e.target.checked })}
          />
          <span>Font ligatures</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={editor.wrapCode}
            onChange={(e) => setEditor({ wrapCode: e.target.checked })}
          />
          <span>Wrap long lines in code blocks</span>
        </label>
      </section>
    </div>
  );
};
