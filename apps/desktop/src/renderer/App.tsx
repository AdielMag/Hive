import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "./store/session-store.ts";
import { WorkbenchLayout } from "./components/WorkbenchLayout.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { copyText } from "./lib/clipboard.ts";

const INSTALL_CMD = "npm install -g @earendil-works/pi-coding-agent";

export const App: React.FC = () => {
  const { init, isInitializing, bootstrap } = useSessionStore(
    useShallow((s) => ({ init: s.init, isInitializing: s.isInitializing, bootstrap: s.bootstrap })),
  );

  useEffect(() => {
    void init();
  }, [init]);

  if (isInitializing) {
    return (
      <div className="boot">
        <div className="boot__logo">
          <Sparkles size={18} />
        </div>
        <div className="boot__title">Pi Studio</div>
        <div className="boot__sub">Connecting to your local Pi…</div>
      </div>
    );
  }

  if (bootstrap?.pi && !bootstrap.pi.ok) return <PiMissing searched={bootstrap.pi.searched} error={bootstrap.pi.error} />;

  return (
    <ErrorBoundary label="Pi Studio">
      <WorkbenchLayout />
    </ErrorBoundary>
  );
};

const PiMissing: React.FC<{ searched: string[]; error: string }> = ({ searched, error }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="boot">
      <div className="ui-card boot__card">
        <div className="boot__card-title">
          <AlertTriangle size={18} color="var(--warning)" /> Pi CLI not found
        </div>
        <p className="boot__text">Pi Studio drives your installed Pi coding agent. {error}</p>
        <div className="boot__cmd">
          <code className="selectable">{INSTALL_CMD}</code>
          <button
            className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
            title="Copy"
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
        <p className="boot__text">Or point Pi Studio at an install with the <code>PI_STUDIO_PI_CLI</code> environment variable.</p>
        <details className="boot__details">
          <summary>Searched {searched.length} locations</summary>
          <ul className="selectable">
            {searched.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
        <button className="ui-btn ui-btn--primary" onClick={() => location.reload()}>
          <RefreshCw size={13} /> I installed it — retry
        </button>
      </div>
    </div>
  );
};
