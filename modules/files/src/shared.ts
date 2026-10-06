export const MODULE_ID = "files";
export const FILES_PANEL_ID = "files";

export const FileMethods = {
  createFile: "createFile",
  createDirectory: "createDirectory",
  rename: "rename",
  delete: "delete",
  revealInExplorer: "revealInExplorer",
} as const;

export interface FileCreateRequest {
  rootPath: string;
  targetPath: string;
}

export interface FileRenameRequest {
  rootPath: string;
  oldPath: string;
  newPath: string;
}

export interface FileDeleteRequest {
  rootPath: string;
  targetPath: string;
  useTrash?: boolean;
}

export interface FileRevealRequest {
  rootPath: string;
  targetPath: string;
}

export interface FileOperationResult {
  ok: boolean;
  error?: string;
  path?: string;
}
