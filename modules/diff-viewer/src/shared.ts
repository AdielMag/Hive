/**
 * Contract of the diff-viewer module. Other modules (git, files, library) may import this file only.
 */
export const MODULE_ID = "diff-viewer";
export const FILE_TAB_KIND = "file";
export const DIFF_TAB_KIND = "diff";

/** Command: open a file in a viewer tab. Args: {@link FileOpenArgs}. */
export const FILE_OPEN_COMMAND = "file.open";

/** Slot rendered in the diff viewer's action bar. Props: `{ tab: ModuleTab }`. Used by git for Stage/Unstage. */
export const DIFF_ACTIONS_SLOT = "diff.actions";

export interface FileOpenArgs {
  path: string;
  projectId?: string;
  /** Tab title; defaults to the file name. */
  name?: string;
}

/** `tab.data` of a `file` tab. */
export interface FileTabData {
  content?: string;
  language?: string;
  dataUrl?: string;
  mimeType?: string;
  size?: number;
  isBinary?: boolean;
}

/** `tab.data` of a `diff` tab. */
export interface DiffTabData {
  content: string;
  staged?: boolean;
}

export const diffTabId = (staged: boolean, filePath: string): string => `diff:${staged ? "staged" : "working"}:${filePath}`;

export const fileTabId = (filePath: string): string => `file:${filePath}`;

export const fileBaseName = (filePath: string): string => filePath.split(/[/\\]/).pop() || filePath;

export const diffTabTitle = (staged: boolean, filePath: string): string => `${staged ? "[Staged] " : ""}${fileBaseName(filePath)}`;
