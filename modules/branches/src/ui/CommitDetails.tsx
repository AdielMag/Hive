/** Right column: metadata + changed files of the selected commit. */
import React, { useMemo } from "react";
import { Copy, FileText, Folder, GitMerge, Loader2 } from "lucide-react";
import type { GitCommitDetail, GitCommitFile } from "@hive-module/git/shared";
import { Avatar, RefChip } from "./bits.tsx";

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
export const formatDate = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
};

const STATUS_LETTER: Record<GitCommitFile["status"], string> = { added: "A", modified: "M", deleted: "D" };

const DiffBar: React.FC<{ add: number; del: number }> = ({ add, del }) => {
  const total = add + del;
  if (total === 0) return null;
  return (
    <span className="bw__diffbar" title={`+${add} −${del}`}>
      <span style={{ width: `${(add / total) * 100}%`, background: "var(--success)" }} />
      <span style={{ width: `${(del / total) * 100}%`, background: "var(--danger)" }} />
    </span>
  );
};

export const CommitDetails: React.FC<{
  detail: GitCommitDetail | null;
  loading: boolean;
  onCopy(text: string): void;
}> = ({ detail, loading, onCopy }) => {
  const groups = useMemo(() => {
    const map = new Map<string, GitCommitFile[]>();
    for (const f of detail?.files ?? []) {
      const i = f.path.lastIndexOf("/");
      const dir = i === -1 ? "" : f.path.slice(0, i);
      const list = map.get(dir) ?? [];
      list.push(f);
      map.set(dir, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [detail]);
  const totals = useMemo(
    () => (detail?.files ?? []).reduce((t, f) => ({ add: t.add + (f.additions ?? 0), del: t.del + (f.deletions ?? 0) }), { add: 0, del: 0 }),
    [detail],
  );

  if (!detail) {
    return (
      <div className="bw__empty" style={{ marginTop: 20 }}>
        {loading ? <Loader2 size={16} className="spin" /> : "Select a commit to see its details"}
      </div>
    );
  }
  const isMerge = detail.parents.length > 1;

  return (
    <>
      <div className="bw__detail-head">
        <div className="bw__subject">{detail.subject}</div>
        {detail.body && <div className="bw__body-text">{detail.body}</div>}
        <div className="bw__meta">
          <Avatar name={detail.author} large />
          <div className="bw__meta-lines">
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.author}</strong>
            <span className="bw__muted" title={detail.authorEmail}>
              {formatDate(detail.date)}
              {detail.committer && detail.committer !== detail.author ? ` · committed by ${detail.committer}` : ""}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="bw__hash" title="Copy full hash" onClick={() => onCopy(detail.hash)}>
            {detail.shortHash}
            <Copy size={10} />
          </button>
          {isMerge && (
            <span className="bw__muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 11 }}>
              <GitMerge size={11} /> merge of {detail.parents.map((p) => p.slice(0, 7)).join(" + ")}
            </span>
          )}
        </div>
        {detail.containedIn.length > 0 && (
          <div className="bw__chips" title="Branches containing this commit">
            {detail.containedIn.map((b) => (
              <RefChip key={b} kind={b.includes("/") ? "remote" : "local"} label={b} />
            ))}
          </div>
        )}
      </div>

      <div className="bw__files-head">
        <span>{detail.files.length} file{detail.files.length === 1 ? "" : "s"}</span>
        <span className="bw__add">+{totals.add}</span>
        <span className="bw__del">−{totals.del}</span>
        {isMerge && <span style={{ marginLeft: "auto", textTransform: "none", fontWeight: 500, color: "var(--text-muted)" }}>vs first parent</span>}
      </div>
      <div className="bw__scroll">
        {detail.files.length === 0 ? (
          <div className="bw__empty">No file changes</div>
        ) : (
          groups.map(([dir, files]) => (
            <div key={dir}>
              {dir && (
                <div className="bw__dir" title={dir}>
                  <Folder size={11} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dir}</span>
                  <span style={{ marginLeft: "auto" }}>{files.length}</span>
                </div>
              )}
              {files.map((f) => (
                <div key={f.path} className="bw__file" style={dir ? undefined : { paddingLeft: 12 }} title={f.path}>
                  <span className={`bw__status-dot bw__status-dot--${f.status}`}>{STATUS_LETTER[f.status]}</span>
                  <FileText size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <span className="bw__file-name" style={f.status === "deleted" ? { textDecoration: "line-through", color: "var(--text-muted)" } : undefined}>
                    {f.path.slice(f.path.lastIndexOf("/") + 1)}
                  </span>
                  {f.additions !== undefined && (
                    <span className="bw__file-stat">
                      <DiffBar add={f.additions} del={f.deletions ?? 0} />
                      <span className="bw__add">+{f.additions}</span>
                      <span className="bw__del">−{f.deletions ?? 0}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
};
