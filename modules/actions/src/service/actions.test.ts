import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createGithubClient, normalizeRun, toState } from "./github.ts";
import { parseGithubRemote } from "./remote.ts";
import { createTokenProvider } from "./token.ts";

describe("parseGithubRemote", () => {
  it.each([
    ["https://github.com/AdielMag/Hive.git", "AdielMag", "Hive"],
    ["https://github.com/AdielMag/Hive", "AdielMag", "Hive"],
    ["https://user@github.com/o/r.git", "o", "r"],
    ["git@github.com:o/r.git", "o", "r"],
    ["ssh://git@github.com/o/r.git", "o", "r"],
    ["https://github.com/o/my.repo.git", "o", "my.repo"],
  ])("parses %s", (url, owner, repo) => {
    expect(parseGithubRemote(url)).toEqual({ owner, repo });
  });
  it("rejects other hosts", () => {
    expect(parseGithubRemote("https://gitlab.com/o/r.git")).toBeNull();
    expect(parseGithubRemote("git@bitbucket.org:o/r.git")).toBeNull();
    expect(parseGithubRemote("")).toBeNull();
  });
});

describe("toState", () => {
  it("maps status and conclusion", () => {
    expect(toState("queued", null)).toBe("queued");
    expect(toState("waiting", null)).toBe("queued");
    expect(toState("in_progress", null)).toBe("running");
    expect(toState("completed", "success")).toBe("success");
    expect(toState("completed", "timed_out")).toBe("failure");
    expect(toState("completed", "cancelled")).toBe("cancelled");
    expect(toState("completed", "skipped")).toBe("skipped");
    expect(toState("completed", "action_required")).toBe("neutral");
  });
});

describe("normalizeRun", () => {
  it("falls back to the commit message for the title", () => {
    const run = normalizeRun({ id: 1, run_number: 7, name: "CI", status: "in_progress", head_commit: { message: "fix: x\n\nbody" }, created_at: "t", updated_at: "t" });
    expect(run.title).toBe("fix: x");
    expect(run.state).toBe("running");
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

describe("github client", () => {
  const repo = { owner: "o", repo: "r" };

  it("sends the token and reuses cached bodies on 304", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push({ url, headers: init.headers });
      if (calls.length === 1) return jsonResponse({ total_count: 1, workflow_runs: [{ id: 5, run_number: 1, status: "queued", name: "CI" }] }, { headers: { etag: '"abc"' } });
      return new Response(null, { status: 304 });
    });
    const client = createGithubClient({ getToken: async () => "tok", fetchImpl: fetchImpl as any });
    const first = await client.runs(repo, { status: "queued", branch: "main" });
    const second = await client.runs(repo, { status: "queued", branch: "main" });
    expect(first).toEqual(second);
    expect(first.ok && first.data.runs[0]?.state).toBe("queued");
    expect(calls[0]!.headers.Authorization).toBe("Bearer tok");
    expect(calls[1]!.headers["If-None-Match"]).toBe('"abc"');
    expect(calls[0]!.url).toContain("/repos/o/r/actions/runs?");
    expect(calls[0]!.url).toContain("status=queued");
    expect(calls[0]!.url).toContain("branch=main");
  });

  it("uses the workflow endpoint when filtering by workflow", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ total_count: 0, workflow_runs: [] }));
    const client = createGithubClient({ getToken: async () => null, fetchImpl: fetchImpl as any });
    await client.runs(repo, { workflowId: 42, status: "all" });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/actions/workflows/42/runs");
    expect(url).not.toContain("status=");
  });

  it.each([
    [401, {}, "unauthorized"],
    [404, {}, "not_found"],
    [403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1900000000" }, "rate_limited"],
    [403, {}, "unauthorized"],
    [500, {}, "unknown"],
  ])("maps HTTP %s to %s", async (status, headers, code) => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status, headers }));
    const client = createGithubClient({ getToken: async () => null, fetchImpl: fetchImpl as any });
    const res = await client.workflows(repo);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.code).toBe(code);
  });

  it("reports network failures", async () => {
    const client = createGithubClient({ getToken: async () => null, fetchImpl: (async () => Promise.reject(new Error("offline"))) as any });
    const res = await client.jobs(repo, 1);
    expect(!res.ok && res.code).toBe("network");
  });

  it("normalises jobs and steps", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jobs: [{ id: 1, name: "build", status: "completed", conclusion: "failure", html_url: "u", steps: [{ number: 1, name: "checkout", status: "completed", conclusion: "success" }] }] }),
    );
    const client = createGithubClient({ getToken: async () => null, fetchImpl: fetchImpl as any });
    const res = await client.jobs(repo, 9);
    expect(res.ok && res.data[0]?.steps[0]?.state).toBe("success");
    expect(res.ok && res.data[0]?.state).toBe("failure");
  });
});

describe("token provider", () => {
  it("prefers env, then the saved token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ga-token-"));
    try {
      const withEnv = createTokenProvider(() => dir, { GITHUB_TOKEN: "from-env" });
      expect(await withEnv.resolve()).toEqual({ token: "from-env", source: "env" });

      const saved = createTokenProvider(() => dir, { PATH: process.env.PATH });
      saved.save("  from-file  ");
      expect(await saved.resolve()).toEqual({ token: "from-file", source: "saved" });
      saved.clear();
      const after = await saved.resolve();
      expect(after.source === "none" || after.source === "git").toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
