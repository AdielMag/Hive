import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Eye, EyeOff, Gauge, Loader2, Trash2 } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import {
  JevMethods,
  type JevSettingsPatch,
  type JevSettingsView,
  type TestKeyResult,
  type UsageBucket,
  type UsageSummary,
} from "../shared.ts";
import "./jev.css";

const usd = (n: number | null, digits = 4): string => (n === null ? "n/a" : `$${n.toFixed(n >= 1 ? 2 : digits)}`);
const tok = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button type="button" role="switch" className="ui-switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
);

const Row: React.FC<{ title: string; hint: React.ReactNode; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div className="jev-row">
    <div className="jev-row__text">
      <div className="jev-row__title">{title}</div>
      <div className="jev-row__hint">{hint}</div>
    </div>
    <div className="jev-row__control">{children}</div>
  </div>
);

/** Number input that commits on blur/Enter so every keystroke doesn't hit the disk. Empty means "unset". */
const NumberField: React.FC<{
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}> = ({ value, onCommit, placeholder, prefix, min = 0, max, step, label }) => {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") return value === null ? undefined : onCommit(null);
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < min || (max !== undefined && n > max)) return setText(value === null ? "" : String(value));
    if (n !== value) onCommit(n);
  };
  return (
    <span className="jev-num">
      {prefix && <span className="jev-num__prefix">{prefix}</span>}
      <input
        className="jev-input jev-input--num"
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </span>
  );
};

const Stat: React.FC<{ label: string; bucket: UsageBucket }> = ({ label, bucket }) => (
  <div className="jev-stat">
    <div className="jev-stat__label">{label}</div>
    <div className="jev-stat__value">{bucket.costUsd === null ? `${bucket.calls} calls` : usd(bucket.costUsd)}</div>
    <div className="jev-stat__sub">
      {bucket.costUsd === null ? `${tok(bucket.inputTokens)} in` : `${bucket.calls} calls · ${tok(bucket.inputTokens)} in`}
      {bucket.failed > 0 && <span className="jev-stat__fail"> · {bucket.failed} failed</span>}
    </div>
  </div>
);

