import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, FolderSearch, RefreshCw } from "lucide-react";
import type { PiLocateResult } from "@hive/protocol";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "./store/session-store.ts";
import { WorkbenchLayout } from "./components/WorkbenchLayout.tsx";
import "./modules/host.tsx";
import { useModules } from "./modules/registry.ts";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { copyText } from "./lib/clipboard.ts";
import hiveIcon from "./assets/hive-icon.png";

const GH_SKIP_KEY = "hive.skipGh";
const readGhSkip = (): boolean => {
  try {
    return localStorage.getItem(GH_SKIP_KEY) === "1";
  } catch {
    return false;
  }
};

const INSTALL_CMD = "npm install -g @earendil-works/pi-coding-agent";

export const App: React.FC = () => {
  const { init, isInitializing, bootstrap } = useSessionStore(
    useShallow((s) => ({ init: s.init, isInitializing: s.isInitializing, bootstrap: s.bootstrap })),
  );

  const [ghSkipped, setGhSkipped] = useState(readGhSkip);

  useEffect(() => {
    void init();
  }, [init]);

  const bootstrapped = !isInitializing && !!bootstrap?.pi?.ok && (!!bootstrap?.gh?.ok || ghSkipped);
  useEffect(() => {
    if (bootstrapped) void useModules.getState().init();
  }, [bootstrapped]);

  if (isInitializing) {
    return (
      <div className="boot">
        <div className="boot__logo">
          <img src={hiveIcon} alt="Hive" draggable={false} />
        </div>
        <div className="boot__title">Hive</div>
        <div className="boot__sub">Connecting to your local Pi…</div>
      </div>
    );
  }

  if (bootstrap?.pi && !bootstrap.pi.ok) return <PiMissing searched={bootstrap.pi.searched} error={bootstrap.pi.error} />;
  if (bootstrap?.gh && !bootstrap.gh.ok && !ghSkipped) {
    return (
      <GhMissing
        searched={bootstrap.gh.searched}
        error={bootstrap.gh.error}
        platform={bootstrap.platform}
        onSkip={() => {
          try {
            localStorage.setItem(GH_SKIP_KEY, "1");
          } catch {
            /* ignore */
          }
          setGhSkipped(true);
        }}
      />
    );
  }

  return (
    <ErrorBoundary label="Hive">
      <WorkbenchLayout />
    </ErrorBoundary>
  );
};

const PiMissing: React.FC<{ searched: string[]; error: string }> = (initial) => {
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(initial);
  const [busy, setBusy] = useState<null | "check" | "locate">(null);
  const [found, setFound] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const nodeProblem = /Node\.js/.test(result.error) && /Pi was found/.test(result.error);

  const apply = (r: PiLocateResult | null) => {
    if (!r) return;
    if (r.ok) setFound(`Found Pi ${r.info.version} — restarting…`);
    else setResult({ searched: r.searched, error: r.error });
  };
  const run = async (kind: "check" | "locate") => {
    setBusy(kind);
    setRunError(null);
    try {
      apply(kind === "check" ? await window.studio.relocatePi() : await window.studio.choosePiLocation());
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="boot">
      <div className="ui-card boot__card">
        <div className="boot__card-title">
          {found ? <Check size={18} color="var(--success)" /> : <AlertTriangle size={18} color="var(--warning)" />}
          {found ? "Pi found" : nodeProblem ? "Node.js needed" : "Pi CLI not found"}
        </div>
        {found ? (
          <p className="boot__text">{found}</p>
        ) : (
          <>
            <p className="boot__text selectable">Hive drives your installed Pi coding agent. {result.error}</p>
            {!nodeProblem && (
              <div className="boot__cmd">
                <code className="selectable">{INSTALL_CMD}</code>
                <button
                  className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                  title="Copy"
                  aria-label="Copy install command"
                  onClick={async () => {
                    if (await copyText(INSTALL_CMD)) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
            <p className="boot__text">
              Installed already? Press <b>Check again</b> — Hive re-reads your PATH — or use <b>Locate Pi…</b> to pick the{" "}
              <code>pi</code> command (run <code>{navigator.platform.startsWith("Win") ? "where pi" : "which pi"}</code> in a terminal to see
              where it is). You can also set <code>HIVE_PI_CLI</code>.
            </p>
            <details className="boot__details">
              <summary>Searched {result.searched.length} locations</summary>
              <ul className="selectable">
                {result.searched.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
            {runError && (
              <p className="boot__text selectable" role="alert" style={{ color: "var(--danger)" }}>
                {runError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ui-btn ui-btn--primary" disabled={busy !== null} onClick={() => void run("check")}>
                <RefreshCw size={13} className={busy === "check" ? "spin" : undefined} /> Check again
              </button>
              <button className="ui-btn" disabled={busy !== null} onClick={() => void run("locate")}>
                <FolderSearch size={13} /> Locate Pi…
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const GhMissing: React.FC<{ searched: string[]; error: string; platform?: string; onSkip: () => void }> = ({ searched, error, platform, onSkip }) => {
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState({ searched, error });
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  const isWin = (platform ?? navigator.platform).toLowerCase().startsWith("win");
  const isMac = (platform ?? navigator.platform).toLowerCase().startsWith("mac") || (platform ?? navigator.platform).toLowerCase().startsWith("darwin");
  const installCmd = isWin ? "winget install --id GitHub.cli" : isMac ? "brew install gh" : "sudo apt install gh";

  const runCheck = async () => {
    setBusy(true);
    setRunError(null);
    try {
      const r = await window.studio.relocateGh();
      if (r.ok) {
        setFound(`Found GitHub CLI v${r.version} — continuing…`);
        useSessionStore.setState((s) => ({
          bootstrap: s.bootstrap ? { ...s.bootstrap, gh: r } : s.bootstrap,
        }));
      } else {
        setResult({ searched: r.searched, error: r.error });
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="boot">
      <div className="ui-card boot__card">
        <div className="boot__card-title">
          {found ? <Check size={18} color="var(--success)" /> : <AlertTriangle size={18} color="var(--warning)" />}
          {found ? "GitHub CLI found" : "GitHub CLI (gh) not found"}
        </div>
        {found ? (
          <p className="boot__text">{found}</p>
        ) : (
          <>
            <p className="boot__text selectable">
              Hive uses the GitHub CLI (<code>gh</code>) for GitHub features such as pull requests. You can continue without it. {result.error}
            </p>
            <div className="boot__cmd">
              <code className="selectable">{installCmd}</code>
              <button
                className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                title="Copy"
                aria-label="Copy install command"
                onClick={async () => {
                  if (await copyText(installCmd)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <p className="boot__text">
              Installed already? Press <b>Check again</b> — Hive will refresh your PATH and detect it.
            </p>
            {result.searched.length > 0 && (
              <details className="boot__details">
                <summary>Searched {result.searched.length} locations</summary>
                <ul className="selectable">
                  {result.searched.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            {runError && (
              <p className="boot__text selectable" role="alert" style={{ color: "var(--danger)" }}>
                {runError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ui-btn ui-btn--primary" disabled={busy} onClick={() => void runCheck()}>
                <RefreshCw size={13} className={busy ? "spin" : undefined} /> Check again
              </button>
              <button className="ui-btn" disabled={busy} onClick={onSkip}>
                Continue without GitHub
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

