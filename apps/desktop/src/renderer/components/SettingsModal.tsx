/** Settings dialog: Appearance, Models, AI providers, Updates, About. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, Download, ExternalLink, Info, Key, Keyboard, LogOut, Minimize2, Palette, Puzzle, RefreshCw, Volume2, X } from "lucide-react";
import { AppearanceSettingsContent } from "./AppearanceSettingsContent.tsx";
import { WorkbenchSettingsSection } from "./WorkbenchSettingsSection.tsx";
import { SoundSettingsContent } from "./SoundSettingsContent.tsx";
import { playUiSound } from "../store/sound-store.ts";
import { ModelsSettingsContent } from "./ModelsSettingsContent.tsx";
import { CompactionSettingsContent } from "./CompactionSettingsContent.tsx";
import { KeyboardSettings } from "../features/commands/KeyboardSettings.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ProviderEnabledToggle } from "./ProviderEnabledToggle.tsx";
import { providerDisplayName } from "../lib/provider-filter.ts";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { toast } from "../modules/toast-store.ts";
import { askChoice } from "./ChoiceDialog.tsx";
import { type UpdateInfo, isInstalling, useUpdates } from "../store/update-store.ts";
import { UpdateProgressBar } from "./UpdateProgressBar.tsx";
import { ModulesSettings } from "../features/modules/ModulesSettings.tsx";
import { useContributions, useModuleHost } from "../modules/registry.ts";
import { Slot } from "../modules/ModuleViews.tsx";
import type { CoreSettingsTabId, SettingsTabId } from "../store/ui-store.ts";

export type { CoreSettingsTabId, SettingsTabId };

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

type NavGroup = "General" | "AI" | "Extensions" | "App";
const TABS: Array<{ id: CoreSettingsTabId; group: NavGroup; label: string; icon: React.ReactNode; title: string }> = [
  { id: "appearance", group: "General", label: "Appearance", icon: <Palette size={15} />, title: "Appearance" },
  { id: "sound", group: "General", label: "Sound", icon: <Volume2 size={15} />, title: "Sound & Audio Effects" },
  { id: "keyboard", group: "General", label: "Keyboard", icon: <Keyboard size={15} />, title: "Keyboard Shortcuts" },
  { id: "models", group: "AI", label: "Models", icon: <Cpu size={15} />, title: "Models" },
  { id: "accounts", group: "AI", label: "AI Providers", icon: <Key size={15} />, title: "AI providers & accounts" },
  { id: "compaction", group: "AI", label: "Context", icon: <Minimize2 size={15} />, title: "Context & auto-compaction" },
  { id: "modules", group: "Extensions", label: "Modules", icon: <Puzzle size={15} />, title: "Modules" },
  { id: "updates", group: "App", label: "Updates", icon: <Download size={15} />, title: "Updates" },
  { id: "about", group: "App", label: "About", icon: <Info size={15} />, title: "About Hive" },
];
const GROUPS: NavGroup[] = ["General", "AI", "Extensions", "App"];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = "appearance" }) => {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const moduleSettings = useContributions("settings");
  // Shared with the title-bar badge: a check here also lights up the badge, and vice versa.
  const update = useUpdates((s) => s.info);
  const checking = useUpdates((s) => s.checking);
  const checkUpdate = useUpdates((s) => s.check);
  const checkPi = useUpdates((s) => s.checkPi);
  const piHasUpdate = useUpdates((s) => s.piInfo?.hasUpdate);

  const handleClose = useCallback(() => {
    playUiSound("modal_close");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    playUiSound("modal_open");
    setTab(initialTab);
    void checkUpdate();
    void checkPi();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, initialTab, checkUpdate, checkPi, handleClose]);

  if (!isOpen) return null;
  const moduleTab = moduleSettings.find((t) => `${t.moduleId}:${t.id}` === tab);
  const current = TABS.find((t) => t.id === tab) ?? (moduleTab ? { title: moduleTab.title ?? moduleTab.label } : TABS[0]!);

  return (
    <div className="modal-scrim" onMouseDown={handleClose}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings__nav">
          <div className="settings__brand">Settings</div>
          {GROUPS.map((g) => (
            <div key={g} role="group" aria-labelledby={`settings-nav-${g}`} className="settings__nav-section">
              <div id={`settings-nav-${g}`} className="settings__nav-group">{g}</div>
              {TABS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.id}
                  className={`settings__nav-btn${tab === t.id ? " is-active" : ""}`}
                  onClick={() => {
                    if (tab !== t.id) playUiSound("tab_switch");
                    setTab(t.id);
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {t.id === "updates" && (update?.hasUpdate || piHasUpdate) && <span className="ui-chip ui-chip--accent">New</span>}
                </button>
              ))}
              {g === "Extensions" &&
                moduleSettings.map((t) => {
                  const key = `${t.moduleId}:${t.id}`;
                  const Icon = t.icon;
                  return (
                    <button
                      key={key}
                      className={`settings__nav-btn${tab === key ? " is-active" : ""}`}
                      onClick={() => {
                        if (tab !== key) playUiSound("tab_switch");
                        setTab(key);
                      }}
                    >
                      {Icon ? <Icon size={15} /> : <Puzzle size={15} />}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>
        <section className="settings__main">
          <header className="settings__header">
            <h2>{current.title}</h2>
            <button className="ui-btn ui-btn--ghost ui-btn--icon" onClick={handleClose} aria-label="Close settings">
              <X size={16} />
            </button>
          </header>
          <div className="settings__body">
            {tab === "appearance" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <AppearanceSettingsContent />
                <WorkbenchSettingsSection />
              </div>
            )}
            {tab === "sound" && <SoundSettingsContent />}
            {tab === "models" && <ModelsSettingsContent />}
            {tab === "compaction" && <CompactionSettingsContent />}
            {tab === "accounts" && <AccountsTab />}
            {tab === "keyboard" && <KeyboardSettings />}
            {tab === "updates" && <UpdatesTab info={update} checking={checking} onCheck={() => { void checkUpdate(); void checkPi(); }} />}
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

const API_KEY_PROVIDERS = new Set(["anthropic", "openai"]);

const AccountsTab: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [replacing, setReplacing] = useState<string | null>(null);
  const focus = useUi((s) => s.settingsFocus);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const allCatalogModels = useSessionStore((s) => s.allCatalogModels);
  const sessionModels = useSessionStore((s) => s.models);

  // Providers that have models (e.g. zai, openrouter) but no sign-in flow here: still need an on/off switch.
  const modelOnlyProviders = useMemo(() => {
    const known = new Set((accounts ?? []).map((a) => a.providerId));
    const extra = new Map<string, number>();
    const seen = new Set<string>();
    for (const m of [...allCatalogModels, ...sessionModels]) {
      if (!m.provider || known.has(m.provider)) continue;
      const key = `${m.provider}/${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      extra.set(m.provider, (extra.get(m.provider) ?? 0) + 1);
    }
    return Array.from(extra.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [accounts, allCatalogModels, sessionModels]);

  const load = useCallback(async () => {
    try {
      setAccounts(await window.studio.getAuthAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => void load(), [load]);

  // Opened from an auth failure on an API-key provider: open the key input straight away.
  useEffect(() => {
    const acc = accounts?.find((a) => a.providerId === focus?.providerId);
    if (acc && acc.connected && acc.type === "api_key" && API_KEY_PROVIDERS.has(acc.providerId)) setReplacing(acc.providerId);
  }, [accounts, focus]);

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

  const fail = (what: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setError(`${what}: ${msg}`);
    toast({ kind: "error", message: `${what}: ${msg}` });
  };

  const oauth = async (acc: Account) => {
    setError(null);
    setBusy(`login:${acc.providerId}`);
    try {
      const res = await window.studio.loginOAuth(acc.providerId);
      if (res.success) {
        setNotes((n) => ({ ...n, [acc.providerId]: "" }));
        reconnected(acc.name, "reconnected");
      } else fail(`Couldn't sign in to ${acc.name}`, res.error || "sign-in failed");
    } catch (err) {
      fail(`Couldn't sign in to ${acc.name}`, err);
    } finally {
      setBusy(null);
    }
    await load();
  };
  const refresh = async (acc: Account) => {
    setError(null);
    setBusy(`refresh:${acc.providerId}`);
    try {
      const res = await window.studio.refreshOAuth(acc.providerId);
      if (res.success) {
        setNotes((n) => ({ ...n, [acc.providerId]: "Token refreshed. If you still see errors, use Reconnect." }));
        reconnected(acc.name, "token refreshed");
      } else {
        setNotes((n) => ({ ...n, [acc.providerId]: "" }));
        fail(`Couldn't refresh ${acc.name}`, `${res.error || "unknown error"}. Use Reconnect to sign in again.`);
      }
    } catch (err) {
      fail(`Couldn't refresh ${acc.name}`, err);
    } finally {
      setBusy(null);
    }
    await load();
  };
  const saveKey = async (acc: Account) => {
    const id = acc.providerId;
    const key = keys[id]?.trim();
    if (!key) return;
    setError(null);
    setBusy(`key:${id}`);
    try {
      await window.studio.saveApiKey(id, key);
      setKeys((k) => ({ ...k, [id]: "" }));
      setReplacing((r) => (r === id ? null : r));
      reconnected(acc.name, "API key saved");
    } catch (err) {
      fail(`Couldn't save the ${acc.name} API key`, err);
    } finally {
      setBusy(null);
    }
    await load();
  };
  const logout = async (id: string, name: string) => {
    const choice = await askChoice({
      title: `Disconnect ${name}?`,
      body: [`You'll be signed out of ${name} and its models stop working until you connect again.`],
      choices: [
        { id: "cancel", label: "Cancel" },
        { id: "disconnect", label: "Disconnect", tone: "danger" },
      ],
    });
    if (choice !== "disconnect") return;
    setBusy(`logout:${id}`);
    try {
      await window.studio.logoutAccount(id);
      toast({ kind: "success", message: `Disconnected ${name}` });
    } catch (err) {
      fail(`Couldn't disconnect ${name}`, err);
    } finally {
      setBusy(null);
    }
    await load();
  };

  const keyInput = (acc: Account) => (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        className="settings__input"
        type="password"
        placeholder={`${acc.name} API key`}
        value={keys[acc.providerId] ?? ""}
        autoFocus={replacing === acc.providerId}
        onChange={(e) => setKeys({ ...keys, [acc.providerId]: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && void saveKey(acc)}
      />
      <button className="ui-btn" disabled={!!busy} onClick={() => void saveKey(acc)}>
        {busy === `key:${acc.providerId}` ? <RefreshCw size={12} className="spin" /> : null} Save key
      </button>
    </div>
  );

  return (
    <div className="settings__stack">
      {error && <div className="settings__alert">{error}</div>}
      {!accounts && !error && <div className="ui-skeleton" style={{ height: 120 }} />}
      {!accounts && error && (
        <div>
          <button className="ui-btn ui-btn--sm" onClick={() => { setError(null); void load(); }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}
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
              <ProviderEnabledToggle provider={acc.providerId} name={acc.name} />
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
                  {acc.type === "api_key" && API_KEY_PROVIDERS.has(acc.providerId) && (
                    <button
                      className={`ui-btn ui-btn--sm${isFocus ? " ui-btn--primary" : ""}`}
                      disabled={!!busy}
                      onClick={() => setReplacing(replacing === acc.providerId ? null : acc.providerId)}
                      title="Enter a new API key without disconnecting first"
                    >
                      <Key size={12} /> Replace API key
                    </button>
                  )}
                  <button className="ui-btn ui-btn--sm" disabled={!!busy} onClick={() => void logout(acc.providerId, acc.name)}>
                    <LogOut size={12} /> Disconnect
                  </button>
                </div>
                {replacing === acc.providerId && <div style={{ flexBasis: "100%", marginTop: 6 }}>{keyInput(acc)}</div>}
              </div>
            ) : (
              <div className="settings__account-actions settings__account-actions--col">
                {canOAuth && (
                  <button className="ui-btn ui-btn--primary" disabled={!!busy} onClick={() => void oauth(acc)}>
                    {reconnecting ? <RefreshCw size={13} className="spin" /> : <ExternalLink size={13} />}
                    Sign in with {acc.name}
                  </button>
                )}
                {API_KEY_PROVIDERS.has(acc.providerId) && keyInput(acc)}
              </div>
            )}
          </div>
        );
      })}
      {accounts &&
        modelOnlyProviders.map(([provider, count]) => (
          <div key={provider} className="ui-card settings__account">
            <div className="settings__account-head">
              <div className="quota-card__logo">
                <ProviderIcon provider={provider} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ui-row__title">{providerDisplayName(provider)}</div>
                <div className="ui-row__hint">
                  {count} model{count === 1 ? "" : "s"} · credentials are managed through Pi
                </div>
              </div>
              <ProviderEnabledToggle provider={provider} name={providerDisplayName(provider)} />
            </div>
          </div>
        ))}
      <Slot name="settings.accounts" props={{ focus }} />
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
      <PiCliUpdateCard />
      <PiExtensionsUpdateCard />
    </div>
  );
};

const PiCliUpdateCard: React.FC = () => {
  const pi = useSessionStore((s) => s.bootstrap?.pi);
  const info = useUpdates((s) => s.piInfo);
  const checking = useUpdates((s) => s.piChecking);
  const installing = useUpdates((s) => s.piInstalling);
  const installingTarget = useUpdates((s) => s.installingTarget);
  const result = useUpdates((s) => s.piCliResult);
  const checkPi = useUpdates((s) => s.checkPi);
  const applyPi = useUpdates((s) => s.applyPiUpdate);
  const current = info?.currentVersion ?? (pi?.ok ? pi.info.version : undefined);
  const isCliInstalling = installing && (installingTarget === "cli" || installingTarget === "all");

  return (
    <div className="ui-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div className="ui-row__title">Pi CLI {current ? `(v${current})` : ""}</div>
          <div className="ui-row__hint">
            {isCliInstalling
              ? "Installing with npm…"
              : info?.cliHasUpdate
                ? `Update available: v${info.latestVersion}`
                : checking
                  ? "Checking npm…"
                  : info?.error
                    ? `${info.error}. Try again in a moment.`
                    : current
                      ? "Pi CLI is up to date"
                      : !pi?.ok
                        ? "Pi CLI was not detected"
                        : "Not checked yet"}
          </div>
        </div>
        <button className="ui-btn" onClick={() => void checkPi()} disabled={checking || installing}>
          <RefreshCw size={13} className={checking ? "spin" : undefined} /> Check now
        </button>
      </div>
      {info?.cliHasUpdate && (
        <div className="settings__update">
          <div className="ui-row__title">v{info.latestVersion} is ready</div>
          <button className="ui-btn ui-btn--primary" onClick={() => void applyPi("cli")} disabled={installing}>
            {isCliInstalling ? <RefreshCw size={13} className="spin" /> : <Download size={13} />}{" "}
            {isCliInstalling ? "Installing…" : "Update"}
          </button>
        </div>
      )}
      {result && <pre className="settings__notes selectable">{result.message}</pre>}
    </div>
  );
};

const PiExtensionsUpdateCard: React.FC = () => {
  const info = useUpdates((s) => s.piInfo);
  const checking = useUpdates((s) => s.piChecking);
  const installing = useUpdates((s) => s.piInstalling);
  const installingTarget = useUpdates((s) => s.installingTarget);
  const result = useUpdates((s) => s.piExtResult);
  const checkPi = useUpdates((s) => s.checkPi);
  const applyPi = useUpdates((s) => s.applyPiUpdate);

  const extensions = info?.extensions ?? [];
  const pendingUpdates = extensions.filter((e) => e.hasUpdate);
  const hasUpdates = pendingUpdates.length > 0;
  const isAllExtInstalling = installing && (installingTarget === "extensions" || installingTarget === "all");

  return (
    <div className="ui-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div className="ui-row__title">Pi Extensions</div>
          <div className="ui-row__hint">
            {isAllExtInstalling
              ? "Installing extensions with npm…"
              : hasUpdates
                ? `${pendingUpdates.length} extension update${pendingUpdates.length > 1 ? "s" : ""} available`
                : checking
                  ? "Checking npm…"
                  : extensions.length > 0
                    ? "All extensions are up to date"
                    : info
                      ? "No extensions detected in ~/.pi/agent/npm"
                      : "Not checked yet"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasUpdates && pendingUpdates.length > 1 && (
            <button className="ui-btn ui-btn--primary" onClick={() => void applyPi("extensions")} disabled={installing}>
              {isAllExtInstalling ? <RefreshCw size={13} className="spin" /> : <Download size={13} />}{" "}
              {isAllExtInstalling ? "Installing…" : "Update all"}
            </button>
          )}
          <button className="ui-btn" onClick={() => void checkPi()} disabled={checking || installing}>
            <RefreshCw size={13} className={checking ? "spin" : undefined} /> Check now
          </button>
        </div>
      </div>

      {extensions.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
          {extensions.map((ext) => {
            const isThisInstalling = installing && (isAllExtInstalling || installingTarget === ext.name);
            return (
              <div
                key={ext.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13, color: "var(--text-primary)" }}>{ext.name}</div>
                  <div className="ui-row__hint" style={{ margin: "2px 0 0" }}>
                    {ext.hasUpdate ? (
                      <span>
                        v{ext.currentVersion ?? "?"} → <span style={{ color: "var(--accent-base)", fontWeight: 600 }}>v{ext.latestVersion}</span>
                      </span>
                    ) : ext.error ? (
                      <span style={{ color: "var(--danger)" }}>v{ext.currentVersion ?? "?"} ({ext.error})</span>
                    ) : (
                      <span>v{ext.currentVersion ?? "?"} (up to date)</span>
                    )}
                  </div>
                </div>
                {ext.hasUpdate ? (
                  <button
                    className="ui-btn ui-btn--sm ui-btn--primary"
                    onClick={() => void applyPi(ext.name)}
                    disabled={installing}
                  >
                    {isThisInstalling ? <RefreshCw size={12} className="spin" /> : <Download size={12} />}
                    {isThisInstalling ? "Updating…" : "Update"}
                  </button>
                ) : (
                  <span className="ui-chip ui-chip--muted">Latest</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {result && <pre className="settings__notes selectable">{result.message}</pre>}
    </div>
  );
};

const AboutTab: React.FC = () => {
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const pi = bootstrap?.pi;
  const gh = bootstrap?.gh;
  const rows: Array<[string, string]> = [
    ["Hive", `v${bootstrap?.appVersion ?? "?"}`],
    ["Pi CLI", pi?.ok ? `v${pi.info.version} (${pi.info.support})` : "not detected"],
    ["GitHub CLI", gh?.ok ? `v${gh.version}` : "not detected"],
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
