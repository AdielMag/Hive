import React from "react";
import { useSessionStore } from "../store/session-store.ts";

/**
 * "Use this provider" checkbox. Backed by the one shared `disabledProviders` list, so the Models and
 * AI Providers settings tabs always agree. Unchecked = none of the provider's models show up in any picker.
 */
export const ProviderEnabledToggle: React.FC<{ provider: string; name: string }> = ({ provider, name }) => {
  const disabled = useSessionStore((s) => s.disabledProviders.includes(provider));
  const setProviderDisabled = useSessionStore((s) => s.setProviderDisabled);
  return (
    <label
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }}
      title={disabled ? `${name} is disabled: its models are hidden from every model picker` : `Uncheck to hide all ${name} models from every model picker`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={!disabled}
        aria-label={`Use ${name}`}
        onChange={(e) => void setProviderDisabled(provider, !e.target.checked)}
        style={{ accentColor: "var(--accent-base)", cursor: "pointer", margin: 0 }}
      />
      <span>{disabled ? "Disabled" : "Enabled"}</span>
    </label>
  );
};
