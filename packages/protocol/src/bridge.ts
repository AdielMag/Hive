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

export const BRIDGE_PROTOCOL_VERSION = 1 as const;

/** Environment variables Studio sets on each Pi process. */
export const BRIDGE_ENV = {
  /** Pipe path (Windows) or socket path (POSIX). */
  address: "PI_STUDIO_BRIDGE",
  /** One-time token; the first record from the bridge must echo it. */
  token: "PI_STUDIO_TOKEN",
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
  "actions:ping",
  "actions:navigate_tree",
  "actions:reload",
  "actions:refresh_models",
] as const;
export type BridgeCapability = (typeof BRIDGE_CAPABILITIES)[number];

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
