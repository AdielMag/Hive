/**
 * Canonical thinking levels defined across the Pi ecosystem.
 * Ordered from lowest reasoning effort ("off") to highest ("max").
 */
export const EXTENDED_THINKING_LEVELS: readonly string[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevelName = (typeof EXTENDED_THINKING_LEVELS)[number];

export interface ModelLike {
  id?: string;
  name?: string;
  provider?: string;
  reasoning?: boolean;
  contextWindow?: number;
  thinkingLevelMap?: Record<string, string | null> | null;
}

/**
 * Determine supported thinking levels for a model.
 *
 * Rules (matching @earendil-works/pi-ai getSupportedThinkingLevels):
 * 1. If model does not support reasoning (reasoning is falsy), returns ["off"].
 * 2. If model supports reasoning:
 *    - "off", "minimal", "low", "medium", "high" are supported UNLESS mapped explicitly to null.
 *    - "xhigh" and "max" are only supported IF explicitly mapped to a non-null string in thinkingLevelMap.
 *    - If all levels would be filtered out, falls back to ["off"].
 */
export function getSupportedThinkingLevels(model: ModelLike | null | undefined): string[] {
  if (!model || !model.reasoning) {
    return ["off"];
  }

  const map = model.thinkingLevelMap;
  const levels = EXTENDED_THINKING_LEVELS.filter((level) => {
    const mapped = map?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") {
      return mapped !== undefined;
    }
    return true;
  });

  return levels.length > 0 ? levels : ["off"];
}

/**
 * Clamp a requested thinking level to the nearest level supported by the model.
 * Matches @earendil-works/pi-ai clampThinkingLevel behavior.
 */
export function clampThinkingLevel(
  model: ModelLike | null | undefined,
  level: string | null | undefined,
): string {
  const available = getSupportedThinkingLevels(model);
  const target = level || (available.includes("medium") ? "medium" : available[0] ?? "off");

  if (available.includes(target)) {
    return target;
  }

  const requestedIndex = EXTENDED_THINKING_LEVELS.indexOf(target);
  if (requestedIndex === -1) {
    return available[0] ?? "off";
  }

  // Search closest available level by checking higher levels first, then lower
  for (let i = requestedIndex; i < EXTENDED_THINKING_LEVELS.length; i++) {
    const candidate = EXTENDED_THINKING_LEVELS[i]!;
    if (available.includes(candidate)) return candidate;
  }
  for (let i = requestedIndex - 1; i >= 0; i--) {
    const candidate = EXTENDED_THINKING_LEVELS[i]!;
    if (available.includes(candidate)) return candidate;
  }

  return available[0] ?? "off";
}

/**
 * Format context token count into human-friendly representation:
 * 1_048_576 -> "1M"
 * 2_000_000 -> "2M"
 * 200_000 -> "200k"
 * 128_000 -> "128k"
 */
export function formatContextWindow(tokens?: number | null): string {
  if (!tokens || tokens <= 0) return "";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return `${tokens}`;
}
