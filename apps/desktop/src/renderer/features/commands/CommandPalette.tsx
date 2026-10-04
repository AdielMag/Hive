import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileCode,
  FolderKanban,
  MessageSquare,
  Search,
  Zap,
} from "lucide-react";
import { usePalette } from "./palette-store.ts";
import { COMMANDS, COMMANDS_BY_ID, useCommandsVersion } from "./registry.ts";
import { getShortcutLabel } from "./useShortcut.ts";
import { fuzzyMatch } from "./fuzzy.ts";
import { useSessionStore } from "../../store/session-store.ts";
import "./command-palette.css";

interface FlatFile {
  name: string;
  relativePath: string;
  path: string;
}

interface PaletteItem {
  id: string;
  section: "Actions" | "Sessions" | "Projects" | "Tabs" | "Files";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category?: string;
  ranges: Array<[number, number]>;
  score: number;
  run: () => void | Promise<void>;
}

const Highlighted: React.FC<{ text: string; ranges: Array<[number, number]> }> = ({ text, ranges }) => {
  if (!ranges || ranges.length === 0) return <span>{text}</span>;
  const elements: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i]!;
    if (start > cursor) {
      elements.push(<span key={`text-${i}`}>{text.slice(cursor, start)}</span>);
    }
    elements.push(
      <mark key={`mark-${i}`} className="pal__highlight">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    elements.push(<span key="tail">{text.slice(cursor)}</span>);
  }
  return <span>{elements}</span>;
};

