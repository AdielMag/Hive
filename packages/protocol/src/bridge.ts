/**
 * Studio Bridge protocol v1.
 *
 * The bridge is a small Pi extension (apps/desktop/resources/bridge/studio-bridge.ts) that Studio
 * injects into every `pi --mode rpc` process with `-e`. It talks to Studio over a per-session
 * named pipe (Windows) or unix socket (macOS/Linux) as newline-delimited JSON.
 *
 * Compatibility rules (public contract, see plan section 4.6):
 * - Every record carries `v: 1`. Changes are additive only; features are negotiated via `capabilities`.
 * - Unknown record types must be ignored by both sides.
 * - Actions that need Pi's command context (tree navigation, reload) are sent as an RPC `prompt`
 *   with the hidden command `/__studio <json>`; their results come back over the pipe.
 */

import type { SessionRegistry } from "./registry.ts";

export const BRIDGE_PROTOCOL_VERSION = 1 as const;

/** Environment variables Studio sets on each Pi process. */
export const BRIDGE_ENV = {
  /** Pipe path (Windows) or socket path (POSIX). */
  address: "HIVE_BRIDGE",
  /** One-time token; the first record from the bridge must echo it. */
  token: "HIVE_TOKEN",
} as const;

/** Hidden slash command used for command-context actions. Filtered out of every UI command list. */
export const BRIDGE_COMMAND = "__studio";

/**
 * `pi.events` topics (the event bus has no wildcards, so there are exactly two).
 * Pi extensions emit on `toGui` to reach Studio panels; Studio emits on `fromGui`.
 */
export const BRIDGE_TOPICS = {
  toGui: "studio:to-gui",
  fromGui: "studio:from-gui",
} as const;

export const BRIDGE_CAPABILITIES = [
  "linked_projects",
  "prompt_sections",
  "boundaries",
  "events",
  "registry",
  "actions:ping",
  "actions:navigate_tree",
  "actions:reload",
  "actions:refresh_models",
  "ui:form",
  "subagents:stop",
  "subagents:activity",
] as const;
export type BridgeCapability = (typeof BRIDGE_CAPABILITIES)[number];

/**
 * Question forms (capability "ui:form"). Pi's own extension-UI protocol only has select/confirm/input/
 * editor, so extensions that want a multi-question form in Studio (e.g. `questionnaire`) exchange these
 * records over the `pi.events` topics above, discriminated by `kind`:
 *   extension -> Studio on `toGui`:   StudioFormRequest | StudioFormCancel
 *   Studio -> extension on `fromGui`: StudioFormResult
 * Extensions live outside this repo and cannot import this package: they must mirror these shapes.
 */
export interface StudioFormOption {
  value: string;
  label: string;
  description?: string;
}

export interface StudioFormQuestion {
  id: string;
  /** Short tab/section label. */
  label: string;
  prompt: string;
  options: StudioFormOption[];
  /** Offer a free-text answer next to the options. */
  allowOther: boolean;
}

export interface StudioFormRequest {
  kind: "form";
  /** Correlates the request with its result / cancel. */
  id: string;
  title?: string;
  questions: StudioFormQuestion[];
}

/** The extension gave up (agent aborted): Studio should close the form without answering. */
export interface StudioFormCancel {
  kind: "form_cancel";
  id: string;
}

export interface StudioFormAnswer {
  id: string;
  /** Option value, or the typed text when `wasCustom`. */
  value: string;
  /** Option label, or the typed text when `wasCustom`. */
  label: string;
  wasCustom: boolean;
  /** 1-based position of the chosen option (omitted for custom text). */
  index?: number;
}

export interface StudioFormResult {
  kind: "form_result";
  id: string;
  cancelled: boolean;
  answers: StudioFormAnswer[];
}

/**
 * Subagent termination (capability "subagents:stop"). Studio asks the bridge to stop a running or queued
 * subagent; the bridge forwards it to the pi-subagents extension (`subagents:rpc:stop`) and reports back.
 *   Studio -> bridge on `fromGui`: StudioSubagentStop
 *   bridge -> Studio on `toGui`:   StudioSubagentStopResult
 */
export interface StudioSubagentStop {
  kind: "subagent_stop";
  /** Correlates the request with its result. */
  id: string;
  /**
   * The runner's agent id, when Studio knows it. A running *foreground* subagent never exposes its id in
   * tool updates, so Studio can instead identify it by `type` + `description` and the bridge resolves the id
   * from the `subagents:started` events it has seen.
   */
  agentId?: string;
  type?: string;
  description?: string;
}

