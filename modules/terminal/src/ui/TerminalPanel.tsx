import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Eraser, Plus, RotateCw, Search, TerminalSquare, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { TerminalSearch } from "./TerminalSearch.tsx";
import {
  clearBuffer,
  closeTab,
  copySelection,
  ensureStarted,
  fitActive,
  focusTerminal,
  getSnapshot,
  getTerminal,
  mountEntry,
  newTerminal,
  pastePaths,
  pasteClipboard,
  refreshTheme,
  renameTab,
  resetFont,
  restartActive,
  selectAll,
  selectTab,
  subscribe,
  themeBackground,
  unmountEntry,
  zoomFont,
} from "./terminal-registry.ts";

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";
const SHIFT = isMac ? "⇧" : "Shift+";

interface MenuState {
  x: number;
  y: number;
}

export const TerminalPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const store = useSyncExternalStore(subscribe, getSnapshot);
  const { tabs, activeId, shells, ready, fontSize } = store;
  const viewportRef = useRef<HTMLDivElement>(null);
  const screensRef = useRef<HTMLDivElement>(null);
  const { theme } = host.hooks.useTheme();

  const [error, setError] = useState<string | null>(null);
  const [bg, setBg] = useState(themeBackground);
  const [findOpen, setFindOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [shellMenu, setShellMenu] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  // ---- startup: bind to the module host and adopt any shells that already exist
  useEffect(() => {
    ensureStarted(host).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [host]);

  // ---- theme: follow Hive's live CSS variables
  useEffect(() => {
    const refresh = () => setBg(refreshTheme());
    const timer = setTimeout(refresh, 60);
    const off = host.theme.subscribe(() => setTimeout(refresh, 60));
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [host, theme]);

  // ---- show only the active terminal, hide the rest
  const idsKey = tabs.map((t) => t.id).join("|");
  const idsRef = useRef<string[]>([]);
  idsRef.current = tabs.map((t) => t.id);
  useLayoutEffect(() => {
    const vp = screensRef.current;
    if (!vp) return;
    for (const id of idsRef.current) {
      if (id === activeId) mountEntry(id, vp);
      else unmountEntry(id);
    }
    focusTerminal(activeId);
  }, [idsKey, activeId, ready]);
  useEffect(
    () => () => {
      for (const id of idsRef.current) unmountEntry(id);
    },
    [],
  );

  // ---- keep the PTY size in sync with the panel size
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitActive);
    });
    ro.observe(vp);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ready]);

  // ---- Ctrl+wheel zooms the terminal font
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomFont(e.deltaY < 0 ? 1 : -1);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [ready]);

  // ---- find bar is opened by the key handler in the registry (Ctrl+Shift+F / Cmd+F)
  useEffect(() => {
    const open = () => setFindOpen(true);
    window.addEventListener("hive-terminal:find", open);
    return () => window.removeEventListener("hive-terminal:find", open);
  }, []);

  // ---- dismiss menus on any outside interaction
  useEffect(() => {
    if (!menu && !shellMenu) return;
    const close = () => {
      setMenu(null);
      setShellMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, shellMenu]);

  const active = tabs.find((t) => t.id === activeId) ?? null;

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);
      if (!activeId) return;
      const getPath = (window as unknown as { studio?: { getPathForFile?: (f: File) => string } }).studio?.getPathForFile;
      const paths = [...e.dataTransfer.files].map((f) => getPath?.(f) ?? "").filter(Boolean);
      if (paths.length) pastePaths(activeId, paths);
    },
    [activeId],
  );

  const hasSelection = !!(activeId && getTerminal(activeId)?.term.hasSelection());

  const menuItem = (label: string, run: () => void, opts: { key?: string; disabled?: boolean } = {}) => (
    <button
      type="button"
      className="hive-term-menu__item"
      disabled={opts.disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        setMenu(null);
        setShellMenu(false);
        run();
      }}
    >
      <span>{label}</span>
      {opts.key ? <span className="hive-term-menu__key">{opts.key}</span> : null}
    </button>
  );

  return (
    <div className="hive-term" style={{ "--term-bg": bg } as React.CSSProperties}>
      <div className="hive-term__bar">
        <div className="hive-term__tabs" role="tablist" aria-label="Terminals">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                className={`hive-term__tab${isActive ? " is-active" : ""}`}
                title={`${tab.title}\n${tab.shellLabel}${tab.exitCode !== null ? ` (exited ${tab.exitCode})` : ""}`}
                onClick={() => selectTab(tab.id)}
                onDoubleClick={() => setRenamingId(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selectTab(tab.id);
                  else if (e.key === "F2") setRenamingId(tab.id);
                }}
              >
                {tab.exitCode !== null ? <span className="hive-term__tab-dead" aria-label="exited" /> : null}
                {renamingId === tab.id ? (
                  <input
                    autoFocus
                    className="hive-term__rename"
                    defaultValue={tab.title}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => setRenamingId(null)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        renameTab(tab.id, e.currentTarget.value);
                        setRenamingId(null);
                        focusTerminal(tab.id);
                      } else if (e.key === "Escape") {
                        setRenamingId(null);
                        focusTerminal(tab.id);
                      }
                    }}
                  />
                ) : (
                  <span className="hive-term__tab-title">{tab.title}</span>
                )}
                <button
                  type="button"
                  className="hive-term__tab-close"
                  title="Close terminal"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="hive-term__actions">
          <button type="button" className="hive-term-btn" title={`New terminal (${MOD}${SHIFT}\`)`} onClick={() => void newTerminal()}>
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="hive-term-btn hive-term-btn--narrow"
            title="Choose shell"
            aria-haspopup="menu"
            aria-expanded={shellMenu}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShellMenu((v) => !v)}
          >
            <ChevronDown size={12} />
          </button>
          {shellMenu ? (
            <div className="hive-term-menu hive-term-menu--dropdown" role="menu" onPointerDown={(e) => e.stopPropagation()}>
              {shells.map((s) => (
                <div key={s.id}>{menuItem(s.label, () => void newTerminal({ shellId: s.id }), { key: s.isDefault ? "default" : undefined })}</div>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className={`hive-term-btn${findOpen ? " is-on" : ""}`}
            title={`Find (${isMac ? "⌘F" : `${MOD}${SHIFT}F`})`}
            disabled={!active}
            onClick={() => setFindOpen((v) => !v)}
          >
            <Search size={13} />
          </button>
          <button type="button" className="hive-term-btn" title="Clear" disabled={!active} onClick={() => activeId && clearBuffer(activeId)}>
            <Eraser size={13} />
          </button>
          <button type="button" className="hive-term-btn" title="Restart shell" disabled={!active} onClick={() => void restartActive()}>
            <RotateCw size={13} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`hive-term__viewport${dropping ? " is-drop" : ""}`}
        onClick={() => focusTerminal(activeId)}
        onContextMenu={(e) => {
          if (!active) return;
          e.preventDefault();
          setMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 260) });
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <div ref={screensRef} className="hive-term__screens" />
        {findOpen && activeId ? <TerminalSearch key={activeId} terminalId={activeId} onClose={() => setFindOpen(false)} /> : null}
        {error ? (
          <div className="hive-term__empty">
            <TerminalSquare size={24} />
            <span>Terminal failed to start: {error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                ensureStarted(host).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
              }}
            >
              Retry
            </button>
          </div>
        ) : ready && tabs.length === 0 ? (
          <div className="hive-term__empty">
            <TerminalSquare size={24} />
            <span>No open terminals</span>
            <button type="button" onClick={() => void newTerminal()}>
              New terminal
            </button>
          </div>
        ) : null}
      </div>

      {menu ? (
        <div className="hive-term-menu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {menuItem("Copy", () => activeId && copySelection(activeId), { key: `${MOD}${isMac ? "C" : `${SHIFT}C`}`, disabled: !hasSelection })}
          {menuItem("Paste", () => activeId && void pasteClipboard(activeId), { key: `${MOD}${isMac ? "V" : `${SHIFT}V`}` })}
          {menuItem("Select all", () => activeId && selectAll(activeId))}
          <div className="hive-term-menu__sep" />
          {menuItem("Find…", () => setFindOpen(true), { key: isMac ? "⌘F" : `${MOD}${SHIFT}F` })}
          {menuItem("Clear", () => activeId && clearBuffer(activeId))}
          <div className="hive-term-menu__sep" />
          {menuItem("Increase font size", () => zoomFont(1), { key: `${fontSize}px` })}
          {menuItem("Decrease font size", () => zoomFont(-1))}
          {menuItem("Reset font size", () => resetFont())}
        </div>
      ) : null}
    </div>
  );
};
