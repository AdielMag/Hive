import React, { useState } from "react";
import { useSessionStore } from "../store/session-store.ts";

export const ExtensionDialogModal: React.FC = () => {
  const { pendingUiDialog, respondDialog } = useSessionStore();
  const [inputText, setInputText] = useState("");

  if (!pendingUiDialog) return null;

  const { id, method } = pendingUiDialog;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 440,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 8,
          padding: 20,
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {"title" in pendingUiDialog ? pendingUiDialog.title : "Extension Request"}
        </div>

        {"message" in pendingUiDialog && pendingUiDialog.message && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            {pendingUiDialog.message}
          </div>
        )}

        {method === "select" && "options" in pendingUiDialog && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingUiDialog.options?.map((opt) => (
              <button
                key={opt}
                onClick={() => respondDialog({ type: "extension_ui_response", id, value: opt })}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {method === "confirm" && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => respondDialog({ type: "extension_ui_response", id, confirmed: false })}
              style={{
                padding: "6px 14px",
                borderRadius: 4,
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              No
            </button>
            <button
              onClick={() => respondDialog({ type: "extension_ui_response", id, confirmed: true })}
              style={{
                padding: "6px 14px",
                borderRadius: 4,
                border: "none",
                background: "var(--accent-base)",
                color: "#fff",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Yes
            </button>
          </div>
        )}

        {method === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={"placeholder" in pendingUiDialog ? pendingUiDialog.placeholder : ""}
              autoFocus
              style={{
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid var(--border-prominent)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => respondDialog({ type: "extension_ui_response", id, cancelled: true })}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => respondDialog({ type: "extension_ui_response", id, value: inputText })}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent-base)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {method === "editor" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              defaultValue={"prefill" in pendingUiDialog ? pendingUiDialog.prefill : ""}
              onChange={(e) => setInputText(e.target.value)}
              rows={8}
              style={{
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid var(--border-prominent)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => respondDialog({ type: "extension_ui_response", id, cancelled: true })}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => respondDialog({ type: "extension_ui_response", id, value: inputText })}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent-base)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
