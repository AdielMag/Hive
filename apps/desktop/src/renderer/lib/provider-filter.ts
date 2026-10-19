/** Providers switched off in Settings: their models must not be offered by any model picker. */

export function isProviderDisabled(provider: string | undefined, disabled: readonly string[]): boolean {
  return !!provider && disabled.includes(provider);
}

/**
 * Drop models of disabled providers. Run this on the raw model list *before* any "enabled models, or
 * everything when that leaves nothing" fallback, so a disabled provider can't sneak back in through it.
 */
export function filterDisabledProviders<T extends { provider?: string }>(models: readonly T[], disabled: readonly string[]): T[] {
  if (disabled.length === 0) return [...models];
  return models.filter((m) => !isProviderDisabled(m.provider, disabled));
}

/** Add or remove one provider, keeping the list free of duplicates. */
export function withProviderDisabled(disabled: readonly string[], provider: string, isDisabled: boolean): string[] {
  const rest = disabled.filter((p) => p !== provider);
  return isDisabled ? [...rest, provider] : rest;
}

const PROVIDER_NAMES: Record<string, string> = {
  antigravity: "Google Antigravity",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  zai: "ZAI Coding Plan",
  openrouter: "OpenRouter",
};

/** Human label for a provider id, e.g. `zai` -> "ZAI Coding Plan". */
export function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider.toLowerCase()] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}
