import type { LinkedProject } from "./bridge.ts";

export interface ProjectDefaults {
  model?: { provider: string; id: string } | null;
  thinkingLevel?: string | null;
}

export interface ProjectEntry {
  id: string;
  name: string;
  /** Canonical absolute path to the project root. */
  path: string;
  /** CSS color string, e.g. "oklch(0.72 0.15 145)" or "#539bf5". */
  color: string;
  icon?: string | null;
  pinned: boolean;
  hidden: boolean;
  links: LinkedProject[];
  defaults: ProjectDefaults;
  themeOverride?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsFile {
  schemaVersion: 1;
  projects: ProjectEntry[];
}

export interface SessionCatalogItem {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string; // ISO string
  modified: string; // ISO string
  messageCount: number;
  firstMessage: string;
  projectId?: string;
}

export interface TabItem {
  id: string; // tab identifier (usually sessionPath or temp id)
  sessionPath?: string;
  projectId: string;
  title: string;
  pinned: boolean;
  isCold: boolean; // if rendered from file or has active live process
  activeKey?: string; // key of live session if started
}

export interface UiStateFile {
  schemaVersion: 1;
  tabs: TabItem[];
  activeTabId: string | null;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
}

export interface SessionMetaEntry {
  pinned?: boolean;
  archived?: boolean;
  unread?: boolean;
  lastSeenEntryId?: string;
}

export interface SessionMetaFile {
  schemaVersion: 1;
  sessions: Record<string, SessionMetaEntry>;
}

/** Pre-computed distinguishable project palette hues (OKLCH hue angles). */
export const DEFAULT_PROJECT_HUES = [
  "oklch(0.72 0.15 25)",   // Red-Orange
  "oklch(0.72 0.15 65)",   // Amber
  "oklch(0.72 0.15 145)",  // Green
  "oklch(0.72 0.15 185)",  // Teal
  "oklch(0.72 0.15 225)",  // Cyan
  "oklch(0.72 0.15 260)",  // Blue
  "oklch(0.72 0.15 300)",  // Purple
  "oklch(0.72 0.15 330)",  // Magenta
];

export function getNextProjectColor(existingCount: number): string {
  const hue = DEFAULT_PROJECT_HUES[existingCount % DEFAULT_PROJECT_HUES.length];
  return hue ?? "oklch(0.72 0.15 260)";
}
