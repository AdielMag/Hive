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
  const isStaged = Boolean((tab.data as Partial<DiffTabData> | undefined)?.staged);

  const toggle = async () => {
    try {
      const api = gitApi();
      if (isStaged) await api.unstageFile(project.path, filePath);
      else await api.stageFile(project.path, filePath);
      const updated = await api.getGitDiff(project.path, { staged: !isStaged, filePath });
      host.tabs.update(tab.id, {
        title: diffTabTitle(!isStaged, filePath),
        data: { staged: !isStaged, content: updated || NO_DIFF_TEXT },
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
