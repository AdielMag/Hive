import React, { useEffect, useState } from "react";
import { GitBranch, Play, X } from "lucide-react";
import type { WorkflowInput } from "../shared.ts";
import { actionsApi } from "./actions-host.ts";
import { useActionsStore } from "./actions-store.ts";

/** Card to trigger a `workflow_dispatch` run: pick workflow, ref, and fill its declared inputs. */
export const DispatchForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const repo = useActionsStore((s) => s.repo);
  const workflows = useActionsStore((s) => s.workflows);
  const dispatchWorkflow = useActionsStore((s) => s.dispatchWorkflow);
  const active = workflows.filter((w) => w.active);
  const [workflowId, setWorkflowId] = useState<number | null>(active[0]?.id ?? null);
  const [ref, setRef] = useState(repo?.branch ?? "main");
  const [meta, setMeta] = useState<{ dispatchable: boolean; inputs: WorkflowInput[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const workflow = active.find((w) => w.id === workflowId);

  useEffect(() => {
    setMeta(null);
    setLoadError(null);
    if (!repo || !workflow || !ref.trim()) return;
    let cancelled = false;
    // Debounce so typing a ref does not fire a request per keystroke.
    const t = setTimeout(() => {
      void actionsApi()
        .workflowInputs(repo, workflow.path, ref.trim())
        .then((res) => {
          if (cancelled) return;
          if (!res.ok) return setLoadError(res.message);
          setMeta(res.data);
          setValues(Object.fromEntries(res.data.inputs.map((i) => [i.name, i.default ?? (i.type === "choice" ? (i.options?.[0] ?? "") : "")])));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [repo, workflow, ref]);

  const missing = meta?.inputs.some((i) => i.required && !values[i.name]?.trim()) ?? false;
  const canRun = !!workflow && !!ref.trim() && meta?.dispatchable === true && !missing && !busy;
  const setValue = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  return (
    <form
      className="ga-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        if (!workflow || !canRun) return;
        setBusy(true);
        const inputs = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
        void dispatchWorkflow(workflow, ref.trim(), inputs).then((ok) => {
          setBusy(false);
          if (ok) onClose();
        });
      }}
    >
      <div className="ga-sheet__head">
        <Play size={13} />
        <span>Run workflow</span>
        <button type="button" className="ga-ib ga-sheet__x" title="Close" aria-label="Close" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <label className="ga-field">
        <span>Workflow</span>
        <select className="ga-select" value={workflowId ?? ""} onChange={(e) => setWorkflowId(Number(e.target.value))}>
          {active.length === 0 && <option value="">No workflows</option>}
          {active.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ga-field">
        <span>Branch or tag</span>
        <span className="ga-input-wrap">
          <GitBranch size={12} />
          <input className="ga-input ga-input--bare" value={ref} onChange={(e) => setRef(e.target.value)} spellCheck={false} />
        </span>
      </label>
      {loadError && <div className="ga-sheet__err">{loadError}</div>}
      {meta && !meta.dispatchable && <div className="ga-sheet__err">This workflow has no workflow_dispatch trigger on {ref}.</div>}
      {meta?.dispatchable &&
        meta.inputs.map((i) => (
          <label key={i.name} className={`ga-field${i.type === "boolean" ? " ga-field--inline" : ""}`} title={i.description}>
            <span>
              {i.name}
              {i.required ? " *" : ""}
              {i.description && <span className="ga-dim"> {i.description}</span>}
            </span>
            {i.type === "boolean" ? (
              <input
                type="checkbox"
                role="switch"
                className="ga-switch"
                checked={values[i.name] === "true"}
                onChange={(e) => setValue(i.name, e.target.checked ? "true" : "false")}
              />
            ) : i.type === "choice" ? (
              <select className="ga-select" value={values[i.name] ?? ""} onChange={(e) => setValue(i.name, e.target.value)}>
                {(i.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="ga-input"
                type={i.type === "number" ? "number" : "text"}
                value={values[i.name] ?? ""}
                onChange={(e) => setValue(i.name, e.target.value)}
                spellCheck={false}
              />
            )}
          </label>
        ))}
      <button type="submit" className="ga-btn ga-btn--primary ga-btn--block" disabled={!canRun}>
        {busy ? "Triggering..." : "Run workflow"}
      </button>
    </form>
  );
};
