export type ContextTone = "neutral" | "warning" | "danger" | "unknown";

/** Maps context-window usage (percent) to a tone: <60 neutral, 60-85 warning, >85 danger. */
export function contextTone(pct: number | undefined): ContextTone {
  if (pct === undefined || Number.isNaN(pct)) return "unknown";
  if (pct > 85) return "danger";
  if (pct >= 60) return "warning";
  return "neutral";
}
