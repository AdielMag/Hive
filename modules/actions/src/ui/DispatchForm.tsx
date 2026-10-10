import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileCode2, GitBranch, Info, Play, Search } from "lucide-react";
import type { ActionsWorkflow, WorkflowInput } from "../shared.ts";
import { formatAgo } from "@hive/module-sdk/format";
import { actionsApi } from "./actions-host.ts";
import { useActionsStore } from "./actions-store.ts";
import { lastRunByWorkflow } from "./group-runs.ts";
import { StatusIcon } from "./StatusIcon.tsx";

const SEARCH_THRESHOLD = 6;
const MAX_REF_CHIPS = 6;

const fileName = (path: string) => path.split("/").pop() ?? path;

/** Segmented control when a choice has few short options, otherwise a select. */
function useSegmented(options: string[]): boolean {
  return options.length > 1 && options.length <= 4 && options.every((o) => o.length <= 14);
}

const InputField: React.FC<{ input: WorkflowInput; value: string; onChange: (v: string) => void }> = ({ input, value, onChange }) => {
  const options = input.options ?? [];
  const segmented = useSegmented(options);
  const label = (
    <span className="ga-rf__label">
      {input.name}
      {input.required && <span className="ga-req">Required</span>}
    </span>
  );
  const help = input.description ? <span className="ga-rf__help">{input.description}</span> : null;

  if (input.type === "boolean") {
    return (
      <label className="ga-rf ga-rf--switch">
        <span className="ga-rf__text">
          {label}
          {help}
        </span>
        <input type="checkbox" role="switch" className="ga-switch" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
      </label>
    );
  }
  return (
    <div className="ga-rf">
      {label}
      {help}
      {input.type === "choice" && segmented ? (
        <div className="ga-seg" role="radiogroup" aria-label={input.name}>
          {options.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o} className={`ga-seg__btn${value === o ? " is-on" : ""}`} onClick={() => onChange(o)}>
              {o}
            </button>
          ))}
        </div>
      ) : input.type === "choice" ? (
        <select className="ga-select" aria-label={input.name} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="ga-input"
          aria-label={input.name}
          type={input.type === "number" ? "number" : "text"}
          placeholder={input.default ? `Default: ${input.default}` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      )}
    </div>
  );
};

const WorkflowCard: React.FC<{ workflow: ActionsWorkflow; selected: boolean; onPick: () => void }> = ({ workflow, selected, onPick }) => {
  const last = useActionsStore((s) => lastRunByWorkflow(s.runs).get(workflow.id));
  return (
    <button type="button" role="radio" aria-checked={selected} className={`ga-wf${selected ? " is-on" : ""}`} onClick={onPick}>
      <span className="ga-wf__icon">{last ? <StatusIcon state={last.state} size={12} disc /> : <FileCode2 size={14} />}</span>
      <span className="ga-wf__main">
        <span className="ga-wf__name">{workflow.name}</span>
        <span className="ga-wf__file">{fileName(workflow.path)}</span>
      </span>
      <span className="ga-wf__meta">
        {last ? formatAgo(Date.parse(last.createdAt), Date.now()) : "never run"}
        {selected && <Check size={13} className="ga-wf__check" />}
      </span>
    </button>
  );
};

