import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaSnapshot } from "@hive/protocol";
import { setLimitsHost } from "./limits-host.ts";
import { POLL_MS, startQuotaPolling, useLimits } from "./limits-store.ts";

const snap = (fetchedAt: number): QuotaSnapshot => ({ providers: [], fetchedAt });

describe("limits store", () => {
  let invoke: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    useLimits.setState({ quota: null, loading: false, error: null });
    invoke = vi.fn(async () => snap(Date.now()));
    setLimitsHost({ ipc: { invoke } } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    setLimitsHost(null);
  });

  it("refresh stores the snapshot and passes force through", async () => {
    await useLimits.getState().refresh(true);
    expect(invoke).toHaveBeenCalledWith("get", { force: true });
    expect(useLimits.getState().quota).not.toBeNull();
    expect(useLimits.getState().loading).toBe(false);
  });

  it("records errors without throwing", async () => {
    invoke.mockRejectedValueOnce(new Error("offline"));
    await useLimits.getState().refresh();
    expect(useLimits.getState().error).toBe("offline");
  });

  it("polling fetches immediately, repeats on the interval and stops when disposed", async () => {
    const stop = startQuotaPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not refetch on start when the cached snapshot is fresh", async () => {
    useLimits.setState({ quota: snap(Date.now()) });
    const stop = startQuotaPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).not.toHaveBeenCalled();
    stop();
  });
});
