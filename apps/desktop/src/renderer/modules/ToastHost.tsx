import React from "react";
import { X } from "lucide-react";
import { useToasts } from "./toast-store.ts";

/** Bottom-right toast stack. Mounted once by the workbench. */
export const ToastHost: React.FC = () => {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast__msg">{t.message}</span>
          {t.action && (
            <button
              className="ui-btn ui-btn--sm"
              onClick={() => {
                void t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="ui-btn ui-btn--ghost ui-btn--icon toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};
