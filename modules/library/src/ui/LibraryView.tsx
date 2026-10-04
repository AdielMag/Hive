import React, { useEffect, useMemo } from "react";
import {
  Blocks,
  FolderKanban,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useLibraryStore } from "./library-store.ts";
import { LibraryList } from "./LibraryList.tsx";
import { LibraryDetail } from "./LibraryDetail.tsx";
import { libraryHost } from "./library-host.ts";
import "./library.css";

export const LibraryView: React.FC = () => {
  const { snapshot, loading, error, selectedId, load } = useLibraryStore();
  const activeProject = libraryHost().sessions.activeProject();
  const cwd = activeProject?.path;

  // Load when mounted or when active project changes
  useEffect(() => {
    void load(cwd);
  }, [cwd, load]);

  // Refresh on window focus so external edits are immediately visible
  useEffect(() => {
    const onFocus = () => {
      void load(cwd, true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cwd, load]);

  const selectedEntry = useMemo(() => {
    if (!snapshot || !selectedId) return null;
    return snapshot.entries.find((e) => e.id === selectedId) ?? null;
  }, [snapshot, selectedId]);

  const stats = useMemo(() => {
    if (!snapshot) return null;
    const skills = snapshot.entries.filter((e) => e.kind === "skill" && !e.shadowed).length;
    const agents = snapshot.entries.filter((e) => e.kind === "agent" && !e.shadowed).length;
    return { skills, agents, total: skills + agents };
  }, [snapshot]);

  return (
    <div className="lib-view">
      {/* Top action bar */}
      <header className="lib-topbar">
        <div className="lib-topbar__title-group">
          <div className="lib-topbar__icon">
            <Blocks size={18} />
          </div>
          <div>
            <h1 className="lib-topbar__heading">Skills &amp; Agents</h1>
            <div className="lib-topbar__sub text-muted">
              {stats ? (
                <>
                  <span>{stats.skills} skills</span>
                  <span className="lib-topbar__dot">&middot;</span>
                  <span>{stats.agents} agents</span>
                  {activeProject && (
                    <>
                      <span className="lib-topbar__dot">&middot;</span>
                      <span className="lib-topbar__project" title={activeProject.path}>
                        <FolderKanban size={11} /> {activeProject.name}
                      </span>
                    </>
                  )}
                </>
              ) : (
                "Pi skills & pi-subagents definitions"
              )}
            </div>
          </div>
        </div>

        <div className="lib-topbar__actions">
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={() => void load(cwd, true)}
            disabled={loading}
            title="Scan project and global directories for changes"
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Main split view */}
      <div className="lib-view__body">
        {loading && !snapshot ? (
          <div className="lib-view__loading text-muted">
            <Loader2 size={24} className="spin" />
            <p>Scanning skills and subagent definitions...</p>
          </div>
        ) : error && !snapshot ? (
          <div className="lib-view__error">
            <p>Failed to load library: {error}</p>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => void load(cwd)}>
              Retry
            </button>
          </div>
        ) : (
          <div className="lib-view__split">
            <LibraryList />
            <main className="lib-view__main">
              {selectedEntry ? (
                <LibraryDetail key={selectedEntry.id} entry={selectedEntry} />
              ) : (
                <div className="lib-view__empty-detail text-muted">
                  <Sparkles size={28} className="lib-view__empty-icon" />
                  <h2>Select a skill or agent</h2>
                  <p>Choose an item from the list to view its sections, edit its model/thinking config, and inspect its tools.</p>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
};
