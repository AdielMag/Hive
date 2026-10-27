/** Stage / Unstage button injected into the diff viewer's `diff.actions` slot. */
import React from "react";
import { Plus, Minus } from "lucide-react";
import type { ModuleHost, ModuleTab } from "@hive/module-sdk/renderer";
import { diffTabTitle, type DiffTabData } from "@hive-module/diff-viewer/shared";
import { gitApi } from "./git-host.ts";
import { NO_DIFF_TEXT } from "./open-diff.ts";
import { useGitStore } from "./git-store.ts";

export const StageButton: React.FC<{ host: ModuleHost; tab?: ModuleTab }> = ({ host, tab }) => {
  const project = host.hooks.useActiveSession().project;
  if (!tab || !tab.filePath || !project) return null;
  const filePath = tab.filePath;
  const tabData = tab.data as Partial<DiffTabData> | undefined;
  const isStaged = Boolean(tabData?.staged);
  const isUntracked = Boolean(tabData?.untracked);
  const targetCwd = tabData?.cwd || project.path;

  const toggle = async () => {
    try {
      const api = gitApi();
      if (isStaged) await api.unstageFile(targetCwd, filePath);
      else await api.stageFile(targetCwd, filePath);
      const nextStaged = !isStaged;
      const updated = await api.getGitDiff(targetCwd, {
        staged: nextStaged,
        filePath,
        untracked: !nextStaged && isUntracked,
      });
      host.tabs.update(tab.id, {
        title: diffTabTitle(nextStaged, filePath),
        data: {
          staged: nextStaged,
          content: updated || NO_DIFF_TEXT,
          cwd: targetCwd,
          untracked: isUntracked,
        },
      });
      void useGitStore.getState().refreshGit();
    } catch (err) {
      host.toast({ kind: "error", message: `Operation failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <button
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        background: isStaged ? "rgba(229, 83, 75, 0.12)" : "rgba(16, 185, 129, 0.12)",
        border: `1px solid ${isStaged ? "rgba(229, 83, 75, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
        borderRadius: 4,
        color: isStaged ? "var(--danger)" : "var(--success)",
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {isStaged ? (
        <>
          <Minus size={12} />
          <span>Unstage</span>
        </>
      ) : (
        <>
          <Plus size={12} />
          <span>Stage</span>
        </>
      )}
    </button>
  );
};
