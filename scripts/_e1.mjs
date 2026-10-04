import fs from "node:fs";

function edit(file, fn) {
  let s = fs.readFileSync(file, "utf8");
  const crlf = s.includes("\r\n");
  if (crlf) s = s.replace(/\r\n/g, "\n");
  const rep = (a, b) => {
    if (!s.includes(a)) throw new Error(`${file}: anchor not found: ${a.slice(0, 80)}`);
    s = s.replace(a, b);
  };
  fn(rep, () => s, (v) => { s = v; });
  if (crlf) s = s.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, s);
}

const D = "apps/desktop/src";

// 1. Move ArcThemeEditor.tsx, ArcColorPad.tsx, appearance.css to modules/theme-studio/src/ui/
fs.mkdirSync("modules/theme-studio/src/ui", { recursive: true });
fs.renameSync(`${D}/renderer/features/appearance/ArcThemeEditor.tsx`, "modules/theme-studio/src/ui/ArcThemeEditor.tsx");
fs.renameSync(`${D}/renderer/features/appearance/ArcColorPad.tsx`, "modules/theme-studio/src/ui/ArcColorPad.tsx");
fs.renameSync(`${D}/renderer/features/appearance/appearance.css`, "modules/theme-studio/src/ui/appearance.css");

// 2. Extend SDK hooks with useTheme
edit("packages/module-sdk/src/renderer.ts", (rep) => {
  rep('    useActiveSession(): ActiveSessionContext;',
`    useActiveSession(): ActiveSessionContext;
    /** Current Arc theme & editor preferences with reactive setters. */
    useTheme(): {
      theme: any;
      editor: { codeFontSize: number; ligatures: boolean; wrapCode: boolean };
      setTheme(patch: any): void;
      replaceTheme(theme: any): void;
      setEditor(patch: any): void;
      reset(): void;
    };`);
});

// 3. Extend host.tsx with useTheme
edit(`${D}/renderer/modules/host.tsx`, (rep) => {
  rep('import { useAppearance } from "../features/appearance/appearance-store.ts";',
      'import { useAppearance } from "../features/appearance/appearance-store.ts";');
  rep('function useActiveSession(): ActiveSessionContext {',
`function useTheme() {
  const theme = useAppearance((s) => s.theme);
  const editor = useAppearance((s) => s.editor);
  const setTheme = useAppearance((s) => s.setTheme);
  const replaceTheme = useAppearance((s) => s.replaceTheme);
  const setEditor = useAppearance((s) => s.setEditor);
  const reset = useAppearance((s) => s.reset);
  return { theme, editor, setTheme, replaceTheme, setEditor, reset };
}

function useActiveSession(): ActiveSessionContext {`);
  rep('hooks: { useSessionCatalog, useFeatureModel, useActiveSession },',
      'hooks: { useSessionCatalog, useFeatureModel, useActiveSession, useTheme },');
});

// 4. Create AppearanceSettingsContent in core
fs.writeFileSync(`${D}/renderer/components/AppearanceSettingsContent.tsx`, `import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAppearance } from "../features/appearance/appearance-store.ts";
import { Slot } from "../modules/ModuleViews.tsx";

const ModeSwitch: React.FC<{ value: "auto" | "dark" | "light"; onChange: (mode: "auto" | "dark" | "light") => void }> = ({ value, onChange }) => (
  <div className="ui-seg" role="radiogroup" aria-label="Theme mode">
    <button className={\`ui-seg__btn\${value === "dark" ? " is-active" : ""}\`} onClick={() => onChange("dark")}>
      <Moon size={13} /> Dark
    </button>
    <button className={\`ui-seg__btn\${value === "light" ? " is-active" : ""}\`} onClick={() => onChange("light")}>
      <Sun size={13} /> Light
    </button>
    <button className={\`ui-seg__btn\${value === "auto" ? " is-active" : ""}\`} onClick={() => onChange("auto")}>
      <Monitor size={13} /> Auto
    </button>
  </div>
);

export const AppearanceSettingsContent: React.FC = () => {
  const theme = useAppearance((s) => s.theme);
  const editor = useAppearance((s) => s.editor);
  const setTheme = useAppearance((s) => s.setTheme);
  const setEditor = useAppearance((s) => s.setEditor);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Module extension point for full theme studio */}
      <Slot name="settings.appearance" />

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
`);

