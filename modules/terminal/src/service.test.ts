import { describe, it, expect, afterEach } from "vitest";
import { platform } from "node:os";
import { TerminalManager } from "./service.ts";

const isWin = platform() === "win32";
/** Fastest-starting shell per platform keeps the tests quick. */
const SHELL_ID = isWin ? "cmd" : undefined;
const NL = isWin ? "\r" : "\n";

function waitFor(cond: () => boolean, ms = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error("timeout"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe("TerminalManager", () => {
  const manager = new TerminalManager();

  afterEach(() => {
    manager.disposeAll();
  });

  it("detects a valid default shell and lists options with exactly one default", () => {
    const { shell } = manager.getDefaultShell();
    expect(shell.length).toBeGreaterThan(0);
    const shells = manager.listShells();
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.filter((s) => s.isDefault)).toHaveLength(1);
  });

  it("creates a session, lists it, and kills it", () => {
    const session = manager.createTerminal({ shellId: SHELL_ID }, () => {}, () => {});
    expect(session.id).toBeDefined();
    expect(session.shell).toBeDefined();
    expect(manager.list().some((s) => s.id === session.id)).toBe(true);
    manager.kill(session.id);
    expect(manager.list().some((s) => s.id === session.id)).toBe(false);
  });

  it("runs a command through a real PTY and streams output with increasing seq", async () => {
    let out = "";
    let lastSeq = 0;
    let monotonic = true;
    const session = manager.createTerminal(
      { shellId: SHELL_ID },
      (_id, data, seq) => {
        out += data;
        if (seq <= lastSeq) monotonic = false;
        lastSeq = seq;
      },
      () => {},
    );
    manager.write(session.id, `echo hive-pty-ok${NL}`);
    await waitFor(() => out.includes("hive-pty-ok"));
    expect(monotonic).toBe(true);
    const attached = manager.attach(session.id);
    expect(attached?.scrollback).toContain("hive-pty-ok");
    expect(attached?.seq).toBe(lastSeq);
  });

  it("resizes the PTY and ignores bad dimensions", async () => {
    let out = "";
    const session = manager.createTerminal({ shellId: SHELL_ID, cols: 80, rows: 24 }, (_i, d) => (out += d), () => {});
    expect(() => manager.resize(session.id, 0, 0)).not.toThrow();
    expect(() => manager.resize(session.id, 120, 30)).not.toThrow();
    if (!isWin) {
      manager.write(session.id, `stty size${NL}`);
      await waitFor(() => out.includes("30 120"));
    }
  });

  it("reports the exit code when the shell exits on its own", async () => {
    let exit: number | null = null;
    const session = manager.createTerminal({ shellId: SHELL_ID }, () => {}, (_id, code) => (exit = code));
    manager.write(session.id, `exit 3${NL}`);
    await waitFor(() => exit !== null);
    expect(exit).toBe(3);
    expect(manager.list().some((s) => s.id === session.id)).toBe(false);
  });

  it("does not emit exit for sessions the caller killed", async () => {
    let exited = false;
    const session = manager.createTerminal({ shellId: SHELL_ID }, () => {}, () => (exited = true));
    manager.kill(session.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(exited).toBe(false);
  });

  it("falls back to the home dir when cwd does not exist", () => {
    const session = manager.createTerminal({ shellId: SHELL_ID, cwd: "/definitely/not/here" }, () => {}, () => {});
    expect(session.cwd).not.toBe("/definitely/not/here");
  });
});
