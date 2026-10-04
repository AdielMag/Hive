/**
 * Settings tab for the Hive Chromium browser and Smart Memory Saver (RAM management).
 */
import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Compass, MemoryStick, Zap } from "lucide-react";
import { useBrowserStore, type SearchEngine } from "./browser-store.ts";
import { browserHost } from "./browser-host.ts";
import "./browser-settings.css";

const SLEEP_OPTIONS = [
  { value: 1, label: "1 minute" },
  { value: 3, label: "3 minutes" },
  { value: 5, label: "5 minutes (Recommended)" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 0, label: "Never" },
];

const MAX_LIVE_OPTIONS = [
  { value: 1, label: "1 tab (Max savings)" },
  { value: 2, label: "2 tabs (Balanced)" },
  { value: 3, label: "3 tabs" },
  { value: 5, label: "5 tabs" },
  { value: 0, label: "Unlimited" },
];

const SEARCH_ENGINES: Array<{ value: SearchEngine; label: string }> = [
  { value: "duckduckgo", label: "DuckDuckGo" },
  { value: "google", label: "Google" },
  { value: "bing", label: "Bing" },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const Select: React.FC<{
  id: string;
  value: number | string;
  options: Array<{ value: number | string; label: string }>;
  onChange: (value: string) => void;
}> = ({ id, value, options, onChange }) => (
  <div className="bset-select">
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown size={13} className="bset-select__chevron" aria-hidden />
  </div>
);

const Switch: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void; labelledBy: string }> = ({
  id,
  checked,
  onChange,
  labelledBy,
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    className="ui-switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    onClick={() => onChange(!checked)}
  />
);

const Row: React.FC<{ id: string; title: string; hint: string; children: React.ReactNode }> = ({ id, title, hint, children }) => (
  <div className="bset-row">
    <div className="bset-row__text">
      <label className="bset-row__title" id={`${id}-label`} htmlFor={id}>
        {title}
      </label>
      <div className="bset-row__hint">{hint}</div>
    </div>
    <div className="bset-row__control">{children}</div>
  </div>
);

export const BrowserSettingsContent: React.FC = () => {
  const { settings, updateSettings } = useBrowserStore();
  const host = browserHost();
  const tabs = host.tabs.list();
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const browserTabs = tabs.filter((t) => t.kind === "browser");
  const sleepingCount = browserTabs.filter((t) => t.isSleeping).length;
  const liveCount = browserTabs.length - sleepingCount;
  const total = browserTabs.length;
  const livePct = total ? (liveCount / total) * 100 : 0;
  const sleepPct = total ? (sleepingCount / total) * 100 : 0;

  const handleHibernateAll = () => {
    const active = host.tabs.active();
    for (const t of tabs) {
      if (t.kind === "browser" && t.id !== active?.id) {
        host.tabs.update(t.id, { isSleeping: true });
      }
    }
    setNotice(`${plural(liveCount, "tab")} hibernated. Memory released.`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div className="bset">
      {/* Memory Saver */}
      <section className="bset-hero">
        <div className="bset-hero__head">
          <span className="bset-icon bset-icon--amber">
            <MemoryStick size={18} />
          </span>
          <div>
            <h3 className="bset-hero__title">Smart Memory Saver</h3>
            <p className="bset-hero__desc">
              Hive hibernates inactive browser tabs so background pages stop using system memory.
            </p>
          </div>
        </div>

        <div className="bset-stats">
          <div className="bset-stat">
            <div className="bset-stat__label">
              <span className="bset-dot bset-dot--live" /> Live in RAM
            </div>
            <div className="bset-stat__value">{liveCount}</div>
          </div>
          <div className="bset-stat">
            <div className="bset-stat__label">
              <span className="bset-dot bset-dot--sleep" /> Hibernated
            </div>
            <div className="bset-stat__value">{sleepingCount}</div>
          </div>
        </div>

        <div
          className="bset-meter"
          role="img"
          aria-label={`${plural(liveCount, "live tab")}, ${plural(sleepingCount, "hibernated tab")}`}
        >
          {total > 0 && (
            <>
              <div className="bset-meter__seg bset-meter__seg--live" style={{ width: `${livePct}%` }} />
              <div className="bset-meter__seg bset-meter__seg--sleep" style={{ width: `${sleepPct}%` }} />
            </>
          )}
        </div>

        <div className="bset-hero__actions">
          <button className="ui-btn" onClick={handleHibernateAll} disabled={liveCount === 0}>
            <Zap size={13} />
            Hibernate all background tabs
          </button>
          {total === 0 && <span className="bset-muted">No browser tabs open</span>}
          {notice && (
            <span className="bset-notice" role="status">
              <Check size={13} />
              {notice}
            </span>
          )}
        </div>
      </section>

      <div className="bset-card">
        <Row id="browser-auto-sleep" title="Auto-sleep after" hint="Hibernate tabs left in the background for this long.">
          <Select
            id="browser-auto-sleep"
            value={settings.autoSleepMinutes}
            options={SLEEP_OPTIONS}
            onChange={(v) => updateSettings({ autoSleepMinutes: Number(v) })}
          />
        </Row>
        <Row id="browser-max-live" title="Max live background tabs" hint="Beyond this, the least recently used tabs hibernate.">
          <Select
            id="browser-max-live"
            value={settings.maxLiveTabs}
            options={MAX_LIVE_OPTIONS}
            onChange={(v) => updateSettings({ maxLiveTabs: Number(v) })}
          />
        </Row>
        <Row id="browser-auto-wake" title="Auto-wake on click" hint="Restore and reload a sleeping tab when you switch back to it.">
          <Switch
            id="browser-auto-wake"
            labelledBy="browser-auto-wake-label"
            checked={settings.autoWakeOnSelect}
            onChange={(v) => updateSettings({ autoWakeOnSelect: v })}
          />
        </Row>
      </div>

      {/* Navigation */}
      <div className="bset-heading">
        <span className="bset-icon bset-icon--muted bset-icon--sm">
          <Compass size={14} />
        </span>
        <span className="ui-section-label">Navigation &amp; Links</span>
      </div>

      <div className="bset-card">
        <Row
          id="browser-open-external"
          title="Open links in Hive browser"
          hint="Links from chat, release notes and docs open in a Hive tab."
        >
          <Switch
            id="browser-open-external"
            labelledBy="browser-open-external-label"
            checked={settings.openExternalInHive}
            onChange={(v) => updateSettings({ openExternalInHive: v })}
          />
        </Row>
        <Row id="browser-search-engine" title="Default search engine" hint="Used for non-URL text typed in the address bar.">
          <Select
            id="browser-search-engine"
            value={settings.searchEngine}
            options={SEARCH_ENGINES}
            onChange={(v) => updateSettings({ searchEngine: v as SearchEngine })}
          />
        </Row>
      </div>
    </div>
  );
};
