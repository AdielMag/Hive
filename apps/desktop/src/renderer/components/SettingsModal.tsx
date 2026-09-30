import React, { useState, useEffect } from "react";
import {
  X,
  Palette,
  Key,
  Download,
  Info,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LogOut,
  Sparkles,
} from "lucide-react";
import { ArcThemePickerContent } from "./ArcThemePickerContent.tsx";
import { useSessionStore } from "../store/session-store.ts";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "appearance" | "accounts" | "updates" | "about";
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = "appearance" }) => {
  const [activeTab, setActiveTab] = useState<"appearance" | "accounts" | "updates" | "about">(initialTab);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const { bootstrap } = useSessionStore();

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const accs = await window.studio.getAuthAccounts();
      setAccounts(accs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await window.studio.checkForUpdates();
      setUpdateInfo(info);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadAccounts();
      void handleCheckUpdate();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOAuthLogin = async (providerId: string) => {
    setAuthError(null);
    const res = await window.studio.loginOAuth(providerId);
    if (!res.success) {
      setAuthError(res.error || "Login failed");
    } else {
      await loadAccounts();
    }
  };

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId]?.trim();
    if (!key) return;
    await window.studio.saveApiKey(providerId, key);
    setApiKeyInputs((prev) => ({ ...prev, [providerId]: "" }));
    await loadAccounts();
  };

  const handleLogout = async (providerId: string) => {
    if (confirm(`Sign out of ${providerId}?`)) {
      await window.studio.logoutAccount(providerId);
      await loadAccounts();
    }
  };

  const handleApplyUpdate = async () => {
    if (updateInfo?.downloadUrl) {
      await window.studio.applyUpdate(updateInfo.downloadUrl);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        userSelect: "none",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          height: 520,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Left Navigation Bar */}
        <div
          style={{
            width: 190,
            background: "var(--bg-sidebar)",
            borderRight: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            padding: "16px 8px",
            gap: 4,
          }}
        >
          <div
            style={{
              padding: "0 10px 14px 10px",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--border-subtle)",
              marginBottom: 8,
            }}
          >
            <Sparkles size={16} color="var(--accent-base)" />
            <span>Settings</span>
          </div>

          <NavButton
            icon={<Palette size={15} />}
            label="Appearance"
            active={activeTab === "appearance"}
            onClick={() => setActiveTab("appearance")}
          />
          <NavButton
            icon={<Key size={15} />}
            label="AI Providers"
            active={activeTab === "accounts"}
            onClick={() => setActiveTab("accounts")}
          />
          <NavButton
            icon={<Download size={15} />}
            label="Updates"
            badge={updateInfo?.hasUpdate ? "New" : undefined}
            active={activeTab === "updates"}
            onClick={() => setActiveTab("updates")}
          />
          <NavButton
            icon={<Info size={15} />}
            label="About"
            active={activeTab === "about"}
            onClick={() => setActiveTab("about")}
          />
        </div>

        {/* Right Content Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {activeTab === "appearance" && "Appearance & Arc Theme"}
              {activeTab === "accounts" && "AI Providers & Connected Accounts"}
              {activeTab === "updates" && "Application Updates"}
              {activeTab === "about" && "About Pi Studio"}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {authError && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "rgba(229, 83, 75, 0.12)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                {authError}
              </div>
            )}

            {/* TAB 1: APPEARANCE (ARC THEME ENGINE) */}
            {activeTab === "appearance" && <ArcThemePickerContent />}

            {/* TAB 2: AI PROVIDERS & ACCOUNTS */}
            {activeTab === "accounts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {loadingAccounts && (
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading accounts...</div>
                )}

                {accounts.map((acc) => (
                  <div
                    key={acc.providerId}
                    style={{
                      padding: 16,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            color: "var(--accent-base)",
                          }}
                        >
                          {acc.name[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                            {acc.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Provider: {acc.providerId}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {acc.connected ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 8px",
                            borderRadius: 12,
                            background: "rgba(87, 171, 90, 0.15)",
                            color: "var(--success)",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          <CheckCircle2 size={12} />
                          <span>Connected</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 8px",
                            borderRadius: 12,
                            background: "rgba(255, 255, 255, 0.06)",
                            color: "var(--text-muted)",
                            fontSize: 11,
                          }}
                        >
                          <AlertCircle size={12} />
                          <span>Not Connected</span>
                        </div>
                      )}
                    </div>

                    {/* Connected Details */}
                    {acc.connected ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: 8,
                          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          Account: <strong style={{ color: "var(--text-primary)" }}>{acc.email}</strong>
                        </span>

                        <button
                          onClick={() => handleLogout(acc.providerId)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            background: "transparent",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--danger)",
                            borderRadius: 4,
                            padding: "4px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          <LogOut size={12} /> Disconnect
                        </button>
                      </div>
                    ) : (
                      /* Connect actions */
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
                        {/* OAuth Button for Antigravity or Anthropic */}
                        {(acc.providerId === "antigravity" || acc.providerId === "anthropic") && (
                          <button
                            onClick={() => handleOAuthLogin(acc.providerId)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "8px 14px",
                              borderRadius: 6,
                              border: "none",
                              background: "var(--accent-base)",
                              color: "#fff",
                              fontWeight: 600,
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            <ExternalLink size={13} />
                            <span>Sign in with {acc.name} (OAuth)</span>
                          </button>
                        )}

                        {/* API Key Form for Anthropic or OpenAI */}
                        {(acc.providerId === "anthropic" || acc.providerId === "openai") && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              type="password"
                              placeholder={`Enter ${acc.name} API Key...`}
                              value={apiKeyInputs[acc.providerId] || ""}
                              onChange={(e) =>
                                setApiKeyInputs({ ...apiKeyInputs, [acc.providerId]: e.target.value })
                              }
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                borderRadius: 4,
                                border: "1px solid var(--border-subtle)",
                                background: "var(--bg-input)",
                                color: "var(--text-primary)",
                                fontSize: 11,
                                fontFamily: "var(--font-mono)",
                              }}
                            />
                            <button
                              onClick={() => handleSaveApiKey(acc.providerId)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 4,
                                border: "none",
                                background: "var(--bg-elevated)",
                                color: "var(--text-primary)",
                                fontSize: 11,
                                fontWeight: 500,
                                cursor: "pointer",
                              }}
                            >
                              Save Key
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: UPDATES */}
            {activeTab === "updates" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    padding: 16,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        Current Version: v{updateInfo?.currentVersion || bootstrap?.appVersion || "0.1.0"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {updateInfo?.hasUpdate
                          ? `New version available: v${updateInfo.latestVersion}`
                          : "You are running the latest version"}
                      </div>
                    </div>

                    <button
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-primary)",
                        fontSize: 11,
                        cursor: checkingUpdate ? "default" : "pointer",
                      }}
                    >
                      <RefreshCw size={12} className={checkingUpdate ? "spin" : ""} />
                      <span>{checkingUpdate ? "Checking..." : "Check for Updates"}</span>
                    </button>
                  </div>

                  {updateInfo?.hasUpdate && (
                    <div
                      style={{
                        padding: 12,
                        background: "var(--accent-subtle)",
                        border: "1px solid var(--accent-base)",
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--accent-hover)", fontSize: 12 }}>
                          Update Ready: v{updateInfo.latestVersion}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                          Click below to download and apply the update.
                        </div>
                      </div>

                      <button
                        onClick={handleApplyUpdate}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 14px",
                          borderRadius: 6,
                          border: "none",
                          background: "var(--accent-base)",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        <Download size={13} /> Update Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: ABOUT */}
            {activeTab === "about" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    padding: 16,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    Pi Studio
                  </div>
                  <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Extensible desktop GUI workbench for the Pi coding agent.
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
                    Pi CLI Runtime: {bootstrap?.pi.ok ? bootstrap.pi.info.version : "not detected"}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    CLI Path: {bootstrap?.pi.ok ? bootstrap.pi.info.cliPath : "none"}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    Platform: {bootstrap?.platform} ({process.arch || "x64"})
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ icon, label, badge, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: 6,
        border: "none",
        background: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
        fontSize: 12,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: active ? "var(--accent-base)" : "var(--text-muted)" }}>{icon}</span>
        <span>{label}</span>
      </div>

      {badge && (
        <span
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 8,
            background: "var(--accent-base)",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};
