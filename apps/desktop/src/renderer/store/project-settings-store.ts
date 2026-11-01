/** Which project's settings dialog is open (null = closed). Transient, not persisted. */
import { create } from "zustand";

export type ProjectSettingsSection = "general" | "appearance" | "folders" | "remove";

interface ProjectSettingsState {
  projectId: string | null;
  section: ProjectSettingsSection;
  open: (projectId: string, section?: ProjectSettingsSection) => void;
  close: () => void;
}

export const useProjectSettings = create<ProjectSettingsState>((set) => ({
  projectId: null,
  section: "general",
  open: (projectId, section = "general") => set({ projectId, section }),
  close: () => set({ projectId: null }),
}));
