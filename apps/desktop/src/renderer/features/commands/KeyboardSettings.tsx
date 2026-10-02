import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Edit2, RotateCcw, Search, Trash2, X } from "lucide-react";
import { COMMANDS, COMMANDS_BY_ID } from "./registry.ts";
import { useKeybindingStore } from "./keybindings-store.ts";
import { effectiveKeys, findConflicts, isCustomised } from "./bindings.ts";
import { chordFromEvent, formatChord, validateGlobalChord } from "./keybinding.ts";
import type { Command } from "./types.ts";
import "./keyboard-settings.css";

interface ConflictInfo {
  commandId: string;
  chord: string;
  conflictsWithId: string;
  conflictsWithTitle: string;
}

export const KeyboardSettings: React.FC = () => {
  const { overrides, setBinding, assign, resetBinding, resetAll, setRecording } = useKeybindingStore();
  const [search, setSearch] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  // Platform detection for pretty chord formatting (Ctrl vs ⌘)
  const platform = typeof document !== "undefined" ? document.documentElement?.dataset?.platform : undefined;

  // Signal to the global dispatcher to stand down while recording keys
  useEffect(() => {
    setRecording(recordingId !== null);
    if (recordingId === null) {
      setConflict(null);
      setErrorHint(null);
    }
  }, [recordingId, setRecording]);

  // Capture keystrokes during shortcut recording
  useEffect(() => {
    if (!recordingId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }

      // Backspace or Delete with no modifiers unbinds the command
      if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setBinding(recordingId, []);
        setRecordingId(null);
        return;
      }

      const chord = chordFromEvent(e);
      if (!chord) return; // Modifier key alone (Ctrl/Shift/Alt)

      const validationError = validateGlobalChord(chord);
      if (validationError) {
        setErrorHint(validationError);
        return;
      }

      // Check conflicts
      const conflicts = findConflicts(COMMANDS, overrides, chord, recordingId);
      if (conflicts.length > 0) {
        const otherId = conflicts[0]!;
        const otherCmd = COMMANDS_BY_ID.get(otherId);
        setConflict({
          commandId: recordingId,
          chord,
          conflictsWithId: otherId,
          conflictsWithTitle: otherCmd?.title ?? otherId,
        });
        setErrorHint(null);
        return;
      }

      // Valid and conflict-free
      setBinding(recordingId, [chord]);
      setRecordingId(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingId, overrides, setBinding]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, Command[]>();

    for (const cmd of COMMANDS) {
      const chords = effectiveKeys(cmd, overrides);
      const matchesSearch =
        !q ||
        cmd.title.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.keywords?.toLowerCase().includes(q) ||
        chords.some((c) => formatChord(c, platform).toLowerCase().includes(q));

      if (matchesSearch) {
        const list = map.get(cmd.category) ?? [];
        list.push(cmd);
        map.set(cmd.category, list);
      }
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [search, overrides, platform]);

  const customCount = Object.keys(overrides).length;

  return (
    <div className="kb-settings">
      <div className="kb-settings__toolbar">
        <div className="kb-settings__search-wrap">
          <Search size={14} className="kb-settings__search-icon" />
          <input
            type="text"
            className="kb-settings__search"
            placeholder="Filter commands or shortcuts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="kb-settings__meta">
          {customCount > 0 && (
            <span>
              {customCount} custom {customCount === 1 ? "shortcut" : "shortcuts"}
            </span>
          )}
          {customCount > 0 && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() => {
                if (window.confirm("Reset all keyboard shortcuts to defaults?")) {
                  resetAll();
                }
              }}
            >
              <RotateCcw size={12} />
              <span>Reset all</span>
            </button>
          )}
        </div>
      </div>

      <div className="kb-settings__list">
        {groupedCommands.length === 0 ? (
          <div className="pal__empty">No matching commands found</div>
        ) : (
          groupedCommands.map(([category, cmds]) => (
            <div key={category} className="kb-settings__group">
              <div className="kb-settings__group-title">{category}</div>
              <div className="kb-settings__group-card">
                {cmds.map((cmd) => {
                  const isRecordingThis = recordingId === cmd.id;
                  const customized = isCustomised(cmd, overrides);
                  const chords = effectiveKeys(cmd, overrides);

                  return (
                    <div key={cmd.id}>
                      <div className={`kb-row${isRecordingThis ? " is-recording" : ""}`}>
                        <div className="kb-row__info">
                          {customized && <span className="kb-row__dot" title="Customized" />}
                          <span className="kb-row__title">{cmd.title}</span>
                        </div>

                        <div className="kb-row__actions">
                          {isRecordingThis ? (
                            <div className="kb-recording-box">
                              <span>Press keys... (Esc to cancel, Del to clear)</span>
                              <button
                                type="button"
                                className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                                onClick={() => setRecordingId(null)}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <>
                              {chords.length === 0 ? (
                                <span className="kb-badge kb-badge--empty">Not bound</span>
                              ) : (
                                chords.map((chord) => (
                                  <kbd key={chord} className="kb-badge">
                                    {formatChord(chord, platform)}
                                  </kbd>
                                ))
                              )}

                              <button
                                type="button"
                                className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                                title="Change shortcut"
                                onClick={() => {
                                  setRecordingId(cmd.id);
                                }}
                              >
                                <Edit2 size={12} />
                              </button>

                              {chords.length > 0 && (
                                <button
                                  type="button"
                                  className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                                  title="Unbind shortcut"
                                  onClick={() => setBinding(cmd.id, [])}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}

                              {customized && (
                                <button
                                  type="button"
                                  className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                                  title="Reset to default"
                                  onClick={() => resetBinding(cmd.id)}
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Inline error or conflict prompt */}
                      {isRecordingThis && errorHint && (
                        <div className="kb-conflict-banner">
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <AlertCircle size={14} />
                            <span>{errorHint}</span>
                          </div>
                        </div>
                      )}

                      {isRecordingThis && conflict && (
                        <div className="kb-conflict-banner">
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <AlertCircle size={14} />
                            <span>
                              <strong>{formatChord(conflict.chord, platform)}</strong> is currently assigned to{" "}
                              <strong>{conflict.conflictsWithTitle}</strong>. Replace it?
                            </span>
                          </div>
                          <div className="kb-conflict-actions">
                            <button
                              type="button"
                              className="ui-btn ui-btn--primary ui-btn--sm"
                              onClick={() => {
                                assign(cmd.id, [conflict.chord], [conflict.conflictsWithId]);
                                setRecordingId(null);
                              }}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost ui-btn--sm"
                              onClick={() => setConflict(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
