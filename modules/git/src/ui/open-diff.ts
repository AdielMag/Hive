import type { ModuleHost } from "@hive/module-sdk/renderer";
import { DIFF_TAB_KIND, diffTabId, diffTabTitle, type DiffTabData } from "@hive-module/diff-viewer/shared";
import { gitApi } from "./git-host.ts";

export const NO_DIFF_TEXT = "No differences detected.";

/** Loads a file's diff through git and shows it in the diff viewer (re-reading content when the tab already exists). */
export async function openDiffTab(
  host: ModuleHost,
  project: { id: string; path: string },
  filePath: string,
  staged: boolean,
): Promise<void> {
  let content = "";
  try {
    content = await gitApi().getGitDiff(project.path, { staged, filePath });
  } catch (err) {
    content = `Failed to load diff: ${err instanceof Error ? err.message : String(err)}`;
  }
  const data: DiffTabData = { content: content || NO_DIFF_TEXT, staged };
  const id = diffTabId(staged, filePath);
  const tabId = host.tabs.open({
    kind: DIFF_TAB_KIND,
    id,
    title: diffTabTitle(staged, filePath),
    filePath,
    projectId: project.id,
    data: { ...data },
    reuse: (t) => t.id === id,
  });
  host.tabs.update(tabId, { data: { ...data } });
}
