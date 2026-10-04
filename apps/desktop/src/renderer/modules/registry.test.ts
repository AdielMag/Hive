import { afterEach, describe, expect, it, vi } from "vitest";
import type { RendererModule } from "@hive/module-sdk/renderer";
import { COMMANDS, COMMANDS_BY_ID, COMMAND_IDS, registerCommands, useCommandsVersion } from "../features/commands/registry.ts";
import type { Command } from "../features/commands/types.ts";
import { collectContributions } from "./registry.ts";
import { ownerOfPanel, ownerOfTabKind, staticCommandIds, staticPanelIds } from "./manifests.ts";

const Comp = () => null;
const loaded = (mods: Record<string, RendererModule>) => Object.fromEntries(Object.entries(mods).map(([id, module]) => [id, { module }]));

describe("collectContributions", () => {
  it("tags items with their module and flattens across modules", () => {
    const out = collectContributions(
      loaded({
        a: { id: "a", contributes: { tabKinds: [{ kind: "ka", component: Comp }] } },
        b: { id: "b", contributes: { tabKinds: [{ kind: "kb", component: Comp }] } },
      }),
      "tabKinds",
    );
    expect(out.map((x) => [x.moduleId, x.kind])).toEqual([
      ["a", "ka"],
      ["b", "kb"],
    ]);
  });

  it("orders by `order` (default 100) and is stable for ties", () => {
    const panel = (id: string, order?: number) => ({ id, title: id, icon: Comp, component: Comp, order });
    const out = collectContributions(
      loaded({
        a: { id: "a", contributes: { leftPanels: [panel("late", 200), panel("first-default")] } },
        b: { id: "b", contributes: { leftPanels: [panel("early", 5), panel("second-default")] } },
      }),
      "leftPanels",
    );
    expect(out.map((p) => p.id)).toEqual(["early", "first-default", "second-default", "late"]);
  });

  it("returns nothing for an empty point, and nothing once modules are unloaded", () => {
    const mods = loaded({ a: { id: "a", contributes: { statusBar: [{ id: "s", component: Comp }] } } });
    expect(collectContributions(mods, "settings")).toEqual([]);
    expect(collectContributions(mods, "statusBar")).toHaveLength(1);
    expect(collectContributions({}, "statusBar")).toEqual([]);
  });
});

describe("registerCommands", () => {
  const registered: Array<() => void> = [];
  afterEach(() => {
    while (registered.length) registered.pop()!();
  });
  const cmd = (id: string, run: () => void = () => {}): Command => ({ id, title: id, category: "Test", run });
  const add = (...cmds: Command[]) => {
    const off = registerCommands(cmds);
    registered.push(off);
    return off;
  };

  it("adds commands to the live list/map/set and removes exactly them on unregister", () => {
    const before = COMMANDS.length;
    const off = add(cmd("test.one"), cmd("test.two"));
    expect(COMMANDS.length).toBe(before + 2);
    expect(COMMANDS_BY_ID.has("test.one")).toBe(true);
    expect(COMMAND_IDS.has("test.two")).toBe(true);
    off();
    expect(COMMANDS.length).toBe(before);
    expect(COMMANDS_BY_ID.has("test.one")).toBe(false);
    expect(COMMAND_IDS.has("test.two")).toBe(false);
  });

  it("a later registration with the same id replaces the earlier one (stub becomes real command)", () => {
    const stub = vi.fn();
    const real = vi.fn();
    const offStub = add(cmd("test.swap", stub));
    add(cmd("test.swap", real));
    expect(COMMANDS.filter((c) => c.id === "test.swap")).toHaveLength(1);
    void COMMANDS_BY_ID.get("test.swap")!.run();
    expect(real).toHaveBeenCalledTimes(1);
    expect(stub).not.toHaveBeenCalled();
    offStub(); // the stub was already replaced; it must not remove the real command
    expect(COMMANDS_BY_ID.has("test.swap")).toBe(true);
  });

  it("refuses to override a core command", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = COMMANDS_BY_ID.get("palette.open");
    expect(original).toBeDefined();
    add(cmd("palette.open"));
    expect(COMMANDS_BY_ID.get("palette.open")).toBe(original);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("bumps the version store so palettes re-render", () => {
    const v = useCommandsVersion.getState().version;
    add(cmd("test.version"));
    expect(useCommandsVersion.getState().version).toBeGreaterThan(v);
  });
});

describe("static manifest lookups", () => {
  const manifests = [
    {
      id: "x",
      title: "X",
      description: "",
      tier: "bonus" as const,
      contributes: { leftPanels: ["lp"], rightPanels: ["rp"], tabKinds: ["tk"], commands: [{ id: "x.cmd", title: "Cmd" }] },
    },
  ];

  it("collects declared panel and command ids and finds their owners", () => {
    expect(staticPanelIds(manifests)).toEqual({ left: new Set(["lp"]), right: new Set(["rp"]) });
    expect(staticCommandIds(manifests)).toEqual(new Set(["x.cmd"]));
    expect(ownerOfTabKind("tk", manifests)?.id).toBe("x");
    expect(ownerOfPanel("left", "lp", manifests)?.id).toBe("x");
    expect(ownerOfPanel("right", "lp", manifests)).toBeUndefined();
    expect(ownerOfTabKind("nope", manifests)).toBeUndefined();
  });
});
