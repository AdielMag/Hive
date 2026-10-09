import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Eye,
  EyeOff,
  Gauge,
  Loader2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import {
  INSIGHTS_TAB_ID,
  INSIGHTS_TAB_KIND,
  JevMethods,
  MAIN_MODEL_PRICE_PER_MTOK_USD,
  type JevSettingsPatch,
  type JevSettingsView,
  type TestKeyResult,
  type UsageBucket,
  type UsageSummary,
} from "../shared.ts";
import "./jev.css";

const usd = (n: number | null, digits = 4): string => (n === null ? "n/a" : `$${n.toFixed(n >= 1 ? 2 : n > 0 && n < 0.0001 ? 6 : digits)}`);
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
    <div className="jev-stat__value">{tok(bucket.inputTokens)} tokens</div>
    <div className="jev-stat__sub">
      {`${usd(bucket.costUsd)} · ${bucket.calls} calls`}
      {bucket.failed > 0 && <span className="jev-stat__fail"> · {bucket.failed} failed</span>}
    </div>
  </div>
);

const FEATURE_LABEL: Record<string, string> = { compact: "Compaction hints", ask_jev: "ask_jev tool" };

/** Per-feature split of the usage log (compaction hints vs ask_jev). */
export const FeatureSplit: React.FC<{ byFeature: Record<string, UsageBucket> }> = ({ byFeature }) => {
  const rows = Object.entries(byFeature).sort((a, b) => b[1].calls - a[1].calls);
  if (rows.length === 0) return null;
  return (
    <div className="jev-stats jev-stats--features" aria-label="Usage by feature">
      {rows.map(([name, b]) => (
        <div className="jev-stat" key={name}>
          <div className="jev-stat__label">{FEATURE_LABEL[name] ?? name}</div>
          <div className="jev-stat__value">{tok(b.inputTokens)} tokens</div>
          <div className="jev-stat__sub">
            {`${usd(b.costUsd)} · ${b.calls} calls`}
            {b.failed > 0 && <span className="jev-stat__fail"> · {b.failed} failed</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

export interface JevSettingsProps {
  host: ModuleHost;
  focus?: { providerId: string; reason?: string } | null;
}

export const JevSettings: React.FC<JevSettingsProps> = ({ host, focus }) => {
  const [settings, setSettings] = useState<JevSettingsView | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestKeyResult | "testing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [agree, setAgree] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const isFocus = focus?.providerId === "jev";

  useEffect(() => {
    if (isFocus) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocus]);

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

  const openInsights = () => {
    host.tabs.open({ id: INSIGHTS_TAB_ID, kind: INSIGHTS_TAB_KIND, title: "Jev insights", reuse: (t) => t.kind === INSIGHTS_TAB_KIND });
    // Settings is a modal over the workbench; it closes on Escape, so the new tab isn't hidden behind it.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  };

  const saveKey = async () => {
    const key = keyDraft.trim();
    if (!key) return;
    if (!settings?.consentAt && !agree) return;
    await save({ apiKey: key, ...(settings?.consentAt ? {} : { consentAt: Date.now() }) });
    setKeyDraft("");
    setShowKey(false);
    await runTest();
  };

  const runTest = async () => {
    setTest("testing");
    const r = await host.ipc.invoke<TestKeyResult>(JevMethods.testKey).catch((e): TestKeyResult => ({ ok: false, error: String(e) }));
    if (alive.current) setTest(r);
  };

  if (!settings) {
    return (
      <div className="ui-card settings__account jev-account-card">
        <div className="settings__account-head">
          <div className="quota-card__logo">
            <Gauge size={18} color="var(--accent-base)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ui-row__title">Jev</div>
            <div className="ui-row__hint">Loading decision model settings…</div>
          </div>
          <Loader2 className="jev-spin" size={14} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`ui-card settings__account jev-account-card${isFocus ? " is-focus" : ""}${expanded ? " is-expanded" : ""}`}
    >
      {isFocus && (
        <div className="settings__notice">
          <CircleAlert size={14} />
          <span>{focus?.reason || "TypeSafe Jev decision model settings"}</span>
        </div>
      )}

      <div
        className="settings__account-head jev-account-head"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setExpanded((v) => !v))}
      >
        <div className="quota-card__logo">
          <Gauge size={18} color="var(--accent-base)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ui-row__title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Jev</span>
            <span className="ui-chip jev-chip-tag">TypeSafe</span>
          </div>
          <div className="ui-row__hint">
            {settings.hasKey ? `Key saved (${settings.keyHint}) · Fast decision model` : "Fast decision model · api.typesafe.ai"}
          </div>
        </div>
        {settings.hasKey && settings.consentAt ? (
          <span className="ui-chip ui-chip--ok">
            <CheckCircle2 size={11} /> Connected
          </span>
        ) : settings.hasKey ? (
          <span className="ui-chip">
            <CircleAlert size={11} /> Consent needed
          </span>
        ) : (
          <span className="ui-chip">
            <CircleAlert size={11} /> Not connected
          </span>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon jev-expand-btn"
          aria-label={expanded ? "Collapse Jev settings" : "Expand Jev settings"}
          title={expanded ? "Collapse settings" : "Expand settings"}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {!expanded && (
        <div className="settings__account-actions">
          <span className="ui-row__hint">
            {settings.hasKey && !settings.consentAt
              ? "Accept the privacy notice to turn Jev on"
              : settings.hasKey
              ? `${settings.compact.enabled ? "Compaction hints on" : "Compaction off"} · ${settings.askJev.enabled ? "ask_jev on" : "ask_jev off"}${usage?.remainingUsd !== null && usage?.remainingUsd !== undefined ? ` · Est. credit: ${usd(usage.remainingUsd, 2)}` : ""}`
              : "Fast typed decisions for smart compaction and ask_jev tool (requires TypeSafe key)"}
          </span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {settings.hasKey && (
              <button
                className="ui-btn ui-btn--sm"
                type="button"
                disabled={test === "testing"}
                onClick={(e) => {
                  e.stopPropagation();
                  void runTest();
                }}
                title="Test saved TypeSafe API key"
              >
                {test === "testing" ? <Loader2 size={12} className="jev-spin" /> : null} Test
              </button>
            )}
            <button
              className="ui-btn ui-btn--sm ui-btn--primary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
            >
              {settings.hasKey ? "Configure" : "Set up key"}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="jev-account-body">
          <section className="jev-card jev-card--hero">
            <div className="jev-card__head">
              <span className="jev-icon">
                <Gauge size={18} />
              </span>
              <div>
                <h3 className="jev-card__title">Decision Model & API Key</h3>
                <p className="jev-card__desc">
                  TypeSafe's fast decision model. Hive uses it to suggest when to compact and to give the agent an <code>ask_jev</code> tool. Requests go
                  straight from your machine to <code>api.typesafe.ai</code> with your key; nothing passes through Hive servers.
                </p>
              </div>
            </div>

            {settings.consentAt ? (
              <div className="jev-muted">
                Privacy notice accepted {new Date(settings.consentAt).toLocaleDateString()}.{" "}
                <button className="jev-link" type="button" onClick={() => void save({ consentAt: null })}>
                  Revoke (turns Jev off)
                </button>
              </div>
            ) : (
              <div className="jev-consent" role="group" aria-label="Privacy notice">
                <strong>Before you turn this on</strong>
                <p>
                  Jev sends content to TypeSafe (<code>api.typesafe.ai</code>) outside your machine: roughly the last 8 messages of the chat (shortened) for
                  compaction hints, and any text, files or read-only command output the agent passes to <code>ask_jev</code>. Files stay inside the
                  workspace and credential-looking files are refused, but source code in the workspace can still be sent. Don't enable Jev for code you
                  can't share with a third party.
                </p>
                <label className="jev-consent__check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>I understand and agree to send this content to TypeSafe</span>
                </label>
                {settings.hasKey && (
                  <button className="jev-btn" type="button" disabled={!agree} onClick={() => void save({ consentAt: Date.now() })}>
                    Accept and turn Jev on
                  </button>
                )}
              </div>
            )}

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
              <button className="jev-btn" type="button" disabled={!keyDraft.trim() || (!settings.consentAt && !agree)} onClick={() => void saveKey()}>
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
              TypeSafe's API doesn't report your balance, so Hive counts the input tokens each call reports (output tokens are free) and prices them at the list rate (jev-1.13.0: $0.042 per 1M input tokens).
              Enter what you deposited and Hive estimates what's left. Only calls made through Hive are counted.
            </p>
            {usage && (
              <div className="jev-stats">
                <Stat label="Today" bucket={usage.today} />
                <Stat label="Last 7 days" bucket={usage.last7d} />
                <Stat label="All time" bucket={usage.total} />
                <div className="jev-stat jev-stat--remaining">
                  <div className="jev-stat__label">Tokens left (est.)</div>
                  <div className="jev-stat__value">{usage.remainingTokens === null ? "n/a" : tok(usage.remainingTokens)}</div>
                  <div className="jev-stat__sub">
                    {usage.remainingUsd === null
                      ? "enter your deposit below"
                      : `${usd(usage.remainingUsd, 2)} left of ${usd(settings.creditUsd, 2)}${usage.daysLeft !== null ? ` · ~${usage.daysLeft >= 365 ? "1y+" : `${Math.round(usage.daysLeft)}d`} at current pace` : ""}`}
                  </div>
                </div>
              </div>
            )}
            {usage && <FeatureSplit byFeature={usage.byFeature} />}
            {usage?.lastError && <div className="jev-bad jev-lasterr">Last error: {usage.lastError.message}</div>}
            <Row title="Amount deposited" hint="Total USD you've added to your TypeSafe account. Spend is counted from the moment you change this figure, so update it after each top-up with your current balance.">
              <NumberField label="Amount deposited in USD" prefix="$" placeholder="e.g. 5" step={1} value={settings.creditUsd} onCommit={(v) => void save({ creditUsd: v })} />
            </Row>
            <Row title="Price per 1M input tokens" hint="Defaults to the published rate of $0.042. Override only if your plan differs.">
              <NumberField label="Price per million input tokens" prefix="$" placeholder="0.042" step={0.001} value={settings.pricePerMTokUsd} onCommit={(v) => void save({ pricePerMTokUsd: v })} />
            </Row>
            <Row
              title="Main model price per 1M input tokens"
              hint={`Used to value the context ask_jev keeps out of the agent's window in Insights. Leave empty for the default ($${MAIN_MODEL_PRICE_PER_MTOK_USD}, a typical Sonnet-class price).`}
            >
              <NumberField
                label="Main model price per million input tokens"
                prefix="$"
                placeholder={String(MAIN_MODEL_PRICE_PER_MTOK_USD)}
                step={0.1}
                value={settings.mainModelPricePerMTokUsd}
                onCommit={(v) => void save({ mainModelPricePerMTokUsd: v })}
              />
            </Row>
            <Row title="Daily call limit" hint="Stops Jev calls for the rest of the day once reached (all sessions). 0 means unlimited.">
              <NumberField label="Calls per day" value={settings.maxCallsPerDay} onCommit={(v) => void save({ maxCallsPerDay: v ?? 0 })} />
            </Row>
            <div className="jev-actions jev-actions--split">
              <button className="jev-btn" type="button" onClick={openInsights} title="Open the Jev insights tab: savings, hint funnel, latency, session scan">
                <TrendingUp size={13} /> Open insights
              </button>
              {usage && usage.total.calls > 0 && (
                <button className="jev-btn jev-btn--ghost" type="button" onClick={() => void host.ipc.invoke<UsageSummary>(JevMethods.clearUsage).then(setUsage)}>
                  Reset usage log
                </button>
              )}
            </div>
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
      )}
    </div>
  );
};
