/**
 * Settings tab for Chromium Hive Browser & Smart RAM Management.
 */
import React, { useState } from "react";
import { Check, Globe, Moon, Shield, Zap } from "lucide-react";
import { useBrowserStore, type SearchEngine } from "../../lib/browser/browser-store.ts";
import { useSessionStore } from "../../store/session-store.ts";

export const BrowserSettingsContent: React.FC = () => {
  const { settings, updateSettings } = useBrowserStore();
  const { tabs, sleepAllBackgroundTabs } = useSessionStore();
  const [hibernatedNotice, setHibernatedNotice] = useState<string | null>(null);

  const backgroundBrowserTabs = tabs.filter((t) => t.kind === "browser");
  const liveCount = backgroundBrowserTabs.filter((t) => !t.isSleeping).length;
  const sleepingCount = backgroundBrowserTabs.filter((t) => t.isSleeping).length;

  const handleHibernateAll = () => {
    sleepAllBackgroundTabs();
    setHibernatedNotice(`All ${backgroundBrowserTabs.length} background tabs hibernated! RAM released.`);
    setTimeout(() => setHibernatedNotice(null), 3000);
  };

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">
          <Globe size={16} style={{ marginRight: 8, display: "inline-block", verticalAlign: "text-bottom" }} />
          Hive Chromium Browser
        </h3>
        <p className="settings-section__desc">
          Configure integrated web browsing and intelligent background RAM management.
        </p>
      </div>

      <div className="settings-group">
        <h4 className="settings-group__title">
          <Moon size={14} style={{ marginRight: 6, display: "inline-block", verticalAlign: "middle", color: "#f59e0b" }} />
          Smart Memory Saver (RAM Management)
        </h4>
        <p className="settings-group__desc">
          Hive terminates inactive Chromium background guest processes to keep system memory usage minimal.
        </p>

        {/* Current Tab Memory Overview */}
        <div style={{ display: "flex", gap: 12, margin: "14px 0" }}>
          <div className="settings-card" style={{ flex: 1, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Active Browser Tabs
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#10b981", marginTop: 4 }}>
              {liveCount} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)" }}>live in RAM</span>
            </div>
          </div>
          <div className="settings-card" style={{ flex: 1, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Sleeping Tabs
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#f59e0b", marginTop: 4 }}>
              {sleepingCount} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)" }}>hibernated (0 MB)</span>
            </div>
          </div>
        </div>

        {/* Inactivity Threshold */}
        <div className="settings-row">
          <div>
            <label className="settings-label" htmlFor="browser-auto-sleep">
              Auto-sleep background tabs after
            </label>
            <div className="settings-hint">
              Automatically hibernate tabs left in the background to free their memory.
            </div>
          </div>
          <select
            id="browser-auto-sleep"
            className="ui-select"
            value={settings.autoSleepMinutes}
            onChange={(e) => updateSettings({ autoSleepMinutes: Number(e.target.value) })}
          >
            <option value={1}>1 minute</option>
            <option value={3}>3 minutes</option>
            <option value={5}>5 minutes (Recommended)</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={0}>Never</option>
          </select>
        </div>

        {/* Max Live Tabs Cap */}
        <div className="settings-row">
          <div>
            <label className="settings-label" htmlFor="browser-max-live">
              Max live background tabs in memory
            </label>
            <div className="settings-hint">
              When exceeded, the oldest background tabs automatically hibernate (LRU).
            </div>
          </div>
          <select
            id="browser-max-live"
            className="ui-select"
            value={settings.maxLiveTabs}
            onChange={(e) => updateSettings({ maxLiveTabs: Number(e.target.value) })}
          >
            <option value={1}>1 tab (Maximum RAM savings)</option>
            <option value={2}>2 tabs (Balanced)</option>
            <option value={3}>3 tabs</option>
            <option value={5}>5 tabs</option>
            <option value={0}>Unlimited</option>
          </select>
        </div>

        {/* Auto Wake on Select */}
        <div className="settings-row">
          <div>
            <label className="settings-label" htmlFor="browser-auto-wake">
              Auto-wake sleeping tabs when clicked
            </label>
            <div className="settings-hint">
              Seamlessly restore and reload the webpage when you switch back to a sleeping tab.
            </div>
          </div>
          <input
            id="browser-auto-wake"
            type="checkbox"
            checked={settings.autoWakeOnSelect}
            onChange={(e) => updateSettings({ autoWakeOnSelect: e.target.checked })}
          />
        </div>

        {/* Hibernate All Background Tabs Action */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <button className="ui-btn" onClick={handleHibernateAll}>
            <Zap size={14} style={{ marginRight: 6, color: "#f59e0b" }} />
            Hibernate all background tabs now
          </button>
          {hibernatedNotice && (
            <span style={{ fontSize: 12, color: "#10b981", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Check size={14} />
              {hibernatedNotice}
            </span>
          )}
        </div>
      </div>

      <div className="settings-group" style={{ marginTop: 20 }}>
        <h4 className="settings-group__title">
          <Shield size={14} style={{ marginRight: 6, display: "inline-block", verticalAlign: "middle" }} />
          Navigation & Links
        </h4>

        {/* Open Links in Hive Browser */}
        <div className="settings-row">
          <div>
            <label className="settings-label" htmlFor="browser-open-external">
              Open links inside Hive browser by default
            </label>
            <div className="settings-hint">
              Links in chat transcripts, release notes, and documentation open directly in Hive tabs.
            </div>
          </div>
          <input
            id="browser-open-external"
            type="checkbox"
            checked={settings.openExternalInHive}
            onChange={(e) => updateSettings({ openExternalInHive: e.target.checked })}
          />
        </div>

        {/* Default Search Engine */}
        <div className="settings-row">
          <div>
            <label className="settings-label" htmlFor="browser-search-engine">
              Default search engine
            </label>
            <div className="settings-hint">Used when non-URL search terms are entered into the address bar.</div>
          </div>
          <select
            id="browser-search-engine"
            className="ui-select"
            value={settings.searchEngine}
            onChange={(e) => updateSettings({ searchEngine: e.target.value as SearchEngine })}
          >
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="google">Google</option>
            <option value="bing">Bing</option>
          </select>
        </div>
      </div>
    </div>
  );
};
