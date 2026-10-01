import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, Plus, X, Trash2, RotateCw, TerminalSquare } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";

interface TerminalTab {
  id: string;
  title: string;
  shell: string;
}

const TERMINAL_FONT = `"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Mono", Consolas, monospace`;

export const TerminalPanel: React.FC = () => {
  const { activeProject } = useSessionStore(useShallow((s) => ({ activeProject: s.activeProject })));
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // References to keep xterm and fit addon instances alive per tab
  const terminalsRef = useRef<Map<string, { term: Terminal; fitAddon: FitAddon; container: HTMLDivElement }>>(
    new Map(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Create a new terminal session
  const createNewTab = useCallback(async () => {
    try {
      const cwd = activeProject?.path;
      const session = await window.studio.terminalCreate({ cwd });
      const shellName = session.shell.split(/[/\\]/).pop() || session.shell;
      const tabTitle = `${shellName} (${session.id.split("_")[1] || "1"})`;

      const newTab: TerminalTab = {
        id: session.id,
        title: tabTitle,
        shell: session.shell,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(session.id);
    } catch (err) {
      console.error("[TerminalPanel] Failed to create terminal session:", err);
    }
  }, [activeProject?.path]);

  // Initial tab creation if none exists
  useEffect(() => {
    if (tabs.length === 0) {
      void createNewTab();
    }
  }, [tabs.length, createNewTab]);

  // Setup listener for incoming terminal stream data
  useEffect(() => {
    const unsubData = window.studio.onTerminalData(({ id, data }) => {
      const entry = terminalsRef.current.get(id);
      if (entry) {
        entry.term.write(data);
      }
    });

    const unsubExit = window.studio.onTerminalExit(({ id }) => {
      const entry = terminalsRef.current.get(id);
      if (entry) {
        entry.term.write("\r\n\x1b[33m[Process completed]\x1b[0m\r\n");
      }
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, []);

  // Mount an xterm instance into a DOM node for a given tab
  const mountTerminal = useCallback((tabId: string, node: HTMLDivElement | null) => {
    if (!node) return;

    if (terminalsRef.current.has(tabId)) {
      const existing = terminalsRef.current.get(tabId)!;
      if (existing.container !== node) {
        node.innerHTML = "";
        existing.term.open(node);
        existing.container = node;
        try {
          existing.fitAddon.fit();
        } catch (e) {
          // fit error on invisible
        }
      }
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      // xterm measures glyphs on a canvas, so it needs real family names (CSS vars don't resolve).
      fontSize: 12.5,
      fontFamily: TERMINAL_FONT,
      theme: {
        background: "#1e1f22",
        foreground: "#bdbdbd",
        cursor: "#6c95eb",
        selectionBackground: "rgba(56, 189, 248, 0.25)",
        black: "#1e293b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#38bdf8",
        white: "#f8fafc",
      },
      lineHeight: 1.25,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    node.innerHTML = "";
    term.open(node);

    try {
      fitAddon.fit();
      void window.studio.terminalResize(tabId, term.cols, term.rows);
    } catch (e) {
      // fit error
    }
    // Re-measure once the bundled web font is ready (first open may race the font load).
    void document.fonts.load(`12px "JetBrains Mono Variable"`).then(() => {
      term.options.fontFamily = TERMINAL_FONT;
      try {
        fitAddon.fit();
      } catch {
        // detached
      }
    });

    term.onData((data) => {
      void window.studio.terminalWrite(tabId, data);
    });

    terminalsRef.current.set(tabId, { term, fitAddon, container: node });
  }, []);

  // Close a terminal tab
  const closeTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    void window.studio.terminalKill(tabId);

    const entry = terminalsRef.current.get(tabId);
    if (entry) {
      entry.term.dispose();
      terminalsRef.current.delete(tabId);
    }

    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      if (filtered.length > 0) {
        setActiveTabId((curr) => (curr === tabId ? filtered[filtered.length - 1]!.id : curr));
      } else {
        setActiveTabId(null);
      }
      return filtered;
    });
  }, []);

  // Resize handling when drawer width changes or active tab changes
  useEffect(() => {
    if (!activeTabId) return;
    const entry = terminalsRef.current.get(activeTabId);
    if (!entry) return;

    const timer = setTimeout(() => {
      try {
        entry.fitAddon.fit();
        void window.studio.terminalResize(activeTabId, entry.term.cols, entry.term.rows);
        entry.term.focus();
      } catch (e) {
        // ignore
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activeTabId]);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      if (!activeTabId) return;
      const entry = terminalsRef.current.get(activeTabId);
      if (entry) {
        try {
          entry.fitAddon.fit();
          void window.studio.terminalResize(activeTabId, entry.term.cols, entry.term.rows);
        } catch (e) {
          // ignore
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [activeTabId]);

  const sendCommand = (cmd: string) => {
    if (!activeTabId) return;
    void window.studio.terminalWrite(activeTabId, cmd + "\r");
  };

  const clearTerminal = () => {
    if (!activeTabId) return;
    const entry = terminalsRef.current.get(activeTabId);
    if (entry) {
      entry.term.clear();
      // On Windows PowerShell/cmd or bash send Ctrl+L
      void window.studio.terminalWrite(activeTabId, "\x0c");
    }
  };

  const restartTerminal = async () => {
    if (!activeTabId) return;
    const currentId = activeTabId;
    closeTab(currentId);
    await createNewTab();
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0c0d10",
        color: "var(--text-primary)",
        overflow: "hidden",
      }}
    >
      {/* Terminal Top Tab Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "4px 8px 0 8px",
          gap: 4,
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 6, color: "var(--accent-base)" }}>
          <TerminalIcon size={14} />
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Terminal
          </span>
        </div>

        {/* Tab Items */}
        <div style={{ display: "flex", gap: 3, flex: 1, overflowX: "auto" }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: "6px 6px 0 0",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  background: isActive ? "#0c0d10" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  borderTop: isActive ? "2px solid var(--accent-base)" : "2px solid transparent",
                  borderLeft: isActive ? "1px solid var(--border-subtle)" : "1px solid transparent",
                  borderRight: isActive ? "1px solid var(--border-subtle)" : "1px solid transparent",
                  transition: "all 0.15s ease",
                  userSelect: "none",
                }}
              >
                <span>{tab.title}</span>
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  title="Close tab"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* New Tab Button */}
        <button
          onClick={createNewTab}
          title="New Terminal"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--fg-rgb), 0.06)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <Plus size={14} />
        </button>

        {/* Clear Buffer */}
        <button
          onClick={clearTerminal}
          title="Clear Terminal"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--fg-rgb), 0.06)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <Trash2 size={13} />
        </button>

        {/* Restart Session */}
        <button
          onClick={restartTerminal}
          title="Restart Session"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--fg-rgb), 0.06)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <RotateCw size={13} />
        </button>
      </div>

      {/* Quick Commands Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          background: "rgba(var(--fg-rgb), 0.02)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Quick:
        </span>
        <button
          onClick={() => sendCommand("pi")}
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            background: "rgba(56, 189, 248, 0.1)",
            color: "var(--accent-hover)",
            border: "1px solid rgba(56, 189, 248, 0.2)",
            borderRadius: 4,
            padding: "2px 6px",
            cursor: "pointer",
          }}
        >
          pi
        </button>
        <button
          onClick={() => sendCommand("git status")}
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            background: "rgba(var(--fg-rgb), 0.04)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            padding: "2px 6px",
            cursor: "pointer",
          }}
        >
          git status
        </button>
        <button
          onClick={() => sendCommand("npm test")}
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            background: "rgba(var(--fg-rgb), 0.04)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            padding: "2px 6px",
            cursor: "pointer",
          }}
        >
          npm test
        </button>
      </div>

      {/* Terminal Viewports Container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          padding: "4px 6px",
        }}
      >
        {tabs.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            <TerminalSquare size={24} />
            <span>No active terminal</span>
            <button
              onClick={createNewTab}
              style={{
                marginTop: 4,
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: "var(--accent-base)",
                color: "var(--accent-contrast)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Start Terminal
            </button>
          </div>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                ref={(node) => mountTerminal(tab.id, node)}
                style={{
                  width: "100%",
                  height: "100%",
                  display: isActive ? "block" : "none",
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
