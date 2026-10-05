import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleHost } from "@hive/module-sdk/renderer";

const runCommand = vi.fn(async () => undefined);
vi.mock("./terminal-registry.ts", () => ({ runCommand }));

import { runInTerminal } from "./run-in-terminal.ts";

function host() {
  const open = vi.fn();
  return { h: { panels: { open } } as unknown as ModuleHost, open };
}

describe("runInTerminal", () => {
  beforeEach(() => runCommand.mockClear());

  it("opens the panel and hands the command to the registry", async () => {
    const { h, open } = host();
    await runInTerminal(h, { command: "node a.js", cwd: "/p" });
    expect(open).toHaveBeenCalledWith("right", "terminal");
    expect(runCommand).toHaveBeenCalledWith(h, "node a.js", "/p");
  });

  it("ignores missing or blank commands", async () => {
    const { h, open } = host();
    await runInTerminal(h, undefined);
    await runInTerminal(h, { command: "   " });
    expect(open).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
