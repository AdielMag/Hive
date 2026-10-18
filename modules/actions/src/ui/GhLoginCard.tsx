import React from "react";
import { AlertCircle, ExternalLink, Github, Loader2 } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { useActionsStore } from "./actions-store.ts";

/** Shown when no GitHub credentials are found: explains why, and signs in through `gh auth login --web`. */
export const GhLoginCard: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const login = useActionsStore((s) => s.login);
  const startLogin = useActionsStore((s) => s.startLogin);
  const cancelLogin = useActionsStore((s) => s.cancelLogin);
  const running = login.phase === "running";
  return (
    <div className="ga-token ga-login" role="status">
      <div className="ga-token__head">
        <AlertCircle size={14} />
        <span>Not signed in to GitHub. Private repos and a higher rate limit need it.</span>
      </div>
      {running ? (
        <>
          <div className="ga-login__code">
            {login.code ? (
              <>
                <span>Enter this code on github.com</span>
                <code>{login.code}</code>
              </>
            ) : (
              <span>
                <Loader2 size={12} className="ga-spin" /> Starting GitHub login...
              </span>
            )}
          </div>
          <div className="ga-token__row">
            <button type="button" className="ga-btn" onClick={() => void host.openExternal("https://github.com/login/device")}>
              Open github.com <ExternalLink size={10} />
            </button>
            <button type="button" className="ga-btn" onClick={() => void cancelLogin()}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="ga-token__row">
          <button type="button" className="ga-btn ga-btn--primary" onClick={() => void startLogin()}>
            <Github size={13} /> Log in with GitHub
          </button>
        </div>
      )}
      {login.phase === "failed" && (
        <div className="ga-login__error">
          {login.message}
          {login.notInstalled && (
            <button type="button" className="ga-link" onClick={() => void host.openExternal("https://cli.github.com")}>
              Install GitHub CLI <ExternalLink size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
