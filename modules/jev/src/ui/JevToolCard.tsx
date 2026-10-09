/**
 * Transcript row for `ask_jev` calls. Collapsed: "Ask Jev", what went in, the answers as chips and the latency.
 * Expanded: In (questions + sources) | Out (answers as bars/scales + cost footer) | Raw (Hive's stock view +
 * details JSON). Degrades for calls made before the rich `details` existed: In from the arguments, Out from
 * `details.answers`; no details at all leaves only Raw.
 */
import React, { useState } from "react";
import { AlertCircle, ChevronRight, Gauge, Loader2 } from "lucide-react";
import type { ToolCardProps } from "@hive/module-sdk/renderer";
import type { JevAnswer } from "../shared.ts";
import {
  answerChip,
  buildCardModel,
  estimateCostUsd,
  formatBytes,
  formatTokens,
  formatUsd,
  rankedChoices,
  scoreLabel,
  scoreLevels,
  summaryText,
  type CardAnswer,
  type CardItem,
  type CardModel,
  type CardQuestion,
  type CardTab,
} from "./jev-card-model.ts";
import "./jev.css";

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const TAB_LABEL: Record<CardTab, string> = { in: "In", out: "Out", raw: "Raw" };
const TYPE_LABEL: Record<string, string> = { noul: "yes/no", choice: "choice", score: "score", unknown: "?" };

