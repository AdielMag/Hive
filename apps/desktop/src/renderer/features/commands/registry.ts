/**
 * The single source of truth for app commands. Actions read stores lazily (`getState()` at run time) so this
 * module has no React coupling. Default chords here reproduce the previous hard-coded shortcuts exactly.
 */
import { create } from "zustand";
import { useSessionStore } from "../../store/session-store.ts";
import { useUi, type LeftPanel } from "../../store/ui-store.ts";
import { useUpdates } from "../../store/update-store.ts";
import { usePalette } from "./palette-store.ts";
import type { Command } from "./types.ts";

export async function openProjectFolder(): Promise<void> {
  const folder = await window.studio.pickFolder();
  if (!folder) return;
  const s = useSessionStore.getState();
  const p = await s.addProject(folder);
  await s.newSessionTab(p.id);
}

function cycleTab(dir: 1 | -1): void {
  const { tabs, activeTabId, switchTab } = useSessionStore.getState();
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeTabId);
  void switchTab(tabs[(i + dir + tabs.length) % tabs.length]!.id);
}

const left = (id: string, title: string, panel: LeftPanel, defaultKeys?: string[]): Command => ({
  id,
  title: `Toggle ${title} Panel`,
  category: "View",
  keywords: `show hide sidebar ${panel}`,
  defaultKeys,
  allowInTerminal: !!defaultKeys,
  run: () => useUi.getState().toggleLeft(panel),
});

const CORE_COMMANDS: readonly Command[] = [
  // Palette
  { id: "palette.open", title: "Search Everything…", category: "Navigate", keywords: "quick open command palette find", defaultKeys: ["Mod+K"], run: () => usePalette.getState().toggle() },
  { id: "palette.actions", title: "Show All Actions…", category: "Navigate", keywords: "command palette", defaultKeys: ["Mod+Shift+P"], allowInTerminal: true, run: () => usePalette.getState().toggle(">") },

  // Sessions & tabs
  {
    id: "session.new",
    title: "New Session",
    category: "Session",
    keywords: "chat create",
    defaultKeys: ["Mod+N"],
    allowInTerminal: true,
    when: () => !!useSessionStore.getState().activeProject,
    run: () => {
      const p = useSessionStore.getState().activeProject;
      if (p) return useSessionStore.getState().newSessionTab(p.id);
    },
  },
  { id: "project.open", title: "Open Project Folder…", category: "Project", keywords: "add folder workspace", defaultKeys: ["Mod+O"], allowInTerminal: true, run: () => openProjectFolder() },
  {
    id: "tab.close",
    title: "Close Tab",
    category: "Tabs",
    defaultKeys: ["Mod+W"],
    allowInTerminal: true,
    when: () => !!useSessionStore.getState().activeTabId,
    run: () => {
      const id = useSessionStore.getState().activeTabId;
      if (id) return useSessionStore.getState().closeTab(id);
    },
  },
  { id: "tab.next", title: "Next Tab", category: "Tabs", defaultKeys: ["Mod+Tab"], allowInTerminal: true, when: () => useSessionStore.getState().tabs.length > 1, run: () => cycleTab(1) },
  { id: "tab.prev", title: "Previous Tab", category: "Tabs", defaultKeys: ["Mod+Shift+Tab"], allowInTerminal: true, when: () => useSessionStore.getState().tabs.length > 1, run: () => cycleTab(-1) },

  // Agent Modes
  {
    id: "mode.auto-edit",
    title: "Mode: Auto Edit",
    category: "Agent",
    keywords: "mode agent auto edit code autonomous",
    when: () => !!useSessionStore.getState().activeTabId,
    run: () => useSessionStore.getState().setMode("auto-edit"),
  },
  {
    id: "mode.ask",
    title: "Mode: Ask",
    category: "Agent",
    keywords: "mode ask question chat explain read only",
    when: () => !!useSessionStore.getState().activeTabId,
    run: () => useSessionStore.getState().setMode("ask"),
  },
  {
    id: "mode.plan",
    title: "Mode: Plan",
    category: "Agent",
    keywords: "mode plan architect research",
    when: () => !!useSessionStore.getState().activeTabId,
    run: () => useSessionStore.getState().setMode("plan"),
  },
  {
    id: "mode.manual",
    title: "Mode: Manual",
    category: "Agent",
    keywords: "mode manual confirm diff",
    when: () => !!useSessionStore.getState().activeTabId,
    run: () => useSessionStore.getState().setMode("manual"),
  },
  {
    id: "mode.debug",
    title: "Mode: Debug",
    category: "Agent",
    keywords: "mode debug diagnostics trace root cause",
    when: () => !!useSessionStore.getState().activeTabId,
    run: () => useSessionStore.getState().setMode("debug"),
  },

  // Views
  left("view.projects", "Projects", "projects", ["Mod+B"]),

  // Window
  { id: "zoom.in", title: "Zoom In", category: "Window", defaultKeys: ["Mod+=", "Mod+Shift+="], allowInTerminal: true, run: () => void window.studio.zoom("in") },
  { id: "zoom.out", title: "Zoom Out", category: "Window", defaultKeys: ["Mod+-"], allowInTerminal: true, run: () => void window.studio.zoom("out") },
  { id: "zoom.reset", title: "Reset Zoom", category: "Window", defaultKeys: ["Mod+0"], allowInTerminal: true, run: () => void window.studio.zoom("reset") },

  // Settings & app
  { id: "settings.open", title: "Open Settings", category: "App", keywords: "preferences options", defaultKeys: ["Mod+,"], allowInTerminal: true, run: () => useUi.getState().openSettings() },
  { id: "settings.keyboard", title: "Keyboard Shortcuts", category: "App", keywords: "keybindings hotkeys rebind", run: () => useUi.getState().openSettings() },
  { id: "settings.models", title: "Settings: Models", category: "App", keywords: "providers", run: () => useUi.getState().openSettings("models") },
  { id: "settings.appearance", title: "Settings: Appearance", category: "App", keywords: "theme colors font", run: () => useUi.getState().openSettings("appearance") },
  { id: "app.checkUpdates", title: "Check for Updates", category: "App", keywords: "upgrade version", run: () => void useUpdates.getState().check() },
];