export const CommandPalette: React.FC = () => {
  const commandsVersion = useCommandsVersion((s) => s.version);
  const { open, query, close, setQuery, pushRecent, recents } = usePalette();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [files, setFiles] = useState<FlatFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { activeProject, projects, allSessions, tabs, activeTabId, openSessionTab, switchTab } =
    useSessionStore();

  // Load project files in background for quick file jump
  useEffect(() => {
    if (!activeProject?.path) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    window.studio
      .listFiles(activeProject.path)
      .then((tree: any[]) => {
        if (cancelled) return;
        const flat: FlatFile[] = [];
        const walk = (nodes: any[]) => {
          for (const n of nodes) {
            if (n.isDirectory && n.children) walk(n.children);
            else if (!n.isDirectory) {
              flat.push({ name: n.name, relativePath: n.relativePath || n.name, path: n.path });
            }
          }
        };
        walk(tree || []);
        setFiles(flat);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeProject?.path]);

  // Focus and select input on open
  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  // Determine active mode from query prefix
  const cleanQuery = query.trim();
  const isActionsMode = cleanQuery.startsWith(">");
  const isSessionsMode = cleanQuery.startsWith("@");
  const isFilesMode = cleanQuery.startsWith("/");
  const actualSearch = isActionsMode || isSessionsMode || isFilesMode ? cleanQuery.slice(1).trim() : cleanQuery;

  // Filter items
  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return [];
    const list: PaletteItem[] = [];

    // 1. Actions
    if (!isSessionsMode && !isFilesMode) {
      for (const cmd of COMMANDS) {
        if (cmd.when && !cmd.when()) continue;
        const match = fuzzyMatch(actualSearch, `${cmd.title} ${cmd.keywords ?? ""}`);
        if (!match) continue;

        // Boost recently run commands if query is empty or short
        const isRecent = recents.includes(cmd.id);
        const score = match.score + (isRecent ? 15 : 0);

        list.push({
          id: `cmd:${cmd.id}`,
          section: "Actions",
          title: cmd.title,
          category: cmd.category,
          icon: <Zap size={14} />,
          shortcut: getShortcutLabel(cmd.id),
          ranges: match.ranges,
          score,
          run: () => {
            pushRecent(cmd.id);
            close();
            void cmd.run();
          },
        });
      }
    }

    // 2. Open Tabs (except current)
    if (!isActionsMode && !isFilesMode && tabs.length > 1) {
      for (const t of tabs) {
        if (t.id === activeTabId) continue;
        const match = fuzzyMatch(actualSearch, t.title);
        if (!match) continue;
        list.push({
          id: `tab:${t.id}`,
          section: "Tabs",
          title: t.title,
          subtitle: `Open in tab`,
          icon: <MessageSquare size={14} />,
          ranges: match.ranges,
          score: match.score + 10,
          run: () => {
            close();
            void switchTab(t.id);
          },
        });
      }
    }

    // 3. Sessions
    if (!isActionsMode && !isFilesMode) {
      for (const s of allSessions) {
        if (s.archived) continue;
        const name = s.title || s.name || s.firstMessage || "Untitled Session";
        const proj = projects.find((p) => p.id === s.projectId);
        const match = fuzzyMatch(actualSearch, `${name} ${proj?.name ?? ""}`);
        if (!match) continue;

        list.push({
          id: `session:${s.path}`,
          section: "Sessions",
          title: name,
          subtitle: proj ? `${proj.name} · ${s.messageCount} messages` : `${s.messageCount} messages`,
          icon: <MessageSquare size={14} />,
          ranges: match.ranges,
          score: match.score,
          run: () => {
            close();
            void openSessionTab(s.path, s.projectId ?? (activeProject?.id || ""), s.title || s.name);
          },
        });
      }
    }

    // 4. Projects
    if (!isActionsMode && !isFilesMode) {
      for (const p of projects) {
        const match = fuzzyMatch(actualSearch, p.name);
        if (!match) continue;
        list.push({
          id: `project:${p.id}`,
          section: "Projects",
          title: p.name,
          subtitle: p.path,
          icon: <FolderKanban size={14} style={{ color: p.color }} />,
          ranges: match.ranges,
          score: match.score + 5,
          run: () => {
            close();
            void useSessionStore.getState().newSessionTab(p.id);
          },
        });
      }
    }

    // 5. Files (if in active project)
    // Opening goes through the `file.open` command (diff-viewer module; a disabled module's stub offers to enable it).
    if (!isActionsMode && !isSessionsMode && activeProject && files.length > 0 && COMMANDS_BY_ID.has("file.open")) {
      const fileMatches: PaletteItem[] = [];
      for (const f of files) {
        const match = fuzzyMatch(actualSearch, f.relativePath);
        if (!match) continue;
        fileMatches.push({
          id: `file:${f.path}`,
          section: "Files",
          title: f.name,
          subtitle: f.relativePath,
          icon: <FileCode size={14} />,
          ranges: match.ranges,
          score: match.score,
          run: () => {
            close();
            void COMMANDS_BY_ID.get("file.open")?.run({ path: f.path, projectId: activeProject.id, name: f.name });
          },
        });
      }
      fileMatches.sort((a, b) => b.score - a.score);
      // Cap files to avoid huge list dominance
      list.push(...fileMatches.slice(0, 15));
    }

    // Sort items within their sections or by score
    list.sort((a, b) => b.score - a.score);

    // Hard cap total
    return list.slice(0, 35);
  }, [
    commandsVersion,
    open,
    actualSearch,
    isActionsMode,
    isSessionsMode,
    isFilesMode,
    recents,
    tabs,
    activeTabId,
    allSessions,
    projects,
    activeProject,
    files,
    close,
    openSessionTab,
    switchTab,
    pushRecent,
  ]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // Ensure selected item is visible
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item) void item.run();
    }
  };

  const setPrefix = (prefix: string) => {
    setQuery(prefix);
    inputRef.current?.focus();
  };

  return (
    <div
      className="pal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="pal__input-wrap">
          <Search size={16} className="pal__input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="pal__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isActionsMode
                ? "Type an action..."
                : isSessionsMode
                  ? "Search sessions & projects..."
                  : isFilesMode
                    ? "Search project files..."
                    : "Search actions, sessions, files... ('>' actions, '@' sessions, '/' files)"
            }
          />
        </div>

        <div className="pal__filters">
          <button
            type="button"
            className={`pal__filter-chip${!isActionsMode && !isSessionsMode && !isFilesMode ? " is-active" : ""}`}
            onClick={() => setPrefix("")}
          >
            All
          </button>
          <button
            type="button"
            className={`pal__filter-chip${isActionsMode ? " is-active" : ""}`}
            onClick={() => setPrefix(">")}
          >
            &gt; Actions
          </button>
          <button
            type="button"
            className={`pal__filter-chip${isSessionsMode ? " is-active" : ""}`}
            onClick={() => setPrefix("@")}
          >
            @ Sessions
          </button>
          {activeProject && (
            <button
              type="button"
              className={`pal__filter-chip${isFilesMode ? " is-active" : ""}`}
              onClick={() => setPrefix("/")}
            >
              / Files
            </button>
          )}
        </div>

        <div className="pal__list" role="listbox">
          {items.length === 0 ? (
            <div className="pal__empty">No matching commands or items found</div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`pal__item${isSelected ? " is-selected" : ""}`}
                  onClick={() => void item.run()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="pal__item-icon">{item.icon}</div>
                  <div className="pal__item-content">
                    <div className="pal__item-title">
                      <Highlighted text={item.title} ranges={item.ranges} />
                    </div>
                    {item.subtitle && <div className="pal__item-sub">{item.subtitle}</div>}
                  </div>
                  {item.category && <span className="pal__category-tag">{item.category}</span>}
                  {item.shortcut && <kbd className="pal__kbd">{item.shortcut}</kbd>}
                </button>
              );
            })
          )}
        </div>

        <div className="pal__footer">
          <div className="pal__footer-hints">
            <span>
              <kbd className="pal__footer-kbd">↑</kbd>
              <kbd className="pal__footer-kbd">↓</kbd> navigate
            </span>
            <span>
              <kbd className="pal__footer-kbd">↵</kbd> select
            </span>
            <span>
              <kbd className="pal__footer-kbd">esc</kbd> close
            </span>
          </div>
          <div className="pal__footer-hint">Hive Quick Search</div>
        </div>
      </div>
    </div>
  );
};
