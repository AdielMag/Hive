import { describe, expect, it } from "vitest";
import { describeAuthError, detectAuthError, toAuthProvider } from "./auth-errors.ts";

describe("detectAuthError", () => {
  it("recognises Pi's expired-credentials message and its provider", () => {
    const msg = `Authentication failed for "anthropic". Credentials may have expired or network is unavailable. Run '/login anthropic' to re-authenticate.`;
    expect(detectAuthError(msg)).toEqual({ providerId: "anthropic", kind: "expired" });
  });

  it("maps provider ids like google-antigravity", () => {
    const msg = `Authentication failed for "google-antigravity". Run '/login google-antigravity' to re-authenticate.`;
    expect(detectAuthError(msg)?.providerId).toBe("antigravity");
  });

  it("recognises missing credentials", () => {
    expect(detectAuthError("No API key found for anthropic.\n\nUse /login to log into a provider")).toEqual({
      providerId: "anthropic",
      kind: "missing",
    });
  });

  it("recognises refresh failures and falls back to the given provider", () => {
    expect(detectAuthError("OAuth token refresh failed: invalid_grant", "antigravity")).toEqual({
      providerId: "antigravity",
      kind: "refresh_failed",
    });
  });

  it("recognises raw provider 401s using keywords or the fallback", () => {
    expect(detectAuthError('401 {"type":"authentication_error","message":"invalid x-api-key"} (Anthropic)')).toEqual({
      providerId: "anthropic",
      kind: "expired",
    });
    expect(detectAuthError("HTTP 401 Unauthorized", "anthropic")?.providerId).toBe("anthropic");
  });

  it("returns null for non-auth errors and unknown providers", () => {
    expect(detectAuthError("529 overloaded_error")).toBeNull();
    expect(detectAuthError("Rate limit exceeded, retry in 30s", "anthropic")).toBeNull();
    expect(detectAuthError("Could not stop subagent: boom", "anthropic")).toBeNull();
    expect(detectAuthError("Authentication failed for \"some-local-llm\".", "some-local-llm")).toBeNull();
    expect(detectAuthError(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("toAuthProvider", () => {
    expect(toAuthProvider("anthropic")).toBe("anthropic");
    expect(toAuthProvider("openai-codex")).toBe("openai");
    expect(toAuthProvider("ollama")).toBeUndefined();
  });
  it("describeAuthError names the product", () => {
    expect(describeAuthError({ providerId: "anthropic", kind: "missing" })).toContain("Claude");
  });
});

describe("false positives", () => {
  it("ignores stray numbers", () => {
    expect(detectAuthError("Failed at line 401 of config.json", "anthropic")).toBeNull();
    expect(detectAuthError("status 401", "anthropic")?.kind).toBe("expired");
  });
});
