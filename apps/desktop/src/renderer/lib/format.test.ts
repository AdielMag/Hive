import { describe, expect, it } from "vitest";
import { formatAgoShort } from "./format.ts";

describe("formatAgoShort", () => {
  const base = 1_700_000_000_000;

  it("returns 'now' for times less than a minute ago or in the future", () => {
    expect(formatAgoShort(base, base)).toBe("now");
    expect(formatAgoShort(base - 30_000, base)).toBe("now");
    expect(formatAgoShort(base - 59_999, base)).toBe("now");
    expect(formatAgoShort(base + 10_000, base)).toBe("now");
  });

  it("formats minutes (e.g. 44m)", () => {
    expect(formatAgoShort(base - 60_000, base)).toBe("1m");
    expect(formatAgoShort(base - 44 * 60_000, base)).toBe("44m");
    expect(formatAgoShort(base - 59 * 60_000, base)).toBe("59m");
  });

  it("formats hours (e.g. 3h)", () => {
    expect(formatAgoShort(base - 60 * 60_000, base)).toBe("1h");
    expect(formatAgoShort(base - 3 * 3600_000, base)).toBe("3h");
    expect(formatAgoShort(base - 23 * 3600_000, base)).toBe("23h");
  });

  it("formats days (e.g. 2d)", () => {
    expect(formatAgoShort(base - 24 * 3600_000, base)).toBe("1d");
    expect(formatAgoShort(base - 2 * 86400_000, base)).toBe("2d");
    expect(formatAgoShort(base - 6 * 86400_000, base)).toBe("6d");
  });

  it("formats weeks (e.g. 5w)", () => {
    expect(formatAgoShort(base - 7 * 86400_000, base)).toBe("1w");
    expect(formatAgoShort(base - 5 * 7 * 86400_000, base)).toBe("5w");
    expect(formatAgoShort(base - 52 * 7 * 86400_000, base)).toBe("52w");
  });

  it("supports Date and ISO string inputs", () => {
    expect(formatAgoShort(new Date(base - 44 * 60_000), base)).toBe("44m");
    expect(formatAgoShort(new Date(base - 3 * 3600_000).toISOString(), base)).toBe("3h");
  });

  it("handles non-finite timestamps gracefully", () => {
    expect(formatAgoShort(Number.NaN, base)).toBe("now");
    expect(formatAgoShort("invalid", base)).toBe("now");
  });
});
