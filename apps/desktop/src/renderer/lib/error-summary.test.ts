import { describe, expect, it } from "vitest";
import { summarizeError } from "./error-summary.ts";

describe("summarizeError", () => {
  it("rate limit", () => {
    const res = summarizeError("HTTP 429 Too Many Requests");
    expect(res.headline).toBe("Rate limit reached — wait a moment and try again");
    expect(res.action).toBe("retry");
  });
  it("context too long suggests compact", () => {
    for (const m of ["context length exceeded", "prompt is too long: 250000 tokens", "too many tokens"]) {
      expect(summarizeError(m)).toEqual({ headline: "This conversation is too long for the model", action: "compact" });
    }
  });
  it("network", () => {
    for (const m of ["connect ECONNREFUSED 127.0.0.1", "getaddrinfo ENOTFOUND api.x.com", "TypeError: fetch failed"]) {
      const res = summarizeError(m);
      expect(res.headline).toBe("Can't reach the provider — check your connection");
      expect(res.action).toBe("retry");
    }
  });
  it("overloaded", () => {
    const res = summarizeError("529 overloaded_error");
    expect(res.headline).toBe("The provider is overloaded — try again shortly");
    expect(res.action).toBe("retry");
  });
  it("auth", () => {
    for (const m of ["401 Unauthorized", "403 forbidden", "invalid api key"]) {
      expect(summarizeError(m).headline).toBe("Authentication failed — sign in again in Settings › AI Providers");
    }
  });
  it("fallback: first non-empty line, capped", () => {
    expect(summarizeError("\n  boom happened \nstack").headline).toBe("boom happened");
    expect(summarizeError("x".repeat(300)).headline.length).toBeLessThanOrEqual(160);
  });
});