export interface StudioSubagentStopResult {
  kind: "subagent_stop_result";
  id: string;
  /** The agent that was targeted ("" when none could be resolved). */
  agentId: string;
  ok: boolean;
  error?: string;
}

export function isStudioSubagentStopResult(value: unknown): value is StudioSubagentStopResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "subagent_stop_result" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { agentId?: unknown }).agentId === "string" &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

export interface StudioSubagentActivity {
  kind: "subagent_activity";
  runningCount: number;
  hasRunning: boolean;
  agents: Array<{ id: string; type: string; description: string }>;
}

export function isStudioSubagentActivity(value: unknown): value is StudioSubagentActivity {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "subagent_activity" &&
    typeof (value as { runningCount?: unknown }).runningCount === "number" &&
    typeof (value as { hasRunning?: unknown }).hasRunning === "boolean"
  );
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isOptString = (v: unknown): v is string | undefined => v === undefined || typeof v === "string";

/**
 * Narrow a bridge `event` payload to a usable form request. Payloads come from third-party extensions and
 * end up in React, so reject anything the modal could not render or the user could not answer: bad field
 * types, no questions, a question with neither options nor free text, or duplicate question ids.
 */
export function isStudioFormRequest(value: unknown): value is StudioFormRequest {
  if (!isRecord(value) || value.kind !== "form" || typeof value.id !== "string" || !isOptString(value.title)) return false;
  if (!Array.isArray(value.questions) || value.questions.length === 0) return false;
  const ids = new Set<string>();
  for (const q of value.questions) {
    if (!isRecord(q) || typeof q.id !== "string" || ids.has(q.id)) return false;
    ids.add(q.id);
    if (typeof q.prompt !== "string" || !isOptString(q.label) || typeof q.allowOther !== "boolean") return false;
    if (!Array.isArray(q.options) || (q.options.length === 0 && !q.allowOther)) return false;
    for (const o of q.options) {
      if (!isRecord(o) || typeof o.value !== "string" || typeof o.label !== "string" || !isOptString(o.description)) return false;
    }
  }
  return true;
}

export function isStudioFormCancel(value: unknown): value is StudioFormCancel {
  return isRecord(value) && value.kind === "form_cancel" && typeof value.id === "string";
}

export interface LinkedProject {
  /** Absolute path of the linked folder. */
  path: string;
  alias?: string;
  access: "read-only" | "read-write";
  /** Optional short description (e.g. first lines of README/AGENTS.md) shown to the model. */
  summary?: string;
}

/** Records sent by the bridge (inside Pi) to Studio. */
export type BridgeToStudio =
  | {
      v: 1;
      type: "hello";
      token: string;
      piVersion: string;
      cwd: string;
      mode: string;
      trusted: boolean;
      capabilities: readonly string[];
    }
  | { v: 1; type: "prompt_sections"; sections: Record<string, number> }
  | {
      v: 1;
      type: "boundary";
      phase: "agent_start" | "turn_end" | "agent_settled";
      leafEntryId: string | null;
    }
  | { v: 1; type: "event"; topic: string; data: unknown }
  | ({ v: 1; type: "registry" } & Omit<SessionRegistry, "receivedAt">)
  | { v: 1; type: "command_result"; id: string; ok: boolean; data?: unknown; error?: string };

/** Records sent by Studio to the bridge. */
export type StudioToBridge =
  | { v: 1; type: "config"; linkedProjects: LinkedProject[] }
  | { v: 1; type: "emit"; topic: string; data: unknown };

/** Command-context actions (payload of `/__studio <json>`). */
export type BridgeAction =
  | { id: string; action: "ping" }
  | { id: string; action: "navigate_tree"; entryId: string; summarize?: boolean }
  | { id: string; action: "reload" }
  | { id: string; action: "refresh_models" };

export type BridgeActionName = BridgeAction["action"];

/** Renders the `<linked_projects>` system-prompt section body from links. Shared by bridge and tests. */
export function renderLinkedProjectsSection(links: readonly LinkedProject[]): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = links.map((l) => {
    const attrs = [`path="${escape(l.path)}"`];
    if (l.alias) attrs.push(`alias="${escape(l.alias)}"`);
    attrs.push(`access="${l.access}"`);
    return l.summary
      ? `<project ${attrs.join(" ")}>${escape(l.summary)}</project>`
      : `<project ${attrs.join(" ")}/>`;
  });
  return [
    "The user linked these folders to this project as references. You may read them with your tools.",
    "Do not modify folders marked access=\"read-only\".",
    ...lines,
  ].join("\n");
}

export function isBridgeToStudio(value: unknown): value is BridgeToStudio {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { v?: unknown }).v === BRIDGE_PROTOCOL_VERSION &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
