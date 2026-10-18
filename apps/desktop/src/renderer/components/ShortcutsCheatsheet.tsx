import React, { useEffect, useRef } from "react";
import { X, Keyboard } from "lucide-react";
import { useUi } from "../store/ui-store.ts";

interface ShortcutItem {
  keys: string[];
  desc: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Navigation & Tabs",
    items: [
      { keys: ["Ctrl", "K"], desc: "Search everything" },
      { keys: ["Ctrl", "Shift", "P"], desc: "Command palette" },
      { keys: ["Ctrl", "Tab"], desc: "Next tab" },
      { keys: ["Ctrl", "Alt", "Tab"], desc: "Previous tab" },
      { keys: ["Ctrl", "W"], desc: "Close active tab" },
      { keys: ["Ctrl", "O"], desc: "Open project folder" },
    ],
  },
  {
    title: "Panels",
    items: [
      { keys: ["Ctrl", "B"], desc: "Toggle sessions panel" },
      { keys: ["Ctrl", "Shift", "E"], desc: "Toggle files panel" },
      { keys: ["Ctrl", "Shift", "G"], desc: "Toggle Git panel" },
      { keys: ["Ctrl", "`"], desc: "Toggle terminal panel" },
      { keys: ["Ctrl", "Shift", "B"], desc: "Toggle browser panel" },
    ],
  },
  {
    title: "Composer & Agent",
    items: [
      { keys: ["Ctrl", "Enter"], desc: "Send prompt" },
      { keys: ["Ctrl", "Shift", "M"], desc: "Cycle agent mode" },
      { keys: ["Ctrl", "Shift", "T"], desc: "Cycle thinking level" },
      { keys: ["Ctrl", "Shift", "R"], desc: "Reload Pi extensions & MCP" },
    ],
  },
  {
    title: "App & Window",
    items: [
      { keys: ["?"], desc: "Keyboard shortcuts cheatsheet" },
      { keys: ["Ctrl", ","], desc: "Open settings" },
      { keys: ["Ctrl", "+"], desc: "Zoom in" },
      { keys: ["Ctrl", "-"], desc: "Zoom out" },
      { keys: ["Ctrl", "0"], desc: "Reset zoom" },
    ],
  },
];

export const ShortcutsCheatsheet: React.FC = () => {
  const open = useUi((s) => s.shortcutsOpen);
  const close = useUi((s) => s.closeShortcuts);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="shortcuts-modal__backdrop" onClick={close}>
      <div
        ref={cardRef}
        className="shortcuts-modal__dialog"
        role="dialog"
        aria-label="Keyboard Shortcuts"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal__header">
          <div className="shortcuts-modal__title">
            <Keyboard size={16} />
            <span>Keyboard Shortcuts</span>
          </div>
          <button
            type="button"
            className="shortcuts-modal__close"
            onClick={close}
            aria-label="Close cheatsheet"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <div className="shortcuts-modal__grid ui-scroll">
          {SECTIONS.map((sec) => (
            <div key={sec.title} className="shortcuts-modal__section">
              <div className="shortcuts-modal__section-title">{sec.title}</div>
              <div className="shortcuts-modal__list">
                {sec.items.map((it) => (
                  <div key={it.desc} className="shortcuts-modal__row">
                    <span className="shortcuts-modal__desc">{it.desc}</span>
                    <div className="shortcuts-modal__keys">
                      {it.keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className="shortcuts-modal__plus">+</span>}
                          <kbd className="shortcuts-modal__kbd">{k}</kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-modal__footer">
          <span>Press <kbd className="shortcuts-modal__kbd">Esc</kbd> to close</span>
          <span style={{ color: "var(--text-muted)" }}>Customize keys in Settings › Keyboard</span>
        </div>
      </div>
    </div>
  );
};
