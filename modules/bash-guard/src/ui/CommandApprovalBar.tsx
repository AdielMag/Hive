import React, { useEffect, useState } from "react";
import { Check, Copy, ShieldAlert, ShieldX, Play } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { parseDangerousBashMessage } from "../shared.ts";
import "./command-approval-bar.css";

interface RpcDialogLike {
  id: string;
  method: string;
  title?: string;
  message?: string;
}

interface RpcResponseLike {
  type: "extension_ui_response";
  id: string;
  confirmed: boolean;
}

export interface CommandApprovalBarProps {
  host: ModuleHost;
  pendingUiDialog?: RpcDialogLike | null;
  respondDialog?: (response: RpcResponseLike) => Promise<void>;
}

export const CommandApprovalBar: React.FC<CommandApprovalBarProps> = ({ host, pendingUiDialog, respondDialog }) => {
  const [copied, setCopied] = useState(false);

  // Hooks must run on every render (before any early return), so key off the dialog id and bail inside.
  const activeDialogId = pendingUiDialog && pendingUiDialog.method === "confirm" && parseDangerousBashMessage(pendingUiDialog.message) ? pendingUiDialog.id : null;
  useEffect(() => {
    if (!activeDialogId) return;
    const answer = (confirmed: boolean) => void respondDialog?.({ type: "extension_ui_response", id: activeDialogId, confirmed });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        answer(false);
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        answer(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialogId]);

  if (!pendingUiDialog || pendingUiDialog.method !== "confirm") {
    return null;
  }

  const payload = parseDangerousBashMessage(pendingUiDialog.message);
  if (!payload) {
    return null;
  }

  const isCritical = payload.severity === "critical";

  const handleBlock = () => {
    void respondDialog?.({ type: "extension_ui_response", id: pendingUiDialog.id, confirmed: false });
  };

  const handleAllow = () => {
    void respondDialog?.({ type: "extension_ui_response", id: pendingUiDialog.id, confirmed: true });
  };

  const handleCopy = async () => {
    try {
      const ok = await host.clipboard.copy(payload.command);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // fallback
    }
  };


  return (
    <div className={`command-approval-bar${isCritical ? " command-approval-bar--critical" : ""}`}>
      <div className="command-approval-bar__header">
        <ShieldAlert size={16} className="command-approval-bar__icon" />
        <span className="command-approval-bar__title">Dangerous Command Detected</span>
        <span className="command-approval-bar__severity">{payload.severity}</span>
        <span className="command-approval-bar__shortcuts-hint">Esc to Block · Ctrl+Enter to Allow</span>
      </div>

      <div className="command-approval-bar__reason">
        <strong>{payload.ruleTitle}:</strong> {payload.reason}
      </div>

      <div className="command-approval-bar__code-wrap">
        <pre className="command-approval-bar__code">{payload.command}</pre>
        <button
          type="button"
          className="command-approval-bar__copy-btn"
          onClick={() => void handleCopy()}
          title="Copy command"
        >
          {copied ? <Check size={12} color="var(--success, #10b981)" /> : <Copy size={12} />}
        </button>
      </div>

      <div className="command-approval-bar__footer">
        <button
          type="button"
          className="command-approval-bar__btn-block"
          onClick={handleBlock}
          title="Block command execution (Escape)"
        >
          <ShieldX size={13} />
          <span>Block Execution</span>
        </button>
        <button
          type="button"
          className="command-approval-bar__btn-allow"
          onClick={handleAllow}
          title="Allow command once (Ctrl+Enter)"
        >
          <Play size={12} />
          <span>Allow Once</span>
        </button>
      </div>
    </div>
  );
};
