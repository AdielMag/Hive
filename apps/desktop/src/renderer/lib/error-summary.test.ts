import { describe, expect, it } from "vitest";
import { summarizeError } from "./error-summary.ts";

describe("summarizeError", () => {
  it("rate limit", () => {
    expect(summarizeError("HTTP 429 Too Many Requests").headline).toBe("Rate limit reached — wait a moment and try again");
    expect(summarizeError("rate_limit_error").action).toBeUndefined();
  });
  it("context too long suggests compact", () => {
    for (const m of ["context length exceeded", "prompt is too long: 250000 tokens", "too many tokens"]) {
      expect(summarizeError(m)).toEqual({ headline: "This conversation is too long for the model", action: "compact" });
    }
  });
  it("network", () => {
    for (const m of ["connect ECONNREFUSED 127.0.0.1", "getaddrinfo ENOTFOUND api.x.com", "TypeError: fetch failed"]) {
      expect(summarizeError(m).headline).toBe("Can't reach the provider — check your connection");
    }
  });
  it("overloaded", () => {
    expect(summarizeError("529 overloaded_error").headline).toBe("The provider is overloaded — try again shortly");
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
