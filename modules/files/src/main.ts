import { shell } from "electron";
import { defineMainModule } from "@hive/module-sdk/main";
import {
  FileMethods,
  MODULE_ID,
  type FileCreateRequest,
  type FileDeleteRequest,
  type FileOperationResult,
  type FileRenameRequest,
  type FileRevealRequest,
} from "./shared.ts";
import {
  createDirectory,
  createFile,
  deleteItem,
  renameItem,
  revealInExplorer,
} from "./service.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    ctx.ipc.handle(FileMethods.createFile, (req: FileCreateRequest): Promise<FileOperationResult> => {
      return createFile(req);
    });

    ctx.ipc.handle(FileMethods.createDirectory, (req: FileCreateRequest): Promise<FileOperationResult> => {
      return createDirectory(req);
    });

    ctx.ipc.handle(FileMethods.rename, (req: FileRenameRequest): Promise<FileOperationResult> => {
      return renameItem(req);
    });

    ctx.ipc.handle(FileMethods.delete, (req: FileDeleteRequest): Promise<FileOperationResult> => {
      return deleteItem(req, {
        trashItem: (targetPath: string) => shell.trashItem(targetPath),
      });
    });

    ctx.ipc.handle(FileMethods.revealInExplorer, (req: FileRevealRequest): Promise<FileOperationResult> => {
      return revealInExplorer(req, {
        showItemInFolder: (targetPath: string) => shell.showItemInFolder(targetPath),
      });
    });
  },
});
