/** Settings dialog: Appearance, Models, AI providers, Updates, About. */
import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, Download, ExternalLink, Globe, Info, Key, Keyboard, LogOut, Minimize2, Palette, RefreshCw, X } from "lucide-react";
import { ArcThemeEditor } from "../features/appearance/ArcThemeEditor.tsx";
import { ModelsSettingsContent } from "./ModelsSettingsContent.tsx";
import { CompactionSettingsContent } from "./CompactionSettingsContent.tsx";
import { KeyboardSettings } from "../features/commands/KeyboardSettings.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { useSessionStore } from "../store/session-store.ts";
import { type UpdateInfo, isInstalling, useUpdates } from "../store/update-store.ts";
import { UpdateProgressBar } from "./UpdateProgressBar.tsx";
import { BrowserSettingsContent } from "./browser/BrowserSettingsContent.tsx";

export type SettingsTabId = "appearance" | "models" | "compaction" | "accounts" | "keyboard" | "browser" | "updates" | "about";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
}

interface Account {
  providerId: string;
  name: string;
  type: "oauth" | "api_key" | "none";
  connected: boolean;
  email?: string;
}

const TABS: Array<{ id: SettingsTabId; label: string; icon: React.ReactNode; title: string }> = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} />, title: "Appearance" },
  { id: "models", label: "Models", icon: <Cpu size={15} />, title: "Models" },
  { id: "compaction", label: "Compaction", icon: <Minimize2 size={15} />, title: "Auto-Compaction & Context" },
  { id: "accounts", label: "AI Providers", icon: <Key size={15} />, title: "AI providers & accounts" },
  { id: "keyboard", label: "Keyboard", icon: <Keyboard size={15} />, title: "Keyboard Shortcuts" },
  { id: "browser", label: "Browser & RAM", icon: <Globe size={15} />, title: "Hive Browser & Memory Management" },
  { id: "updates", label: "Updates", icon: <Download size={15} />, title: "Updates" },
  { id: "about", label: "About", icon: <Info size={15} />, title: "About Hive" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = "appearance" }) => {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  // Shared with the title-bar badge: a check here also lights up the badge, and vice versa.
  const update = useUpdates((s) => s.info);
  const checking = useUpdates((s) => s.checking);
  const checkUpdate = useUpdates((s) => s.check);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    void checkUpdate();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, initialTab, checkUpdate, onClose]);

  if (!isOpen) return null;
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings__nav">
          <div className="settings__brand">Settings</div>
          {TABS.map((t) => (
            <button key={t.id} className={`settings__nav-btn${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
              {t.id === "updates" && update?.hasUpdate && <span className="ui-chip ui-chip--accent">New</span>}
            </button>
          ))}
        </nav>
        <section className="settings__main">
          <header className="settings__header">
            <h2>{current.title}</h2>
            <button className="ui-btn ui-btn--ghost ui-btn--icon" onClick={onClose} aria-label="Close settings">
              <X size={16} />
            </button>
          </header>
          <div className="settings__body">
            {tab === "appearance" && <ArcThemeEditor />}
            {tab === "models" && <ModelsSettingsContent />}
            {tab === "compaction" && <CompactionSettingsContent />}
            {tab === "accounts" && <AccountsTab />}
            {tab === "keyboard" && <KeyboardSettings />}
            {tab === "updates" && <UpdatesTab info={update} checking={checking} onCheck={checkUpdate} />}
            {tab === "about" && <AboutTab />}
            {tab === "browser" && <BrowserSettingsContent />}
          </div>
        </section>
      </div>
    </div>
  );
};

const AccountsTab: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAccounts(await window.studio.getAuthAccounts());
    } catch (err) {
      setError(String(err));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const oauth = async (id: string) => {
    setError(null);
    setBusy(id);
    const res = await window.studio.loginOAuth(id);
    setBusy(null);
    if (!res.success) setError(res.error || "Sign-in failed");
    await load();
  };
  const saveKey = async (id: string) => {
    const key = keys[id]?.trim();
    if (!key) return;
    await window.studio.saveApiKey(id, key);
    setKeys((k) => ({ ...k, [id]: "" }));
    await load();
  };
  const logout = async (id: string, name: string) => {
    if (!confirm(`Sign out of ${name}?`)) return;
    await window.studio.logoutAccount(id);
    await load();
  };

  return (
    <div className="settings__stack">
      {error && <div className="settings__alert">{error}</div>}
      {!accounts && <div className="ui-skeleton" style={{ height: 120 }} />}
      {accounts?.map((acc) => (
        <div key={acc.providerId} className="ui-card settings__account">
          <div className="settings__account-head">
            <div className="quota-card__logo">
              <ProviderIcon provider={acc.providerId} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ui-row__title">{acc.name}</div>
              <div className="ui-row__hint">{acc.connected ? acc.email : acc.providerId}</div>
            </div>
            {acc.connected ? (
              <span className="ui-chip ui-chip--ok">
                <CheckCircle2 size={11} /> Connected
              </span>
            ) : (
              <span className="ui-chip">
                <AlertCircle size={11} /> Not connected
              </span>
            )}
          </div>
          {acc.connected ? (
            <div className="settings__account-actions">
              <span className="ui-row__hint">{acc.type === "oauth" ? "Signed in with OAuth (subscription)" : "Using an API key"}</span>
              <button className="ui-btn ui-btn--sm" onClick={() => void logout(acc.providerId, acc.name)}>
                <LogOut size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="settings__account-actions settings__account-actions--col">
              {(acc.providerId === "antigravity" || acc.providerId === "anthropic") && (
                <button className="ui-btn ui-btn--primary" disabled={busy === acc.providerId} onClick={() => void oauth(acc.providerId)}>
                  {busy === acc.providerId ? <RefreshCw size={13} className="spin" /> : <ExternalLink size={13} />}
                  Sign in with {acc.name}
                </button>
              )}
              {(acc.providerId === "anthropic" || acc.providerId === "openai") && (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="settings__input"
                    type="password"
                    placeholder={`${acc.name} API key`}
                    value={keys[acc.providerId] ?? ""}
                    onChange={(e) => setKeys({ ...keys, [acc.providerId]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && void saveKey(acc.providerId)}
                  />
                  <button className="ui-btn" onClick={() => void saveKey(acc.providerId)}>
                    Save key
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const UpdatesTab: React.FC<{ info: UpdateInfo | null; checking: boolean; onCheck(): void }> = ({ info, checking, onCheck }) => {
  const appVersion = useSessionStore((s) => s.bootstrap?.appVersion);
  const install = useUpdates((s) => s.install);
  const applyUpdate = useUpdates((s) => s.applyUpdate);
  const busy = isInstalling(install);
  return (
    <div className="settings__stack">
      <div className="ui-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div className="ui-row__title">Hive v{info?.currentVersion ?? appVersion ?? "?"}</div>
            <div className="ui-row__hint">{info?.hasUpdate ? `Version ${info.latestVersion} is available` : checking ? "Checking GitHub releases…" : "You're on the latest version"}</div>
          </div>
          <button className="ui-btn" onClick={onCheck} disabled={checking}>
            <RefreshCw size={13} className={checking ? "spin" : undefined} /> Check now
          </button>
        </div>
        {info?.hasUpdate && (
          <div className="settings__update">
            <div>
              <div className="ui-row__title">v{info.latestVersion} is ready</div>
              {info.releaseUrl && (
                <button className="settings__link" onClick={() => void window.studio.openExternal(info.releaseUrl!)}>
                  View release notes <ExternalLink size={11} />
                </button>
              )}
            </div>
            <button className="ui-btn ui-btn--primary" onClick={() => void applyUpdate()} disabled={busy}>
              {busy ? <RefreshCw size={13} className="spin" /> : <Download size={13} />} {busy ? "Installing…" : "Download & install"}
            </button>
          </div>
        )}
        {info?.hasUpdate && install && <UpdateProgressBar progress={install} />}
        {info?.hasUpdate && info.notes && <pre className="settings__notes selectable">{info.notes}</pre>}
      </div>
    </div>
  );
};

const AboutTab: React.FC = () => {
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const pi = bootstrap?.pi;
  const rows: Array<[string, string]> = [
    ["Hive", `v${bootstrap?.appVersion ?? "?"}`],
    ["Pi CLI", pi?.ok ? `v${pi.info.version} (${pi.info.support})` : "not detected"],
    ["Pi location", pi?.ok ? pi.info.cliPath : "—"],
    ["Node for Pi", pi?.ok ? pi.info.nodePath : "—"],
    ["Platform", bootstrap?.platform ?? "?"],
  ];
  return (
    <div className="settings__stack">
      <div className="ui-card" style={{ padding: "4px 16px" }}>
        {rows.map(([k, v]) => (
          <div key={k} className="ui-row">
            <span className="ui-row__hint" style={{ margin: 0 }}>
              {k}
            </span>
            <span className="selectable mono" style={{ fontSize: 11.5, color: "var(--text-primary)", textAlign: "right", overflowWrap: "anywhere" }}>
              {v}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="ui-btn" onClick={() => void window.studio.openExternal("https://github.com/AdielMag/pi-studio")}>
          <ExternalLink size={12} /> GitHub
        </button>
        <button className="ui-btn" onClick={() => void window.studio.openExternal("https://github.com/AdielMag/pi-studio/blob/main/CHANGELOG.md")}>
          <ExternalLink size={12} /> Changelog
        </button>
      </div>
    </div>
  );
};