/**
 * Live command list. Core commands are fixed; modules add (and remove) theirs through `registerCommands`.
 * The array / map / set are mutated in place so existing importers always see the current commands; React
 * consumers that must re-render on change subscribe to `useCommandsVersion`.
 */
export const COMMANDS: readonly Command[] = [...CORE_COMMANDS];
export const COMMANDS_BY_ID: ReadonlyMap<string, Command> = new Map(CORE_COMMANDS.map((c) => [c.id, c]));
export const COMMAND_IDS: ReadonlySet<string> = new Set(CORE_COMMANDS.map((c) => c.id));

const mutable = {
  list: COMMANDS as Command[],
  byId: COMMANDS_BY_ID as Map<string, Command>,
  ids: COMMAND_IDS as Set<string>,
};
const CORE_IDS: ReadonlySet<string> = new Set(CORE_COMMANDS.map((c) => c.id));

export const useCommandsVersion = create<{ version: number }>(() => ({ version: 0 }));
const bump = () => useCommandsVersion.setState((s) => ({ version: s.version + 1 }));

/**
 * Adds commands (replacing any non-core command with the same id, e.g. a disabled-module stub). Returns an
 * unregister function that only removes the commands it added. Core command ids can't be overridden.
 */
export function registerCommands(commands: readonly Command[]): () => void {
  const added: Command[] = [];
  for (const cmd of commands) {
    if (CORE_IDS.has(cmd.id)) {
      console.warn(`[commands] ignoring attempt to override core command ${cmd.id}`);
      continue;
    }
    const prev = mutable.byId.get(cmd.id);
    if (prev) mutable.list.splice(mutable.list.indexOf(prev), 1);
    mutable.list.push(cmd);
    mutable.byId.set(cmd.id, cmd);
    mutable.ids.add(cmd.id);
    added.push(cmd);
  }
  if (added.length) bump();
  return () => {
    let changed = false;
    for (const cmd of added) {
      if (mutable.byId.get(cmd.id) !== cmd) continue; // already replaced
      mutable.list.splice(mutable.list.indexOf(cmd), 1);
      mutable.byId.delete(cmd.id);
      mutable.ids.delete(cmd.id);
      changed = true;
    }
    if (changed) bump();
  };
}
