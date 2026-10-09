import React, { useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { useActionsStore } from "./actions-store.ts";

export const TokenCard: React.FC<{ host: ModuleHost; hint: string }> = ({ host, hint }) => {
  const saveToken = useActionsStore((s) => s.saveToken);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="ga-token"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        void saveToken(value).finally(() => {
          setBusy(false);
          setValue("");
        });
      }}
    >
      <div className="ga-token__head">
        <KeyRound size={14} />
        <span>{hint}</span>
      </div>
      <div className="ga-token__row">
        <input
          type="password"
          className="ga-input"
          aria-label="GitHub token"
          placeholder="Token with repo and actions scopes"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="ga-btn ga-btn--primary" disabled={busy || !value.trim()}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
      <button type="button" className="ga-link" onClick={() => void host.openExternal("https://github.com/settings/tokens")}>
        Create a token <ExternalLink size={10} />
      </button>
    </form>
  );
};
