/** App-wide keyboard shortcuts (the ones advertised in the title bar menus). */
import { useEffect } from "react";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";

export async function openProjectFolder(): Promise<void> {
  const folder = await window.studio.pickFolder();
  if (!folder) return;
  const s = useSessionStore.getState();
  const p = await s.addProject(folder);
  await s.newSessionTab(p.id);
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const s = useSessionStore.getState();
      const ui = useUi.getState();
      let handled = true;
      if (key === "n" && !e.shiftKey) {
        if (s.activeProject) void s.newSessionTab(s.activeProject.id);
      } else if (key === "o" && !e.shiftKey) void openProjectFolder();
      else if (key === "w" && !e.shiftKey) {
        if (s.activeTabId) void s.closeTab(s.activeTabId);
      } else if (key === ",") ui.openSettings();
      else if (key === "b" && !e.shiftKey) ui.toggleLeft("projects");
      else if (key === "e" && e.shiftKey) ui.toggleLeft("files");
      else if (key === "g" && e.shiftKey) ui.toggleLeft("git");
      else if (key === "`") ui.toggleRight("terminal");
      else if (key === "u" && e.shiftKey) s.openUsageTab();
      else if (key === "k" && e.shiftKey) s.openLibraryTab();
      else if (key === "=" || key === "+") window.studio.zoom("in");
      else if (key === "-") window.studio.zoom("out");
      else if (key === "0") window.studio.zoom("reset");
      else if (key === "tab") {
        const { tabs, activeTabId } = s;
        if (tabs.length > 1) {
          const i = tabs.findIndex((t) => t.id === activeTabId);
          const next = tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]!;
          void s.switchTab(next.id);
        }
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