export const JevSettings: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const [settings, setSettings] = useState<JevSettingsView | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestKeyResult | "testing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const refreshUsage = useCallback(() => {
    host.ipc.invoke<UsageSummary>(JevMethods.getUsage).then((u) => alive.current && setUsage(u), () => {});
  }, [host]);

  useEffect(() => {
    host.ipc.invoke<JevSettingsView>(JevMethods.getSettings).then((s) => alive.current && setSettings(s), (e) => setError(String(e)));
    refreshUsage();
    const t = setInterval(refreshUsage, 10_000);
    return () => clearInterval(t);
  }, [host, refreshUsage]);

  const save = useCallback(
    async (patch: JevSettingsPatch) => {
      try {
        const next = await host.ipc.invoke<JevSettingsView>(JevMethods.saveSettings, patch);
        if (alive.current) {
          setSettings(next);
          setError(null);
        }
        refreshUsage();
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [host, refreshUsage],
  );

  const saveKey = async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await save({ apiKey: key });
    setKeyDraft("");
    setShowKey(false);
    await runTest();
  };

  const runTest = async () => {
    setTest("testing");
    const r = await host.ipc.invoke<TestKeyResult>(JevMethods.testKey).catch((e): TestKeyResult => ({ ok: false, error: String(e) }));
    if (alive.current) setTest(r);
  };

  if (!settings) return <div className="jev">{error ? <p className="jev-error">{error}</p> : <Loader2 className="jev-spin" size={16} />}</div>;

  return (
    <div className="jev">
      <section className="jev-card jev-card--hero">
        <div className="jev-card__head">
          <span className="jev-icon">
            <Gauge size={18} />
          </span>
          <div>
            <h3 className="jev-card__title">Jev</h3>
            <p className="jev-card__desc">
              TypeSafe's fast decision model. Hive uses it to suggest when to compact and to give the agent an <code>ask_jev</code> tool. Requests go
              straight from your machine to <code>api.typesafe.ai</code> with your key; nothing passes through Hive servers.
            </p>
          </div>
        </div>

        <div className="jev-keyrow">
          <input
            className="jev-input jev-input--key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            aria-label="TypeSafe API key"
            placeholder={settings.hasKey ? `Key saved (${settings.keyHint}). Paste a new one to replace it` : "Paste your TypeSafe API key"}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void saveKey()}
          />
          <button className="jev-btn jev-btn--ghost" type="button" onClick={() => setShowKey((v) => !v)} title={showKey ? "Hide" : "Show"} aria-label={showKey ? "Hide key" : "Show key"}>
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button className="jev-btn" type="button" disabled={!keyDraft.trim()} onClick={() => void saveKey()}>
            Save key
          </button>
          <button className="jev-btn jev-btn--ghost" type="button" disabled={!settings.hasKey || test === "testing"} onClick={() => void runTest()}>
            Test
          </button>
          {settings.hasKey && (
            <button className="jev-btn jev-btn--ghost" type="button" onClick={() => void save({ apiKey: "" }).then(() => setTest(null))} title="Remove the saved key">
              <Trash2 size={13} />
            </button>
          )}
        </div>

        <div className="jev-status" role="status">
          {test === "testing" && (
            <>
              <Loader2 size={13} className="jev-spin" /> Checking key…
            </>
          )}
          {test && test !== "testing" && test.ok && (
            <span className="jev-ok">
              <CheckCircle2 size={13} /> Key works{test.models?.length ? ` · models: ${test.models.join(", ")}` : ""}
            </span>
          )}
          {test && test !== "testing" && !test.ok && (
            <span className="jev-bad">
              <CircleAlert size={13} /> {test.error}
            </span>
          )}
          {!test && !settings.hasKey && <span className="jev-muted">No key yet. Jev features stay off until you save one.</span>}
          {error && <span className="jev-bad">{error}</span>}
        </div>
        {test && test !== "testing" && test.ok && test.balanceHeaders && (
          <div className="jev-muted">Balance info reported by the API: {Object.entries(test.balanceHeaders).map(([k, v]) => `${k}: ${v}`).join(", ")}</div>
        )}
      </section>

      <section className="jev-card">
        <h4 className="jev-card__sub">Spend</h4>
        <p className="jev-card__desc">
          TypeSafe's API doesn't expose your balance or pricing, so Hive counts the input tokens each call reports (output tokens are free) and prices them with the rate you enter.
          Enter your loaded credit to see an estimate of what's left.
        </p>
        {usage && (
          <div className="jev-stats">
            <Stat label="Today" bucket={usage.today} />
            <Stat label="Last 7 days" bucket={usage.last7d} />
            <Stat label="All time" bucket={usage.total} />
            <div className="jev-stat jev-stat--remaining">
              <div className="jev-stat__label">Credit left (est.)</div>
              <div className="jev-stat__value">{usd(usage.remainingUsd, 2)}</div>
              <div className="jev-stat__sub">{usage.remainingUsd === null ? "set price and credit below" : "from the credit you entered"}</div>
            </div>
          </div>
        )}
        {usage?.lastError && <div className="jev-bad jev-lasterr">Last error: {usage.lastError.message}</div>}
        <Row title="Price per 1M input tokens" hint="From your TypeSafe plan. Used only for the estimates above.">
          <NumberField label="Price per million input tokens" prefix="$" placeholder="e.g. 0.10" step={0.01} value={settings.pricePerMTokUsd} onCommit={(v) => void save({ pricePerMTokUsd: v })} />
        </Row>
        <Row title="Credit you loaded" hint="Spend is counted from the moment you change this figure.">
          <NumberField label="Credit in USD" prefix="$" placeholder="e.g. 5" step={1} value={settings.creditUsd} onCommit={(v) => void save({ creditUsd: v })} />
        </Row>
        <Row title="Daily call limit" hint="Stops Jev calls for the rest of the day once reached (all sessions). 0 means unlimited.">
          <NumberField label="Calls per day" value={settings.maxCallsPerDay} onCommit={(v) => void save({ maxCallsPerDay: v ?? 0 })} />
        </Row>
        {usage && usage.total.calls > 0 && (
          <div className="jev-actions">
            <button className="jev-btn jev-btn--ghost" type="button" onClick={() => void host.ipc.invoke<UsageSummary>(JevMethods.clearUsage).then(setUsage)}>
              Reset usage log
            </button>
          </div>
        )}
      </section>

      <section className="jev-card">
        <h4 className="jev-card__sub">Features</h4>
        <Row
          title="Smart compaction hint"
          hint="After a finished turn, Jev checks whether this is a natural stopping point. Hive then shows a hint above the composer (never mid-task) with a one-click Compact button. Pi's own auto-compaction stays as the safety net. Takes effect on the next turn."
        >
          <Switch label="Smart compaction hint" checked={settings.compact.enabled} onChange={(v) => void save({ compact: { enabled: v } })} />
        </Row>
        <Row title="Only check above" hint="Below this share of the context window Jev is not called at all, which saves cost.">
          <NumberField label="Context percentage floor" value={settings.compact.floorPct} max={95} onCommit={(v) => void save({ compact: { floorPct: v ?? 40 } })} prefix="%" />
        </Row>
        <Row title="ask_jev tool" hint="Lets the agent ask Jev typed yes/no, choice or score questions about files or read-only command output without loading them into its own context. Applies to new sessions.">
          <Switch label="ask_jev tool" checked={settings.askJev.enabled} onChange={(v) => void save({ askJev: { enabled: v } })} />
        </Row>
      </section>
    </div>
  );
};