/** Full-height sheet to trigger a `workflow_dispatch` run: pick a workflow, a ref, then fill its inputs. */
export const DispatchForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const repo = useActionsStore((s) => s.repo);
  const workflows = useActionsStore((s) => s.workflows);
  const runs = useActionsStore((s) => s.runs);
  const dispatchWorkflow = useActionsStore((s) => s.dispatchWorkflow);
  const active = useMemo(() => workflows.filter((w) => w.active), [workflows]);
  const [workflowId, setWorkflowId] = useState<number | null>(active[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [ref, setRef] = useState(repo?.branch ?? "main");
  const [meta, setMeta] = useState<{ dispatchable: boolean; inputs: WorkflowInput[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const workflow = active.find((w) => w.id === workflowId);

  const refChips = useMemo(() => {
    const seen = new Set<string>();
    for (const b of [repo?.branch, ...runs.map((r) => r.branch)]) if (b) seen.add(b);
    return [...seen].slice(0, MAX_REF_CHIPS);
  }, [repo?.branch, runs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const missing = meta?.inputs.filter((i) => i.required && i.type !== "boolean" && !values[i.name]?.trim()) ?? [];
  const canRun = !!workflow && !!ref.trim() && meta?.dispatchable === true && missing.length === 0 && !busy;
  const loading = !!workflow && !!ref.trim() && !meta && !loadError;
  const q = query.trim().toLowerCase();
  const shown = active.filter((w) => !q || w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q));
  const setValue = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  let hint = "";
  if (!workflow) hint = "Pick a workflow";
  else if (!ref.trim()) hint = "Choose a branch or tag";
  else if (loadError) hint = "Could not read the workflow";
  else if (meta && !meta.dispatchable) hint = "No manual trigger on this ref";
  else if (missing.length > 0) hint = `Fill in ${missing[0]?.name}${missing.length > 1 ? ` and ${missing.length - 1} more` : ""}`;

  const submit = () => {
    if (!workflow || !canRun) return;
    setBusy(true);
    const inputs = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
    void dispatchWorkflow(workflow, ref.trim(), inputs).then((ok) => {
      setBusy(false);
      if (ok) onClose();
    });
  };

  return (
    <form
      className="ga-rs"
      aria-label="Run workflow"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <header className="ga-rs__head">
        <button type="button" className="ga-ib" title="Back (Esc)" aria-label="Back to runs" onClick={onClose}>
          <ArrowLeft size={14} />
        </button>
        <div className="ga-rs__titles">
          <span className="ga-rs__title">Run workflow</span>
          <span className="ga-rs__sub">Start a run by hand on {repo ? `${repo.owner}/${repo.repo}` : "this repo"}</span>
        </div>
      </header>

      <div className="ga-rs__body">
        <section className="ga-rs__sec">
          <h3 className="ga-rs__h">Workflow</h3>
          {active.length > SEARCH_THRESHOLD && (
            <label className="ga-rs__search">
              <Search size={12} />
              <input placeholder="Find workflow" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
            </label>
          )}
          {active.length === 0 ? (
            <div className="ga-rs__note">This repo has no active workflows.</div>
          ) : (
            <div className="ga-wfs" role="radiogroup" aria-label="Workflow">
              {shown.map((w) => (
                <WorkflowCard key={w.id} workflow={w} selected={w.id === workflowId} onPick={() => setWorkflowId(w.id)} />
              ))}
              {shown.length === 0 && <div className="ga-rs__note">No workflow matches.</div>}
            </div>
          )}
        </section>

        <section className="ga-rs__sec">
          <h3 className="ga-rs__h">Run on</h3>
          <div className="ga-refs" role="radiogroup" aria-label="Branch or tag">
            {refChips.map((b) => (
              <button key={b} type="button" role="radio" aria-checked={ref === b} className={`ga-chip-btn${ref === b ? " is-on" : ""}`} onClick={() => setRef(b)}>
                <GitBranch size={12} />
                <span className="ga-chip-btn__label">{b}</span>
                {b === repo?.branch && <span className="ga-refs__tag">current</span>}
              </button>
            ))}
          </div>
          <label className="ga-input-wrap">
            <GitBranch size={12} />
            <input className="ga-input ga-input--bare" aria-label="Branch or tag" placeholder="Or type any branch or tag" value={ref} onChange={(e) => setRef(e.target.value)} spellCheck={false} />
          </label>
        </section>

        {workflow && (
          <section className="ga-rs__sec">
            <h3 className="ga-rs__h">Inputs</h3>
            {loading && (
              <div className="ga-skel" aria-hidden="true">
                <div className="ga-skel__line" style={{ width: "40%" }} />
                <div className="ga-skel__line" style={{ height: 24 }} />
              </div>
            )}
            {loadError && (
              <div className="ga-rs__card ga-rs__card--error" role="alert">
                {loadError}
              </div>
            )}
            {meta && !meta.dispatchable && (
              <div className="ga-rs__card">
                <div className="ga-rs__card-head">
                  <Info size={14} />
                  <span>
                    {fileName(workflow.path)} can't be started by hand on <b>{ref}</b>
                  </span>
                </div>
                <div className="ga-rs__note">Add a manual trigger to the workflow file, then push it:</div>
                <pre className="ga-code">{"on:\n  workflow_dispatch:"}</pre>
              </div>
            )}
            {meta?.dispatchable && meta.inputs.length === 0 && <div className="ga-rs__note">No inputs. Ready to run.</div>}
            {meta?.dispatchable && meta.inputs.map((i) => <InputField key={i.name} input={i} value={values[i.name] ?? ""} onChange={(v) => setValue(i.name, v)} />)}
          </section>
        )}
      </div>

      <footer className="ga-rs__foot">
        <div className="ga-rs__summary">
          {canRun || busy ? (
            <>
              <span className="ga-rs__what">{workflow?.name}</span>
              <span className="ga-rs__where">
                <GitBranch size={10} /> {ref.trim()}
              </span>
            </>
          ) : (
            <span className="ga-rs__hint">{hint}</span>
          )}
        </div>
        <button type="submit" className="ga-btn ga-btn--primary" disabled={!canRun}>
          <Play size={11} fill="currentColor" />
          {busy ? "Starting..." : "Run workflow"}
        </button>
      </footer>
    </form>
  );
};
