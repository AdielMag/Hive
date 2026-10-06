/** Describes what a Pi reload changed, by diffing the tool/skill registry from before and after. */
import type { SessionRegistry } from "@hive/protocol";

export interface ReloadSummary {
  /** Short text for the status strip, e.g. "+1 skill, -2 tools" or "no changes". */
  text: string;
  /** Names behind the counts (tooltip). Empty when nothing changed. */
  detail: string;
  changed: boolean;
}

type Named = { name: string };

function diff(before: Named[], after: Named[]): { added: string[]; removed: string[] } {
  const b = new Set(before.map((x) => x.name));
  const a = new Set(after.map((x) => x.name));
  return { added: [...a].filter((n) => !b.has(n)), removed: [...b].filter((n) => !a.has(n)) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function summarizeReload(
  before: Pick<SessionRegistry, "tools" | "skills"> | null | undefined,
  after: Pick<SessionRegistry, "tools" | "skills"> | null | undefined,
): ReloadSummary {
  if (!after) return { text: "done", detail: "", changed: false };
  if (!before) {
    return {
      text: `${plural(after.tools.length, "tool")}, ${plural(after.skills.length, "skill")}`,
      detail: "",
      changed: false,
    };
  }
  const groups = [
    { word: "tool", ...diff(before.tools, after.tools) },
    { word: "skill", ...diff(before.skills, after.skills) },
  ];
  const parts: string[] = [];
  const lines: string[] = [];
  for (const g of groups) {
    if (g.added.length) {
      parts.push(`+${plural(g.added.length, g.word)}`);
      lines.push(`Added ${g.word}s: ${g.added.join(", ")}`);
    }
    if (g.removed.length) {
      parts.push(`-${plural(g.removed.length, g.word)}`);
      lines.push(`Removed ${g.word}s: ${g.removed.join(", ")}`);
    }
  }
  if (parts.length === 0) return { text: "no changes", detail: "", changed: false };
  return { text: parts.join(", "), detail: lines.join("\n"), changed: true };
}
