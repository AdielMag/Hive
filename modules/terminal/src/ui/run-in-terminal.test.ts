import { describe, expect, it, vi } from "vitest";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { runInTerminal } from "./run-in-terminal.ts";

function host(existing: Array<{ id: string }>) {
  const invoke = vi.fn(async (method: string) => {
    if (method === "list") return existing;
    if (method === "create") return { id: "t_new", shell: "sh", cwd: "/x" };
    return undefined;
  });
  const open = vi.fn();
  return { h: { ipc: { invoke }, panels: { open } } as unknown as ModuleHost, invoke, open };
}

describe("runInTerminal", () => {
  it("reuses the first existing shell and types the command with Enter", async () => {
    const { h, invoke, open } = host([{ id: "t_1" }, { id: "t_2" }]);
    await runInTerminal(h, { command: "node a.js", cwd: "/p" });
    expect(open).toHaveBeenCalledWith("right", "terminal");
    expect(invoke).not.toHaveBeenCalledWith("create", expect.anything());
    expect(invoke).toHaveBeenCalledWith("write", { id: "t_1", data: "node a.js\r" });
  });

  it("creates a shell in cwd when none exists", async () => {
    const { h, invoke } = host([]);
    await runInTerminal(h, { command: "ls", cwd: "/proj" });
    expect(invoke).toHaveBeenCalledWith("create", { cwd: "/proj" });
    expect(invoke).toHaveBeenCalledWith("write", { id: "t_new", data: "ls\r" });
  });

  it("ignores missing or blank commands", async () => {
    const { h, invoke, open } = host([]);
    await runInTerminal(h, undefined);
    await runInTerminal(h, { command: "   " });
    expect(open).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
