import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLink, setLinkHandler } from "./link-bus.ts";

describe("link-bus", () => {
  const openSystemBrowser = vi.fn(async () => {});
  beforeEach(() => {
    openSystemBrowser.mockClear();
    (globalThis as any).window = { studio: { openSystemBrowser } };
  });
  afterEach(() => vi.restoreAllMocks());

  it("falls back to the system browser when nothing claims links", () => {
    openLink("https://pi.dev");
    expect(openSystemBrowser).toHaveBeenCalledWith("https://pi.dev");
  });

  it("routes to the registered handler and stops routing after dispose", () => {
    const fn = vi.fn();
    const off = setLinkHandler("browser", fn);
    openLink("https://a.dev", "A");
    expect(fn).toHaveBeenCalledWith("https://a.dev", "A");
    expect(openSystemBrowser).not.toHaveBeenCalled();
    off();
    openLink("https://b.dev");
    expect(openSystemBrowser).toHaveBeenCalledWith("https://b.dev");
  });

  it("falls back when the handler throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const off = setLinkHandler("bad", () => { throw new Error("boom"); });
    openLink("https://c.dev");
    expect(openSystemBrowser).toHaveBeenCalledWith("https://c.dev");
    off();
  });

  it("a stale disposer does not release a newer owner", () => {
    const offOld = setLinkHandler("old", vi.fn());
    const fn = vi.fn();
    setLinkHandler("new", fn);
    offOld();
    openLink("https://d.dev");
    expect(fn).toHaveBeenCalled();
  });
});
