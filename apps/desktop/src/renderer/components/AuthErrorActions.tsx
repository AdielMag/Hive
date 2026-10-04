import React from "react";
import { KeyRound } from "lucide-react";
import { AUTH_PROVIDER_NAMES, describeAuthError, type AuthError } from "../lib/auth-errors.ts";
import { useUi } from "../store/ui-store.ts";

/**
 * Shown next to an error that the classifier recognised as a failed/expired subscription login.
 * Opens Settings → AI Providers focused on the affected account, where it can be refreshed or reconnected.
 */
export const AuthErrorActions: React.FC<{ auth: AuthError; tone?: "banner" | "inline" }> = ({ auth, tone = "inline" }) => {
  const name = AUTH_PROVIDER_NAMES[auth.providerId];
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    useUi.getState().openAccountSettings(auth.providerId, describeAuthError(auth));
  };
  return (
    <button
      type="button"
      className={`auth-error-action auth-error-action--${tone}`}
      onClick={open}
      title={describeAuthError(auth)}
    >
      <KeyRound size={12} />
      <span>{auth.kind === "missing" ? `Sign in to ${name}` : `Reconnect ${name}`}</span>
    </button>
  );
};
