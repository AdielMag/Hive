/** Setup presets offered on first run and in Settings → Modules. Pure, so they can be unit-tested. */
import { normalizeEnabled, type ModuleManifest, type ModuleTier } from "@hive/module-sdk";

export type PresetId = "minimal" | "recommended" | "everything";

export interface Preset {
  id: PresetId;
  title: string;
  blurb: string;
}

export const PRESETS: readonly Preset[] = [
  { id: "minimal", title: "Minimal", blurb: "Sessions and chat only. Add anything later." },
  { id: "recommended", title: "Recommended", blurb: "The tools most people use every day." },
  { id: "everything", title: "Everything", blurb: "Every available module." },
];

const TIER_ORDER: readonly ModuleTier[] = ["core", "recommended", "bonus"];

/** Module ids a preset turns on (requirements pulled in, core tier always included). */
export function presetIds(manifests: readonly ModuleManifest[], preset: PresetId): string[] {
  const pick = (m: ModuleManifest) => (preset === "everything" ? true : preset === "recommended" ? m.tier !== "bonus" : m.tier === "core");
  return normalizeEnabled(manifests, manifests.filter(pick).map((m) => m.id));
}

/** Which preset (if any) exactly matches an enabled set. */
export function matchingPreset(manifests: readonly ModuleManifest[], enabled: readonly string[]): PresetId | null {
  const key = (ids: readonly string[]) => [...ids].sort().join("|");
  const current = key(normalizeEnabled(manifests, enabled));
  return PRESETS.find((p) => key(presetIds(manifests, p.id)) === current)?.id ?? null;
}

/** Manifests grouped by tier, in display order, skipping empty tiers. */
export function groupByTier(manifests: readonly ModuleManifest[]): Array<{ tier: ModuleTier; modules: ModuleManifest[] }> {
  return TIER_ORDER.map((tier) => ({ tier, modules: manifests.filter((m) => m.tier === tier) })).filter((g) => g.modules.length > 0);
}

export const TIER_LABEL: Record<ModuleTier, string> = {
  core: "Built in",
  recommended: "Recommended",
  bonus: "Optional extras",
};