export const JevToolCard: React.FC<ToolCardProps> = ({ call, RawBody }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CardTab | null>(null);
  const m = buildCardModel(call);
  const active: CardTab = tab && m.tabs.includes(tab) ? tab : m.defaultTab;
  const summary = summaryText(m);

  return (
    <div className={`jev-tool${open ? " is-open" : ""}${m.status === "error" ? " is-error" : ""}`}>
      <button type="button" className="jev-tool__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight size={13} className="jev-tool__chevron" />
        <span className="jev-tool__icon">
          <Gauge size={13} />
        </span>
        <span className="jev-tool__name">Ask Jev</span>
        {summary && (
          <span className="jev-tool__summary" title={summary}>
            {summary}
          </span>
        )}
        <span className="jev-tool__chips">
          {m.status === "error" ? (
            <span className="jev-tool__err" title={m.error}>
              {m.error}
            </span>
          ) : (
            m.answers.map((a) => (
              <span key={a.name} className={`jev-chip${a.confidence !== null && a.confidence < 0.65 ? " is-weak" : ""}`} title={chipTitle(a)}>
                {answerChip(a)}
              </span>
            ))
          )}
        </span>
        {m.ms !== undefined && <span className="jev-tool__ms">{m.ms}ms</span>}
        {m.status === "running" ? (
          <Loader2 size={13} className="jev-spin jev-tool__status" />
        ) : m.status === "error" ? (
          <AlertCircle size={13} className="jev-tool__status is-error" />
        ) : null}
      </button>
      {open && (
        <div className="jev-tool__body">
          {m.tabs.length > 1 && (
            <div className="jev-tabs" role="tablist">
              {m.tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active === t}
                  className={`jev-tab${active === t ? " is-active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
          )}
          {active === "in" && <InView m={m} />}
          {active === "out" && <OutView m={m} />}
          {active === "raw" && <RawView m={m} RawBody={RawBody} />}
        </div>
      )}
    </div>
  );
};

function chipTitle(a: CardAnswer): string {
  const conf = a.confidence !== null ? ` · confidence ${pct(a.confidence)}` : "";
  return `${a.question?.instructions ?? a.name}${conf}`;
}

// ---------------------------------------------------------------------------------------------------------
// In
// ---------------------------------------------------------------------------------------------------------

export const InView: React.FC<{ m: CardModel }> = ({ m }) => {
  const files = m.sources?.files ?? m.files.map((path) => ({ path, bytes: undefined as number | undefined, preview: undefined as string | undefined, truncated: false }));
  const command = m.sources?.command ?? (m.command ? { command: m.command, bytes: undefined as number | undefined, preview: undefined as string | undefined, truncated: false } : undefined);
  return (
    <div className="jev-pane">
      {m.status === "error" && m.error && <div className="jev-pane__error">{m.error}</div>}
      <div className="jev-pane__label">Questions</div>
      {m.questions.length === 0 && <div className="jev-muted">{m.status === "running" ? "Waiting for arguments…" : "No questions."}</div>}
      {m.questions.map((q) => (
        <QuestionRow key={q.name} q={q} />
      ))}
      {m.batch ? (
        <>
          <div className="jev-pane__label">Items ({m.items.length})</div>
          {m.items.length === 0 && <div className="jev-muted">None.</div>}
          {m.items.map((it, i) => (
            <ItemSources key={i} item={it} />
          ))}
        </>
      ) : (
        <>
      <div className="jev-pane__label">Sources</div>
      {!m.state && files.length === 0 && !command && <div className="jev-muted">None.</div>}
      {m.state && (
        <SourceRow label="text" size={`${m.sources?.stateChars ?? m.state.length} chars`} preview={m.state.slice(0, 4096)} truncated={m.state.length > 4096} />
      )}
      {files.map((f, i) => (
        <SourceRow key={`${i}:${f.path}`} label={f.path} mono size={f.bytes !== undefined ? formatBytes(f.bytes) : undefined} preview={f.preview} truncated={f.truncated} />
      ))}
      {command && (
        <SourceRow label={`$ ${command.command}`} mono size={command.bytes !== undefined ? formatBytes(command.bytes) : undefined} preview={command.preview} truncated={command.truncated} />
      )}
        </>
      )}
    </div>
  );
};

/** One batch item in the In tab: its id and sources (sizes and previews once the result is in, else the arguments). */
const ItemSources: React.FC<{ item: CardItem }> = ({ item }) => {
  const files = item.sources?.files ?? item.files.map((path) => ({ path, bytes: undefined as number | undefined, preview: undefined as string | undefined, truncated: false }));
  const command = item.sources?.command ?? (item.command ? { command: item.command, bytes: undefined as number | undefined, preview: undefined as string | undefined, truncated: false } : undefined);
  const stateChars = item.sources?.stateChars || item.state?.length || 0;
  return (
    <div className="jev-item">
      <div className="jev-item__head">
        <span className="jev-q__name">{item.id}</span>
        {item.status === "error" && <span className="jev-item__err">failed</span>}
      </div>
      {stateChars > 0 && <SourceRow label="text" size={`${stateChars} chars`} preview={item.state?.slice(0, 512)} truncated={(item.state?.length ?? 0) > 512} />}
      {files.map((f, i) => (
        <SourceRow key={`${i}:${f.path}`} label={f.path} mono size={f.bytes !== undefined ? formatBytes(f.bytes) : undefined} preview={f.preview} truncated={f.truncated} />
      ))}
      {command && <SourceRow label={`$ ${command.command}`} mono size={command.bytes !== undefined ? formatBytes(command.bytes) : undefined} preview={command.preview} truncated={command.truncated} />}
      {item.status === "error" && item.error && <div className="jev-pane__error">{item.error}</div>}
    </div>
  );
};

const QuestionRow: React.FC<{ q: CardQuestion }> = ({ q }) => (
  <div className="jev-q">
    <div className="jev-q__head">
      <span className={`jev-badge jev-badge--${q.type}`}>{TYPE_LABEL[q.type]}</span>
      <span className="jev-q__name">{q.name}</span>
      <span className="jev-q__text">{q.instructions}</span>
    </div>
    {(q.trueMeans || q.falseMeans) && (
      <ul className="jev-q__list">
        {q.trueMeans && (
          <li>
            <b>yes</b> {q.trueMeans}
          </li>
        )}
        {q.falseMeans && (
          <li>
            <b>no</b> {q.falseMeans}
          </li>
        )}
      </ul>
    )}
    {q.options && (
      <ul className="jev-q__list">
        {q.options.map(([k, v]) => (
          <li key={k}>
            <b>{k}</b> {v}
          </li>
        ))}
      </ul>
    )}
    {q.levels && (
      <ol className="jev-q__list jev-q__list--levels" start={0}>
        {q.levels.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    )}
  </div>
);

const SourceRow: React.FC<{ label: string; size?: string; preview?: string; truncated?: boolean; mono?: boolean }> = ({ label, size, preview, truncated, mono }) => {
  const head = (
    <>
      <span className={`jev-src__label${mono ? " mono" : ""}`}>{label}</span>
      {size && <span className="jev-src__size">{size}</span>}
    </>
  );
  if (!preview) return <div className="jev-src">{head}</div>;
  return (
    <details className="jev-src">
      <summary>{head}</summary>
      <pre className="jev-src__pre">
        {preview}
        {truncated && <span className="jev-muted">{"\n"}… preview truncated (4 KB)</span>}
      </pre>
    </details>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Out
// ---------------------------------------------------------------------------------------------------------

export const OutView: React.FC<{ m: CardModel }> = ({ m }) => {
  const d = m.details;
  const input = typeof d?.inputTokens === "number" ? d.inputTokens : null;
  const output = typeof d?.outputTokens === "number" ? d.outputTokens : null;
  return (
    <div className="jev-pane">
      {m.batch ? (
        m.items.map((it, i) => (
          <details key={i} className={`jev-group${it.status === "error" ? " is-error" : ""}`} open={m.items.length <= 3}>
            <summary className="jev-group__head">
              <span className="jev-q__name">{it.id}</span>
              {it.status === "error" ? (
                <span className="jev-item__err" title={it.error}>
                  {it.error ?? "failed"}
                </span>
              ) : (
                it.answers.map((a) => (
                  <span key={a.name} className={`jev-chip${a.confidence !== null && a.confidence < 0.65 ? " is-weak" : ""}`} title={chipTitle(a)}>
                    {answerChip(a)}
                  </span>
                ))
              )}
            </summary>
            <div className="jev-group__body">
              {it.answers.map((a) => (
                <AnswerBlock key={a.name} a={a} />
              ))}
            </div>
          </details>
        ))
      ) : (
        m.answers.map((a) => <AnswerBlock key={a.name} a={a} />)
      )}
      <div className="jev-foot">
        {d?.model && <span>{d.model}</span>}
        {input !== null && <span>{formatTokens(input)} in</span>}
        {output !== null && <span>{formatTokens(output)} out</span>}
        {m.ms !== undefined && <span>{m.ms} ms</span>}
        {input !== null && <span title="Input tokens at the list price">{formatUsd(estimateCostUsd(input))} est.</span>}
        {typeof d?.savedTokensEst === "number" && d.savedTokensEst > 0 && (
          <span title="File and command bytes / 4: context the agent didn't have to read">~{formatTokens(d.savedTokensEst)} tokens saved (est.)</span>
        )}
      </div>
    </div>
  );
};

const AnswerBlock: React.FC<{ a: CardAnswer }> = ({ a }) => (
  <div className="jev-ans">
    <div className="jev-ans__head">
      <span className={`jev-badge jev-badge--${a.answer.type}`}>{TYPE_LABEL[a.answer.type]}</span>
      <span className="jev-q__name">{a.name}</span>
      {a.question?.instructions && <span className="jev-q__text">{a.question.instructions}</span>}
    </div>
    <AnswerViz a={a} />
  </div>
);

const AnswerViz: React.FC<{ a: CardAnswer }> = ({ a }) => {
  const ans: JevAnswer = a.answer;
  if (ans.type === "noul") {
    const yes = ans.noul >= 0.5;
    return (
      <div className="jev-viz">
        <div className="jev-bar-row">
          <span className="jev-bar-row__label">no</span>
          <div className="jev-meter" title={`p(yes) = ${ans.noul.toFixed(3)}`}>
            <div className="jev-meter__fill" style={{ width: pct(ans.noul) }} />
            <div className="jev-meter__mid" />
          </div>
          <span className="jev-bar-row__label">yes</span>
          <span className="jev-bar-row__value">
            {yes ? `${pct(ans.noul)} yes` : `${pct(1 - ans.noul)} no`}
          </span>
        </div>
      </div>
    );
  }
  if (ans.type === "choice") {
    const ranked = rankedChoices(ans, a.question);
    const desc = new Map(a.question?.options ?? []);
    return (
      <div className="jev-viz">
        {ranked.map(([k, p]) => (
          <div key={k} className={`jev-bar-row${k === ans.choice ? " is-winner" : ""}`} title={desc.get(k)}>
            <span className="jev-bar-row__label jev-bar-row__label--wide">{k}</span>
            <div className="jev-meter">
              <div className="jev-meter__fill" style={{ width: pct(p) }} />
            </div>
            <span className="jev-bar-row__value">{pct(p)}</span>
          </div>
        ))}
        {a.confidence !== null && <div className="jev-muted">confidence {pct(a.confidence)}</div>}
      </div>
    );
  }
  const levels = scoreLevels(ans, a.question);
  const max = Math.max(1, levels.length - 1);
  const pos = Math.min(1, Math.max(0, ans.score / max));
  const label = scoreLabel(ans, a.question?.levels);
  return (
    <div className="jev-viz">
      <div className="jev-scale" title={`score ${ans.score.toFixed(2)}`}>
        <div className="jev-scale__track">
          {levels.map((l, i) => (
            <span key={i} className="jev-scale__tick" style={{ left: pct(i / max) }} title={l.label} />
          ))}
          <span className="jev-scale__marker" style={{ left: pct(pos) }} />
        </div>
        <div className="jev-scale__labels">
          {levels.map((l, i) => (
            <span key={i} className={`jev-scale__label${Math.round(ans.score) === i ? " is-active" : ""}`} title={l.label}>
              {l.label}
              {l.p !== null && <em> {pct(l.p)}</em>}
            </span>
          ))}
        </div>
      </div>
      <div className="jev-muted">
        score {ans.score.toFixed(2)}
        {label ? ` (~${label})` : ""}
        {a.confidence !== null ? ` · confidence ${pct(a.confidence)}` : ""}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Raw
// ---------------------------------------------------------------------------------------------------------

export const RawView: React.FC<{ m: CardModel; RawBody: React.ComponentType }> = ({ m, RawBody }) => (
  <div className="jev-raw">
    <RawBody />
    {m.details && (
      <div className="jev-raw__details">
        <div className="jev-pane__label">details</div>
        <pre className="jev-src__pre">{JSON.stringify(m.details, null, 2)}</pre>
      </div>
    )}
  </div>
);
