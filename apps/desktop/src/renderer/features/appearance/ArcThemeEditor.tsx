/**
 * Appearance settings: an Arc-browser-like theme editor with a live window preview, plus editor typography.
 */
import React, { useMemo } from "react";
import { Dices, Minus, Monitor, Moon, Plus, RotateCcw, Sun } from "lucide-react";
import {
  ARC_PRESETS,
  MAX_ARC_COLORS,
  arcDotColor,
  arcFrameColor,
  arcFrameGradient,
  buildArcTokens,
  resolveMode,
  type ArcColor,
  type ArcMode,
  type ArcTheme,
} from "@hive/theme-engine";
import { useAppearance } from "./appearance-store.ts";
import { ArcColorPad } from "./ArcColorPad.tsx";
import { CodeBlock } from "../../components/code/CodeBlock.tsx";

const SAMPLE_CODE = `// Hive · Rider-style highlighting
export class SessionPool<T extends Session> {
  private readonly items = new Map<string, T>();

  async acquire(key: string, timeoutMs = 5_000): Promise<T> {
    const hit = this.items.get(key);
    if (hit?.isAlive) return hit; // fast path
    throw new Error(\`no session for \${key}\`);
  }
}`;

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

function harmonious(primary: ArcColor, count: number): ArcColor[] {
  const out = [primary];
  for (let i = 1; i < count; i++) out.push({ hue: (primary.hue + i * (count === 2 ? 45 : 60)) % 360, sat: Math.max(0.3, primary.sat * 0.9) });
  return out;
}

