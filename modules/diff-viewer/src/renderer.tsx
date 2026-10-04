import { lazy } from "react";
import { FileCode, GitCompare } from "lucide-react";
import { defineRendererModule, type ModuleHost } from "@hive/module-sdk/renderer";
import { DIFF_TAB_KIND, FILE_OPEN_COMMAND, FILE_TAB_KIND, MODULE_ID, fileBaseName, fileTabId, type FileOpenArgs, type FileTabData } from "./shared.ts";
import "./ui/viewer.css";

const FileViewerTab = lazy(() => import("./ui/FileViewerTab.tsx").then((m) => ({ default: m.FileViewerTab })));
const DiffViewerTab = lazy(() => import("./ui/DiffViewerTab.tsx").then((m) => ({ default: m.DiffViewerTab })));

/** Opens `args.path` in a file tab (re-reads the file, so reopening refreshes stale content). */
async function openFile(host: ModuleHost, args: unknown): Promise<void> {
  const { path, projectId, name } = (args ?? {}) as Partial<FileOpenArgs>;
  if (!path) return;
  const data: FileTabData = { content: "", language: "text" };
  try {
    const res = await host.files.read(path);
    data.content = res.content;
    data.language = res.language;
  } catch (err) {
    data.content = `Failed to load file: ${err instanceof Error ? err.message : String(err)}`;
  }
  const id = fileTabId(path);
  const tabId = host.tabs.open({
    kind: FILE_TAB_KIND,
    id,
    title: name || fileBaseName(path),
    filePath: path,
    projectId,
    data: { ...data },
    reuse: (t) => t.id === id,
  });
  host.tabs.update(tabId, { data: { ...data } });
}

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    tabKinds: [
      {
        kind: FILE_TAB_KIND,
        icon: ({ size }) => <FileCode size={size} />,
        component: ({ tab, host }) => <FileViewerTab tab={tab} host={host} />,
      },
      {
        kind: DIFF_TAB_KIND,
        icon: ({ size }) => <GitCompare size={size} />,
        component: ({ tab, host }) => <DiffViewerTab tab={tab} host={host} />,
      },
    ],
    commands: [
      {
        id: FILE_OPEN_COMMAND,
        title: "Open File in Viewer",
        category: "File",
        // Programmatic entry point (file quick-open, Files panel, Library). Hidden from the palette list.
        when: () => false,
        run: (host, args) => openFile(host, args),
      },
    ],
  },
});
