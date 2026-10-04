/**
 * Pure dependency logic over manifests (`requires`). Shared by the main-process host (authoritative) and the
 * renderer (to explain "required by …" in the Modules settings page).
 */
import type { ModuleManifest } from "./manifest.ts";

type Graph = ReadonlyMap<string, ModuleManifest>;

export function indexManifests(manifests: readonly ModuleManifest[]): Map<string, ModuleManifest> {
  return new Map(manifests.map((m) => [m.id, m]));
}

/** Every `requires` cycle, each reported as a path like ["a", "b", "a"]. */
export function findCycles(manifests: readonly ModuleManifest[]): string[][] {
  const graph = indexManifests(manifests);
  const cycles: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string) => {
    const s = state.get(id);
    if (s === "done") return;
    if (s === "visiting") {
      cycles.push([...stack.slice(stack.indexOf(id)), id]);
      return;
    }
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of graph.get(id)?.requires ?? []) if (graph.has(dep)) visit(dep);
    stack.pop();
    state.set(id, "done");
  };
  for (const m of manifests) visit(m.id);
  return cycles;
}

/** Problems that make the module set unusable: unknown `requires` targets and cycles. */
export function validateGraph(manifests: readonly ModuleManifest[]): string[] {
  const graph = indexManifests(manifests);
  const errors: string[] = [];
  for (const m of manifests) {
    for (const dep of m.requires ?? []) if (!graph.has(dep)) errors.push(`${m.id} requires unknown module "${dep}"`);
  }
  for (const c of findCycles(manifests)) errors.push(`dependency cycle: ${c.join(" -> ")}`);
  return errors;
}

/** `ids` plus everything they require, transitively. Unknown ids are dropped. Cycle-safe. */
export function withRequirements(graph: Graph, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const add = (id: string) => {
    if (out.has(id) || !graph.has(id)) return;
    out.add(id);
    for (const dep of graph.get(id)?.requires ?? []) add(dep);
  };
  for (const id of ids) add(id);
  return out;
}

/** Enabled modules that (transitively) require `id`, excluding `id` itself. */
export function dependentsOf(graph: Graph, enabled: Iterable<string>, id: string): string[] {
  const on = new Set(enabled);
  const out = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const other of on) {
      if (other === id || out.has(other)) continue;
      const reqs = graph.get(other)?.requires ?? [];
      if (reqs.some((r) => r === id || out.has(r))) {
        out.add(other);
        changed = true;
      }
    }
  }
  return [...out];
}

/** Normalizes a stored enabled list: known ids only, core tier always on, requirements pulled in. */
export function normalizeEnabled(manifests: readonly ModuleManifest[], enabled: Iterable<string>): string[] {
  const graph = indexManifests(manifests);
  const core = manifests.filter((m) => m.tier === "core").map((m) => m.id);
  return sortByDependencies(manifests, withRequirements(graph, [...enabled, ...core]));
}

/**
 * Enabled set after turning one module on/off.
 * - on: adds the module and its requirements.
 * - off: removes the module and every enabled module depending on it. Core-tier modules can't be disabled.
 */
export function computeToggle(manifests: readonly ModuleManifest[], enabled: Iterable<string>, id: string, on: boolean): string[] {
  const graph = indexManifests(manifests);
  const current = new Set(normalizeEnabled(manifests, enabled));
  if (!graph.has(id)) throw new Error(`Unknown module "${id}"`);
  if (on) {
    for (const x of withRequirements(graph, [id])) current.add(x);
  } else {
    const removed = [id, ...dependentsOf(graph, current, id)];
    const coreHit = removed.find((x) => graph.get(x)?.tier === "core");
    if (coreHit) throw new Error(`"${coreHit}" is a core module and can't be disabled`);
    for (const x of removed) current.delete(x);
  }
  return sortByDependencies(manifests, current);
}

/** Topological order (requirements first); ties keep manifest order. Cycle members are appended last. */
export function sortByDependencies(manifests: readonly ModuleManifest[], ids: Iterable<string>): string[] {
  const graph = indexManifests(manifests);
  const want = new Set(ids);
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (seen.has(id) || path.has(id) || !want.has(id)) return;
    path.add(id);
    for (const dep of graph.get(id)?.requires ?? []) visit(dep, path);
    path.delete(id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const m of manifests) visit(m.id, new Set());
  return out;
}
