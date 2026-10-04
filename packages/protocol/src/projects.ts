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

export interface AttachedItem {
  id: string;
  name: string;
  path?: string;
  kind: "image" | "file";
  mimeType: string;
  size?: number;
  dataBase64?: string; // base64 string for images (without data:... prefix)
  textContent?: string; // string content for text/code files
  previewUrl?: string; // data URL or thumbnail for rendering in UI
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
  /** Studio-side display title set by the user (overrides Pi's name / first message). */
  title?: string;
  /** Hidden from the session list without deleting the file. */
  archived?: boolean;
  /** Renderer-only: a just-started session whose file Pi hasn't listed yet (optimistic sidebar entry). */
  pending?: boolean;
}

export type AgentMode = "plan" | "auto-edit" | "manual" | "debug" | "ask";

/** Tab kinds implemented by core. Modules add their own kinds (any string), e.g. "file", "diff", "plan", "library", "browser". */
export type CoreTabKind = "session" | "subagent";

export const CORE_TAB_KINDS: readonly CoreTabKind[] = ["session", "subagent"];

/** True for core kinds (and a missing kind, which means "session"). */
export function isCoreTabKind(kind: string | undefined): boolean {
  return kind === undefined || (CORE_TAB_KINDS as readonly string[]).includes(kind);
}

export interface TabItem {
  id: string; // tab identifier (usually sessionPath or temp id)
  /** Core kind, or a module-contributed kind rendered through the module registry. Missing = session. */
  kind?: CoreTabKind | (string & {});
  sessionPath?: string;
  projectId: string;
  title: string;
  pinned: boolean;
  isCold?: boolean; // if rendered from file or has active live process
  activeKey?: string; // key of live session if started
  model?: any; // selected model for this tab
  thinkingLevel?: string;
  mode?: AgentMode;

  /** File the tab shows (module tab kinds such as "file" / "diff"; their payload lives in `data`). */
  filePath?: string;

  // Browser tab fields
  url?: string;
  favicon?: string;
  isSleeping?: boolean;
  lastActiveAt?: number;

  // Subagent tab fields
  subagentToolCallId?: string;
  subagentAgentId?: string;
  subagentView?: any;
  parentSessionPath?: string;
  parentActiveKey?: string;

  /** Module tab state (shape defined by the module that owns the tab kind). */
  data?: Record<string, unknown>;
}

export interface UiStateFile {
  schemaVersion: 1;
  tabs: TabItem[];
  activeTabId: string | null;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
}

export interface SessionMetaEntry {
  /** User-chosen display title (rename). */
  title?: string;
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
