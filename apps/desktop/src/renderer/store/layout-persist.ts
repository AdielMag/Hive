export type CoreLeftPanel = "projects";
export type CoreRightPanel = "context";
/** Core panel id, or a module-contributed panel id (resolved through the module registry). */
export type LeftPanel = CoreLeftPanel | (string & {});
export type RightPanel = CoreRightPanel | (string & {});

export interface PersistedLayout {
  left: LeftPanel | null;
  right: RightPanel | null;
  leftWidth: number;
  rightWidth: number;
  composerHeight: number;
}

const VALID_LEFT_PANELS = new Set<string>(["projects"]);
const VALID_RIGHT_PANELS = new Set<string>(["context"]);

/** Panel ids contributed by modules, known statically from their manifests (enabled or not). */
export interface ExtraPanelIds {
  left?: ReadonlySet<string>;
  right?: ReadonlySet<string>;
}

export const LIMITS = {
  leftWidth: [200, 560] as const,
  rightWidth: [260, 760] as const,
  composerHeight: [96, 480] as const,
};

export const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));

/**
 * Sanitizes raw persisted layout from localStorage, gracefully dropping
 * deprecated panel identifiers (such as "limits") to null. Module panel ids are kept when a manifest declares
 * them, even while that module is disabled (the shell then shows an "Enable <module>" placeholder).
 */
export function sanitizeLayout(
  raw: Partial<Record<string, unknown>> | null | undefined,
  fallback: PersistedLayout,
  extra: ExtraPanelIds = {},
): PersistedLayout {
  if (!raw || typeof raw !== "object") return fallback;

  let left: LeftPanel | null = fallback.left;
  if (raw.left === null) {
    left = null;
  } else if (typeof raw.left === "string") {
    left = VALID_LEFT_PANELS.has(raw.left) || extra.left?.has(raw.left) ? (raw.left as LeftPanel) : null;
  }

  let right: RightPanel | null = fallback.right;
  if (raw.right === null) {
    right = null;
  } else if (typeof raw.right === "string") {
    right = VALID_RIGHT_PANELS.has(raw.right) || extra.right?.has(raw.right) ? (raw.right as RightPanel) : null;
  }

  return {
    left,
    right,
    leftWidth: clamp(Number(raw.leftWidth) || fallback.leftWidth, LIMITS.leftWidth),
    rightWidth: clamp(Number(raw.rightWidth) || fallback.rightWidth, LIMITS.rightWidth),
    composerHeight: clamp(Number(raw.composerHeight) || fallback.composerHeight, LIMITS.composerHeight),
  };
}
