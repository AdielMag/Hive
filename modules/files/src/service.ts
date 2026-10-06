import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  FileCreateRequest,
  FileDeleteRequest,
  FileOperationResult,
  FileRenameRequest,
  FileRevealRequest,
} from "./shared.ts";

export function normPath(p: string): string {
  const r = resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(normPath(parent), normPath(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function isInsideOrSame(child: string, parent: string): boolean {
  const rel = relative(normPath(parent), normPath(child));
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export async function createFile(req: FileCreateRequest): Promise<FileOperationResult> {
  const { rootPath, targetPath } = req;
  if (!rootPath || !targetPath) {
    return { ok: false, error: "Missing required paths" };
  }
  if (!isInside(targetPath, rootPath)) {
    return { ok: false, error: "Target path must be inside the project workspace" };
  }
  if (existsSync(targetPath)) {
    return { ok: false, error: "File already exists" };
  }

  try {
    const parentDir = dirname(targetPath);
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
    }
    await writeFile(targetPath, "", { flag: "wx" });
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createDirectory(req: FileCreateRequest): Promise<FileOperationResult> {
  const { rootPath, targetPath } = req;
  if (!rootPath || !targetPath) {
    return { ok: false, error: "Missing required paths" };
  }
  if (!isInside(targetPath, rootPath)) {
    return { ok: false, error: "Target path must be inside the project workspace" };
  }
  if (existsSync(targetPath)) {
    return { ok: false, error: "Directory already exists" };
  }

  try {
    await mkdir(targetPath, { recursive: true });
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function renameItem(req: FileRenameRequest): Promise<FileOperationResult> {
  const { rootPath, oldPath, newPath } = req;
  if (!rootPath || !oldPath || !newPath) {
    return { ok: false, error: "Missing required paths" };
  }
  if (!isInside(oldPath, rootPath) || !isInside(newPath, rootPath)) {
    return { ok: false, error: "Paths must be inside the project workspace" };
  }
  if (!existsSync(oldPath)) {
    return { ok: false, error: "Source path does not exist" };
  }
  if (existsSync(newPath)) {
    return { ok: false, error: "Destination path already exists" };
  }

  try {
    const parentDir = dirname(newPath);
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
    }
    await rename(oldPath, newPath);
    return { ok: true, path: newPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface DeleteItemOptions {
  trashItem?: (targetPath: string) => Promise<void>;
}

export async function deleteItem(
  req: FileDeleteRequest,
  opts: DeleteItemOptions = {},
): Promise<FileOperationResult> {
  const { rootPath, targetPath, useTrash = true } = req;
  if (!rootPath || !targetPath) {
    return { ok: false, error: "Missing required paths" };
  }
  if (!isInside(targetPath, rootPath)) {
    return { ok: false, error: "Cannot delete items outside or at the root of the project workspace" };
  }
  if (!existsSync(targetPath)) {
    return { ok: false, error: "Item does not exist" };
  }

  try {
    if (useTrash && opts.trashItem) {
      await opts.trashItem(targetPath);
    } else {
      await rm(targetPath, { recursive: true, force: true });
    }
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface RevealOptions {
  showItemInFolder?: (targetPath: string) => void;
}

export async function revealInExplorer(
  req: FileRevealRequest,
  opts: RevealOptions = {},
): Promise<FileOperationResult> {
  const { rootPath, targetPath } = req;
  if (!rootPath || !targetPath) {
    return { ok: false, error: "Missing required paths" };
  }
  if (!isInsideOrSame(targetPath, rootPath)) {
    return { ok: false, error: "Target path must be inside the project workspace" };
  }
  if (!existsSync(targetPath)) {
    return { ok: false, error: "Item does not exist" };
  }

  try {
    if (opts.showItemInFolder) {
      opts.showItemInFolder(targetPath);
    }
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
