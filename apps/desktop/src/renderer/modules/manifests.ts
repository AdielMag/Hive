/**
 * Static knowledge about every module (enabled or not), derived from the generated manifest index. Contains
 * metadata only, so importing it never loads module code.
 */
import type { ModuleManifest } from "@hive/module-sdk";
import { MODULE_MANIFESTS } from "../modules.generated.ts";

export { MODULE_MANIFESTS };

export const manifestById = (id: string): ModuleManifest | undefined => MODULE_MANIFESTS.find((m) => m.id === id);

/** Panel ids declared by manifests, so a persisted layout keeps panels of currently disabled modules. */
export function staticPanelIds(manifests: readonly ModuleManifest[] = MODULE_MANIFESTS): { left: Set<string>; right: Set<string> } {
  const left = new Set<string>();
  const right = new Set<string>();
  for (const m of manifests) {
    m.contributes?.leftPanels?.forEach((id) => left.add(id));
    m.contributes?.rightPanels?.forEach((id) => right.add(id));
  }
  return { left, right };
}

/** Command ids declared by manifests (so user key overrides survive while the module is disabled). */
export function staticCommandIds(manifests: readonly ModuleManifest[] = MODULE_MANIFESTS): Set<string> {
  const ids = new Set<string>();
  for (const m of manifests) m.contributes?.commands?.forEach((c) => ids.add(c.id));
  return ids;
}

/** The module that owns a tab kind / panel id according to the manifests. */
export function ownerOfTabKind(kind: string, manifests: readonly ModuleManifest[] = MODULE_MANIFESTS): ModuleManifest | undefined {
  return manifests.find((m) => m.contributes?.tabKinds?.includes(kind));
}

export function ownerOfPanel(side: "left" | "right", id: string, manifests: readonly ModuleManifest[] = MODULE_MANIFESTS): ModuleManifest | undefined {
  return manifests.find((m) => (side === "left" ? m.contributes?.leftPanels : m.contributes?.rightPanels)?.includes(id));
}