export const ArcThemeEditor: React.FC = () => {
  const theme = useAppearance((s) => s.theme);
  const editor = useAppearance((s) => s.editor);
  const setTheme = useAppearance((s) => s.setTheme);
  const replaceTheme = useAppearance((s) => s.replaceTheme);
  const setEditor = useAppearance((s) => s.setEditor);
  const reset = useAppearance((s) => s.reset);

  const dark = resolveMode(theme.mode, systemDark()) === "dark";
  const primary = theme.colors[0]!;

  const intensityTrack = useMemo(
    () => `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((i) => arcFrameColor(primary, dark, i)).join(", ")})`,
    [primary, dark],
  );

  const addColor = () => {
    if (theme.colors.length >= MAX_ARC_COLORS) return;
    const last = theme.colors[theme.colors.length - 1]!;
    setTheme({ colors: [...theme.colors, { hue: (last.hue + 55) % 360, sat: Math.max(0.35, last.sat) }] });
  };
  const removeColor = () => {
    if (theme.colors.length <= 1) return;
    setTheme({ colors: theme.colors.slice(0, -1) });
  };
  const shuffle = () => {
    const count = 1 + Math.floor(Math.random() * MAX_ARC_COLORS);
    setTheme({ colors: harmonious({ hue: Math.random() * 360, sat: 0.35 + Math.random() * 0.6 }, count), intensity: 0.35 + Math.random() * 0.5 });
  };

  return (
    <div className="appearance">
      <div className="appearance__top">
        <ThemePreview theme={theme} />
        <div className="appearance__pad-col">
          <ArcColorPad colors={theme.colors} onChange={(colors) => setTheme({ colors })} />
          <div className="appearance__pad-tools">
            <div className="appearance__dots">
              {theme.colors.map((c, i) => (
                <span key={i} className="appearance__dot" style={{ background: arcDotColor(c) }} />
              ))}
              <button className="ui-btn ui-btn--sm ui-btn--icon" onClick={removeColor} disabled={theme.colors.length <= 1} title="Remove colour">
                <Minus size={12} />
              </button>
              <button className="ui-btn ui-btn--sm ui-btn--icon" onClick={addColor} disabled={theme.colors.length >= MAX_ARC_COLORS} title="Add colour">
                <Plus size={12} />
              </button>
            </div>
            <button className="ui-btn ui-btn--sm ui-btn--ghost" onClick={shuffle} title="Random palette">
              <Dices size={13} /> Shuffle
            </button>
          </div>
        </div>
      </div>

      <div className="appearance__controls">
        <div className="appearance__control">
          <span className="ui-section-label">Mode</span>
          <ModeSwitch value={theme.mode} onChange={(mode) => setTheme({ mode })} />
        </div>
        <div className="appearance__control appearance__control--grow">
          <div className="appearance__control-head">
            <span className="ui-section-label">Intensity</span>
            <span className="appearance__value">{Math.round(theme.intensity * 100)}%</span>
          </div>
          <input
            className="ui-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={theme.intensity}
            onChange={(e) => setTheme({ intensity: Number(e.target.value) })}
            style={{ ["--track" as string]: intensityTrack }}
            aria-label="Theme intensity"
          />
        </div>
        <div className="appearance__control appearance__control--grow">
          <div className="appearance__control-head">
            <span className="ui-section-label">Grain</span>
            <span className="appearance__value">{Math.round(theme.grain * 100)}%</span>
          </div>
          <input
            className="ui-range ui-range--grain"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={theme.grain}
            onChange={(e) => setTheme({ grain: Number(e.target.value) })}
            aria-label="Grain amount"
          />
        </div>
      </div>

      <div className="appearance__section">
        <div className="appearance__section-head">
          <span className="ui-section-label">Presets</span>
          <button className="ui-btn ui-btn--sm ui-btn--ghost" onClick={reset} title="Reset appearance to defaults">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
        <div className="appearance__presets">
          {ARC_PRESETS.map((p) => {
            const pDark = resolveMode(p.theme.mode, systemDark()) === "dark";
            const selected = JSON.stringify(p.theme) === JSON.stringify(theme);
            return (
              <button key={p.id} className={`appearance__preset${selected ? " is-selected" : ""}`} onClick={() => replaceTheme(p.theme)} title={p.name}>
                <span className="appearance__preset-swatch grain-overlay-bg" style={{ background: arcFrameGradient(p.theme, pDark) }} />
                <span className="appearance__preset-name">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="appearance__section">
        <span className="ui-section-label">Code</span>
        <div className="ui-card appearance__editor">
          <div className="ui-row">
            <div>
              <div className="ui-row__title">Font size</div>
              <div className="ui-row__hint">Code blocks, file viewer, diffs and terminal</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: 200 }}>
              <input
                className="ui-range"
                type="range"
                min={10}
                max={18}
                step={0.5}
                value={editor.codeFontSize}
                onChange={(e) => setEditor({ codeFontSize: Number(e.target.value) })}
                aria-label="Code font size"
              />
              <span className="appearance__value" style={{ width: 36, textAlign: "right" }}>{editor.codeFontSize}px</span>
            </div>
          </div>
          <ToggleRow title="Font ligatures" hint="Render => != === as JetBrains Mono ligatures" checked={editor.ligatures} onChange={(ligatures) => setEditor({ ligatures })} />
          <ToggleRow title="Wrap long lines" hint="Soft-wrap code blocks in the conversation" checked={editor.wrapCode} onChange={(wrapCode) => setEditor({ wrapCode })} />
        </div>
        <CodeBlock code={SAMPLE_CODE} language="typescript" />
      </div>
    </div>
  );
};

const ModeSwitch: React.FC<{ value: ArcMode; onChange(m: ArcMode): void }> = ({ value, onChange }) => (
  <div className="ui-seg" role="group" aria-label="Colour mode">
    {(
      [
        ["light", <Sun size={13} key="s" />, "Light"],
        ["dark", <Moon size={13} key="m" />, "Dark"],
        ["auto", <Monitor size={13} key="a" />, "Auto"],
      ] as const
    ).map(([m, icon, label]) => (
      <button key={m} aria-pressed={value === m} onClick={() => onChange(m)}>
        {icon}
        {label}
      </button>
    ))}
  </div>
);

const ToggleRow: React.FC<{ title: string; hint: string; checked: boolean; onChange(v: boolean): void }> = ({ title, hint, checked, onChange }) => (
  <div className="ui-row">
    <div>
      <div className="ui-row__title">{title}</div>
      <div className="ui-row__hint">{hint}</div>
    </div>
    <button className="ui-switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} aria-label={title} />
  </div>
);

/** Miniature of the real window rendered with the theme's own tokens (scoped CSS vars). */
const ThemePreview: React.FC<{ theme: ArcTheme }> = ({ theme }) => {
  const { vars } = useMemo(() => buildArcTokens(theme, systemDark()), [theme]);
  return (
    <div className="arc-preview" style={vars as React.CSSProperties}>
      <div className="arc-preview__frame">
        <div className="arc-preview__grain grain-overlay-bg" />
        <div className="arc-preview__lights">
          <i style={{ background: "#ff5f57" }} />
          <i style={{ background: "#febc2e" }} />
          <i style={{ background: "#28c840" }} />
        </div>
        <div className="arc-preview__sidebar">
          <div className="arc-preview__pill arc-preview__pill--active" />
          <div className="arc-preview__pill" />
          <div className="arc-preview__pill" style={{ width: "62%" }} />
          <div className="arc-preview__pill" style={{ width: "74%" }} />
          <div className="arc-preview__sep" />
          <div className="arc-preview__pill" style={{ width: "54%" }} />
          <div className="arc-preview__pill" style={{ width: "68%" }} />
        </div>
        <div className="arc-preview__content">
          <div className="arc-preview__line" style={{ width: "42%", height: 7, background: "var(--text-primary)", opacity: 0.85 }} />
          <div className="arc-preview__line" style={{ width: "86%" }} />
          <div className="arc-preview__line" style={{ width: "78%" }} />
          <div className="arc-preview__code">
            <span style={{ background: "#6C95EB", width: "18%" }} />
            <span style={{ background: "#C191FF", width: "26%" }} />
            <span style={{ background: "#39CC9B", width: "20%" }} />
            <span style={{ background: "#C9A26D", width: "30%" }} />
          </div>
          <div className="arc-preview__line" style={{ width: "64%" }} />
          <div className="arc-preview__composer">
            <span className="arc-preview__send" />
          </div>
        </div>
      </div>
    </div>
  );
};