// 5. Update SettingsModal.tsx
edit(`${D}/renderer/components/SettingsModal.tsx`, (rep) => {
  rep('import { ArcThemeEditor } from "../features/appearance/ArcThemeEditor.tsx";',
      'import { AppearanceSettingsContent } from "./AppearanceSettingsContent.tsx";');
  rep('{tab === "appearance" && <ArcThemeEditor />}',
      '{tab === "appearance" && <AppearanceSettingsContent />}');
});

// 6. Update main.tsx
edit(`${D}/renderer/main.tsx`, (rep) => {
  rep('import "./features/appearance/appearance.css";\n', "");
});

// 7. Adjust modules/theme-studio/src/ui/ArcThemeEditor.tsx
edit("modules/theme-studio/src/ui/ArcThemeEditor.tsx", (rep, get, set) => {
  rep('import { useAppearance } from "./appearance-store.ts";\nimport { ArcColorPad } from "./ArcColorPad.tsx";\nimport { CodeBlock } from "../../components/code/CodeBlock.tsx";',
`import type { ModuleHost } from "@hive/module-sdk/renderer";
import { ArcColorPad } from "./ArcColorPad.tsx";
import "./appearance.css";`);

  rep('export const ArcThemeEditor: React.FC = () => {\n  const theme = useAppearance((s) => s.theme);\n  const editor = useAppearance((s) => s.editor);\n  const setTheme = useAppearance((s) => s.setTheme);\n  const replaceTheme = useAppearance((s) => s.replaceTheme);\n  const setEditor = useAppearance((s) => s.setEditor);\n  const reset = useAppearance((s) => s.reset);',
`export const ArcThemeEditor: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const { theme, editor, setTheme, replaceTheme, setEditor, reset } = host.hooks.useTheme();
  const CodeBlock = host.ui.CodeBlock;`);
});

// 8. modules/theme-studio package.json
fs.writeFileSync("modules/theme-studio/package.json", JSON.stringify({
  name: "@hive-module/theme-studio",
  version: "0.1.0",
  private: true,
  type: "module",
  description: "Hive module: Arc Theme Studio (interactive color pad, grain texture, gradient styling, custom color presets)",
  exports: {
    "./renderer": "./src/renderer.tsx",
    "./shared": "./src/shared.ts"
  },
  hive: {
    id: "theme-studio",
    title: "Arc Theme Studio",
    description: "Interactive color pad, grain texture, gradient styling, custom color presets, and real-time palette tuner.",
    tier: "bonus",
    icon: "palette",
    category: "Appearance",
    contributes: {
      settings: [
        {
          id: "theme-studio",
          label: "Theme Studio"
        }
      ]
    }
  },
  dependencies: {
    "@hive/module-sdk": "0.1.0",
    "@hive/theme-engine": "0.1.0",
    "lucide-react": "^1.49.0",
    "react": "^19.0.0"
  }
}, null, 2) + "\n");

// 9. modules/theme-studio/src/shared.ts
fs.writeFileSync("modules/theme-studio/src/shared.ts", `export const MODULE_ID = "theme-studio";
`);

// 10. modules/theme-studio/src/renderer.tsx
fs.writeFileSync("modules/theme-studio/src/renderer.tsx", `import React, { lazy } from "react";
import { Palette } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID } from "./shared.ts";

const ArcThemeEditor = lazy(() => import("./ui/ArcThemeEditor.tsx").then((m) => ({ default: m.ArcThemeEditor })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    slots: {
      "settings.appearance": [ArcThemeEditor],
    },
    settings: [
      {
        id: "theme-studio",
        label: "Theme Studio",
        icon: ({ size }) => <Palette size={size} />,
        component: ArcThemeEditor,
      },
    ],
  },
});
`);

console.log("theme-studio extracted ok");
