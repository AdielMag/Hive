import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { PiRpcConnection, PiRpcError } from "../src/node/rpc-connection.ts";

describe("PiRpcConnection", () => {
  let conn: PiRpcConnection;
  let mockChild: any;
  let stdout: PassThrough;
  let stderr: PassThrough;
  let stdin: PassThrough;

  beforeEach(() => {
    stdout = new PassThrough();
    stderr = new PassThrough();
    stdin = new PassThrough();

    mockChild = new EventEmitter();
    mockChild.stdout = stdout;
    mockChild.stderr = stderr;
    mockChild.stdin = stdin;
    mockChild.pid = 12345;

    conn = new PiRpcConnection({
      nodePath: "node",
      cliPath: "cli.js",
      cwd: ".",
    });

    // Inject child process without actually spawning
    (conn as any).child = mockChild;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles null and non-object lines gracefully without throwing", () => {
    const errorListener = vi.fn();
    conn.onProtocolError(errorListener);

    // Should not throw on null or primitive JSON
    (conn as any).handleLine("null");
    (conn as any).handleLine("123");
    (conn as any).handleLine('"just a string"');
    (conn as any).handleLine("not-even-json");

    expect(errorListener).toHaveBeenCalledTimes(4);
  });

  it("rate-limits protocol error console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 10; i++) {
      (conn as any).handleLine("null");
    }

    // Only first error should log immediately within 2 seconds
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[pi-adapter] protocol error: Non-object stdout record: null"));
  });

  it("send() applies 60s default timeout for standard commands", async () => {
    vi.useFakeTimers();

    const sendPromise = conn.send({ type: "get_state" });

    // Fast-forward past default timeout
    vi.advanceTimersByTime(60_001);

    await expect(sendPromise).rejects.toThrow(PiRpcError);
    await expect(sendPromise).rejects.toThrow(/Timed out after 60000 ms waiting for get_state/);

    vi.useRealTimers();
  });

  it("send() respects explicit timeoutMs", async () => {
    vi.useFakeTimers();

    const sendPromise = conn.send({ type: "get_state" }, { timeoutMs: 500 });

    vi.advanceTimersByTime(501);

    await expect(sendPromise).rejects.toThrow(/Timed out after 500 ms waiting for get_state/);

    vi.useRealTimers();
  });

  it("send() does not apply default timeout for exempt long-running commands", async () => {
    vi.useFakeTimers();

    const compactPromise = conn.send({ type: "compact" });
    const promptPromise = conn.send({ type: "prompt", message: "hi" });
    const bashPromise = conn.send({ type: "bash", command: "ls" });

    vi.advanceTimersByTime(120_000);

    // Pending entries should still be present and not rejected
    expect((conn as any).pending.size).toBe(3);

    // When response arrives, it resolves cleanly
    (conn as any).handleLine(JSON.stringify({ type: "response", id: "s1", success: true }));
    (conn as any).handleLine(JSON.stringify({ type: "response", id: "s2", success: true }));
    (conn as any).handleLine(JSON.stringify({ type: "response", id: "s3", success: true }));
    const compactResult = await compactPromise;
    const promptResult = await promptPromise;
    const bashResult = await bashPromise;
    expect(compactResult.success).toBe(true);
    expect(promptResult.success).toBe(true);
    expect(bashResult.success).toBe(true);

    vi.useRealTimers();
  });

  it("cleans up timer when response arrives", async () => {
    vi.useFakeTimers();

    const sendPromise = conn.send({ type: "get_state" }, { timeoutMs: 10_000 });
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    (conn as any).handleLine(JSON.stringify({ type: "response", id: "s1", success: true }));
    const result = await sendPromise;
    expect(result.success).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
