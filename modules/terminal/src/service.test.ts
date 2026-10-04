import { describe, it, expect, afterEach } from "vitest";
import { TerminalManager } from "./service.ts";

describe("TerminalManager", () => {
  const manager = new TerminalManager();

  afterEach(() => {
    manager.disposeAll();
  });

  it("detects a valid default shell", () => {
    const { shell } = manager.getDefaultShell();
    expect(shell).toBeDefined();
    expect(typeof shell).toBe("string");
    expect(shell.length).toBeGreaterThan(0);
  });

  it("creates a terminal session and returns session info", () => {
    const session = manager.createTerminal(
      {},
      () => {},
      () => {},
    );
    expect(session.id).toBeDefined();
    expect(session.shell).toBeDefined();
    expect(session.cwd).toBeDefined();

    const list = manager.list();
    expect(list.some((s) => s.id === session.id)).toBe(true);
  });

  it("kills a terminal session and removes it from list", () => {
    const session = manager.createTerminal(
      {},
      () => {},
      () => {},
    );
    manager.kill(session.id);
    const list = manager.list();
    expect(list.some((s) => s.id === session.id)).toBe(false);
  });

  it("can write and resize without crashing", () => {
    const session = manager.createTerminal(
      {},
      () => {},
      () => {},
    );
    expect(() => {
      manager.write(session.id, "echo hello\r\n");
      manager.resize(session.id, 100, 30);
    }).not.toThrow();
  });
});
