/** Settings dialog: Appearance, Models, AI providers, Updates, About. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, Download, ExternalLink, Info, Key, Keyboard, LogOut, Minimize2, Palette, Puzzle, RefreshCw, X } from "lucide-react";
import { AppearanceSettingsContent } from "./AppearanceSettingsContent.tsx";
import { ModelsSettingsContent } from "./ModelsSettingsContent.tsx";
import { CompactionSettingsContent } from "./CompactionSettingsContent.tsx";
import { KeyboardSettings } from "../features/commands/KeyboardSettings.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { toast } from "../modules/toast-store.ts";
import { type UpdateInfo, isInstalling, useUpdates } from "../store/update-store.ts";
import { UpdateProgressBar } from "./UpdateProgressBar.tsx";
import { ModulesSettings } from "../features/modules/ModulesSettings.tsx";
import { useContributions, useModuleHost } from "../modules/registry.ts";

export type CoreSettingsTabId = "appearance" | "models" | "compaction" | "accounts" | "keyboard" | "modules" | "updates" | "about";
/** Core tab, or `<moduleId>:<tabId>` for a settings page contributed by a module. */
export type SettingsTabId = CoreSettingsTabId | (string & {});

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
  needsAttention?: boolean;
}

const TABS: Array<{ id: CoreSettingsTabId; label: string; icon: React.ReactNode; title: string }> = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} />, title: "Appearance" },
  { id: "models", label: "Models", icon: <Cpu size={15} />, title: "Models" },
  { id: "compaction", label: "Compaction", icon: <Minimize2 size={15} />, title: "Auto-Compaction & Context" },
  { id: "accounts", label: "AI Providers", icon: <Key size={15} />, title: "AI providers & accounts" },
  { id: "keyboard", label: "Keyboard", icon: <Keyboard size={15} />, title: "Keyboard Shortcuts" },
  { id: "modules", label: "Modules", icon: <Puzzle size={15} />, title: "Modules" },
  { id: "updates", label: "Updates", icon: <Download size={15} />, title: "Updates" },
  { id: "about", label: "About", icon: <Info size={15} />, title: "About Hive" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = "appearance" }) => {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const moduleSettings = useContributions("settings");
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
  const moduleTab = moduleSettings.find((t) => `${t.moduleId}:${t.id}` === tab);
  const current = TABS.find((t) => t.id === tab) ?? (moduleTab ? { title: moduleTab.title ?? moduleTab.label } : TABS[0]!);

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
          {moduleSettings.map((t) => {
            const key = `${t.moduleId}:${t.id}`;
            const Icon = t.icon;
            return (
              <button key={key} className={`settings__nav-btn${tab === key ? " is-active" : ""}`} onClick={() => setTab(key)}>
                {Icon ? <Icon size={15} /> : <Puzzle size={15} />}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
        <section className="settings__main">
          <header className="settings__header">
            <h2>{current.title}</h2>
            <button className="ui-btn ui-btn--ghost ui-btn--icon" onClick={onClose} aria-label="Close settings">
              <X size={16} />
            </button>
          </header>
          <div className="settings__body">
            {tab === "appearance" && <AppearanceSettingsContent />}
            {tab === "models" && <ModelsSettingsContent />}
            {tab === "compaction" && <CompactionSettingsContent />}
            {tab === "accounts" && <AccountsTab />}
            {tab === "keyboard" && <KeyboardSettings />}
            {tab === "updates" && <UpdatesTab info={update} checking={checking} onCheck={checkUpdate} />}
            {tab === "about" && <AboutTab />}
            {tab === "modules" && <ModulesSettings />}
            {moduleTab && <ModuleSettingsPage moduleId={moduleTab.moduleId} Component={moduleTab.component} />}
          </div>
        </section>
      </div>
    </div>
  );
};

const ModuleSettingsPage: React.FC<{ moduleId: string; Component: React.ComponentType<{ host: import("@hive/module-sdk/renderer").ModuleHost }> }> = ({ moduleId, Component }) => {
  const host = useModuleHost(moduleId);
  return host ? <Component host={host} /> : null;
};

const AccountsTab: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const focus = useUi((s) => s.settingsFocus);
  const focusRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setAccounts(await window.studio.getAuthAccounts());
    } catch (err) {
      setError(String(err));
    }
  }, []);
  useEffect(() => void load(), [load]);

  // Opened from a failed session: bring the affected account into view.
  useEffect(() => {
    if (accounts && focus) focusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [accounts, focus]);

  /** A working login makes any stale auth error in the session banner obsolete. */
  const reconnected = (name: string, message: string) => {
    useSessionStore.getState().clearError();
    useUi.setState({ settingsFocus: null });
    toast({ kind: "success", message: `${name} ${message} — send your message again.` });
  };

  const oauth = async (acc: Account) => {
    setError(null);
    setBusy(`login:${acc.providerId}`);
    const res = await window.studio.loginOAuth(acc.providerId);
    setBusy(null);
    if (res.success) {
      setNotes((n) => ({ ...n, [acc.providerId]: "" }));
      reconnected(acc.name, "reconnected");
    } else setError(res.error || "Sign-in failed");
    await load();
  };
  const refresh = async (acc: Account) => {
    setError(null);
    setBusy(`refresh:${acc.providerId}`);
    const res = await window.studio.refreshOAuth(acc.providerId);
    setBusy(null);
    if (res.success) {
      setNotes((n) => ({ ...n, [acc.providerId]: "Token refreshed. If you still see errors, use Reconnect." }));
      reconnected(acc.name, "token refreshed");
    } else {
      setNotes((n) => ({ ...n, [acc.providerId]: "" }));
      setError(`Couldn't refresh ${acc.name}: ${res.error || "unknown error"}. Use Reconnect to sign in again.`);
    }
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
      {accounts?.map((acc) => {
        const isFocus = focus?.providerId === acc.providerId;
        const canOAuth = acc.providerId === "antigravity" || acc.providerId === "anthropic";
        const reconnecting = busy === `login:${acc.providerId}`;
        const refreshing = busy === `refresh:${acc.providerId}`;
        return (
          <div key={acc.providerId} ref={isFocus ? focusRef : undefined} className={`ui-card settings__account${isFocus ? " is-focus" : ""}`}>
            {isFocus && (
              <div className="settings__notice">
                <AlertCircle size={14} />
                <span>{focus?.reason || `${acc.name} needs to be reconnected.`}</span>
              </div>
            )}
            <div className="settings__account-head">
              <div className="quota-card__logo">
                <ProviderIcon provider={acc.providerId} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ui-row__title">{acc.name}</div>
                <div className="ui-row__hint">{acc.connected ? acc.email : acc.providerId}</div>
              </div>
              {acc.connected && acc.needsAttention ? (
                <span className="ui-chip ui-chip--warn" title="The access token expired a while ago and may not be refreshing">
                  <AlertCircle size={11} /> May need refresh
                </span>
              ) : acc.connected ? (
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
                <span className="ui-row__hint">
                  {notes[acc.providerId] ||
                    (acc.type === "oauth" ? "Signed in with OAuth (subscription)" : "Using an API key")}
                </span>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {acc.type === "oauth" && (
                    <button className="ui-btn ui-btn--sm" disabled={!!busy} onClick={() => void refresh(acc)} title="Refresh the token without opening a browser">
                      <RefreshCw size={12} className={refreshing ? "spin" : undefined} /> Refresh
                    </button>
                  )}
                  {acc.type === "oauth" && canOAuth && (
                    <button
                      className={`ui-btn ui-btn--sm${isFocus ? " ui-btn--primary" : ""}`}
                      disabled={!!busy}
                      onClick={() => void oauth(acc)}
                      title="Sign in again in your browser"
                    >
                      {reconnecting ? <RefreshCw size={12} className="spin" /> : <ExternalLink size={12} />} Reconnect
                    </button>
                  )}
                  <button className="ui-btn ui-btn--sm" disabled={!!busy} onClick={() => void logout(acc.providerId, acc.name)}>
                    <LogOut size={12} /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="settings__account-actions settings__account-actions--col">
                {canOAuth && (
                  <button className="ui-btn ui-btn--primary" disabled={!!busy} onClick={() => void oauth(acc)}>
                    {reconnecting ? <RefreshCw size={13} className="spin" /> : <ExternalLink size={13} />}
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
        );
      })}
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
            <div className="ui-row__hint">
              {info?.hasUpdate
                ? `Version ${info.latestVersion} is available`
                : checking
                  ? "Checking GitHub releases…"
                  : info?.error
                    ? `${info.error}. Try again in a moment.`
                    : info
                      ? "You're on the latest version"
                      : "Not checked yet"}
            </div>
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
        <button className="ui-btn" onClick={() => void window.studio.openExternal("https://github.com/AdielMag/Hive")}>
          <ExternalLink size={12} /> GitHub
        </button>
        <button className="ui-btn" onClick={() => void window.studio.openExternal("https://github.com/AdielMag/Hive/blob/main/CHANGELOG.md")}>
          <ExternalLink size={12} /> Changelog
        </button>
      </div>
    </div>
  );
};
