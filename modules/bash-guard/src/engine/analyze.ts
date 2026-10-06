/**
 * Command analysis: parse -> unwrap wrappers / substitutions (depth-limited, fail-closed) -> rules.
 * Synchronous and pure.
 */

import type { DangerSeverity } from "../shared.ts";
import { legacyScan, legacySegments } from "./legacy.ts";
import { RULES, SKELETON_RULES, stdinPayloads, type RuleContext } from "./rules.ts";
import { parseCommand, type ParsedCommand, type Segment } from "./tokenize.ts";
import { MAX_UNWRAP_DEPTH, segmentFromWords, unwrap } from "./unwrap.ts";

export interface Finding {
  id: string;
  title: string;
  severity: DangerSeverity;
  reason: string;
  matchedSegment: string;
}

const RANK: Record<DangerSeverity, number> = { critical: 3, high: 2, moderate: 1 };

const DEPTH_FINDING = {
  id: "wrapper-depth",
  title: "Deeply Nested Command Wrappers",
  severity: "high" as DangerSeverity,
  reason: "Command is wrapped more than 8 levels deep (`sudo env nohup ... bash -c ...`) and cannot be inspected safely.",
};

function runRules(ctx: RuleContext, hits: Finding[]): void {
  for (const r of RULES) {
    if (r.scope === "pipeline" && ctx.index !== 0) continue;
    if (r.scope === "command") continue;
    let matched = false;
    try {
      matched = r.test(ctx);
    } catch {
      matched = false;
    }
    if (matched) {
      const matchedSegment = r.scope === "pipeline" ? ctx.pipeline.map((s) => s.raw).join(" | ") : ctx.seg.raw;
      hits.push({ id: r.id, title: r.title, severity: r.severity, reason: r.reason, matchedSegment });
    }
  }
}

function runCommandRules(parsed: ParsedCommand, hits: Finding[]): void {
  const first = parsed.segments[0];
  if (!first) return;
  const ctx: RuleContext = { seg: first, pipeline: [first], index: 0, parsed };
  for (const r of RULES) {
    if (r.scope !== "command") continue;
    let matched = false;
    try {
      matched = r.test(ctx);
    } catch {
      matched = false;
    }
    if (matched) hits.push({ id: r.id, title: r.title, severity: r.severity, reason: r.reason, matchedSegment: parsed.src.trim() });
  }
}

function inlineInterpreterScript(seg: Segment): string | null {
  const p = seg.program;
  const a = seg.args;
  if (p === "python" || p === "python3") {
    const k = a.findIndex((x) => x === "-c");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  if (p === "node" || p === "nodejs") {
    const k = a.findIndex((x) => x === "-e" || x === "--eval");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  if (p === "ruby" || p === "perl") {
    const k = a.findIndex((x) => x === "-e");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  if (p === "php") {
    const k = a.findIndex((x) => x === "-r");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  return null;
}

function checkSegment(seg: Segment, pipeline: Segment[], index: number, parsed: ParsedCommand, depth: number, hits: Finding[]): void {
  if (depth > MAX_UNWRAP_DEPTH) {
    hits.push({ ...DEPTH_FINDING, matchedSegment: seg.raw });
    return;
  }
  runRules({ seg, pipeline, index, parsed }, hits);
  const script = inlineInterpreterScript(seg);
  if (script) {
    const l = legacyScan(script);
    if (l) hits.push({ id: l.rule.id, title: l.rule.title, severity: l.rule.severity, reason: l.rule.reason, matchedSegment: l.segment });
  }
  for (const sub of seg.subs) walk(sub.text, depth + 1, hits);
  for (const u of unwrap(seg)) {
    if (u.kind === "text") {
      walk(u.text, depth + 1, hits);
    } else {
      const inner = segmentFromWords(u.words, seg);
      if (inner) checkSegment(inner, [inner], 0, parsed, depth + 1, hits);
    }
  }
}

function walk(text: string, depth: number, hits: Finding[]): void {
  if (depth > MAX_UNWRAP_DEPTH) {
    hits.push({ ...DEPTH_FINDING, matchedSegment: text.trim().slice(0, 200) });
    return;
  }
  if (!text.trim()) return;
  const parsed = parseCommand(text);
  if (!parsed.ok) {
    // Fail closed: unparseable input is scanned as a raw string with the legacy regexes.
    const l = legacyScan(text);
    if (l) hits.push({ id: l.rule.id, title: l.rule.title, severity: l.rule.severity, reason: l.rule.reason, matchedSegment: l.segment });
    return;
  }
  for (const r of SKELETON_RULES) {
    if (r.pattern.test(parsed.skeleton)) hits.push({ id: r.id, title: r.title, severity: r.severity, reason: r.reason, matchedSegment: text.trim() });
  }
  runCommandRules(parsed, hits);
  for (const pipe of parsed.pipelines) {
    pipe.segments.forEach((seg, idx) => checkSegment(seg, pipe.segments, idx, parsed, depth, hits));
    for (const payload of stdinPayloads(pipe.segments)) walk(payload, depth + 1, hits);
  }
  // Segments with no pipeline (should not happen) are still covered via parsed.segments above.
}

/** Most severe finding for a command, or null. Ties keep the first one found. */
export function analyzeCommand(command: string): Finding | null {
  const hits: Finding[] = [];
  walk(command, 0, hits);
  let best: Finding | null = null;
  for (const h of hits) if (!best || RANK[h.severity] > RANK[best.severity]) best = h;
  return best;
}

/** All segment strings, including substitutions and unwrapped `-c` strings. */
export function collectSegments(command: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };
  const visit = (text: string, depth: number) => {
    if (depth > MAX_UNWRAP_DEPTH || !text.trim()) return;
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      for (const s of legacySegments(text)) add(s);
      return;
    }
    for (const seg of parsed.segments) visitSegment(seg, depth);
  };
  const visitSegment = (seg: Segment, depth: number) => {
    if (depth > MAX_UNWRAP_DEPTH) return;
    for (const sub of seg.subs) visit(sub.text, depth + 1);
    add(seg.raw);
    for (const u of unwrap(seg)) {
      if (u.kind === "text") visit(u.text, depth + 1);
      else {
        const inner = segmentFromWords(u.words, seg);
        if (inner) visitSegment(inner, depth + 1);
      }
    }
  };
  visit(command, 0);
  return out;
}
