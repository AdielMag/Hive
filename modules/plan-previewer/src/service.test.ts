import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PlanPreviewerService, sanitizeOrigin } from "./service.ts";

describe("PlanPreviewerService", () => {
  let tempDir = "";
  let service: PlanPreviewerService | null = null;

  afterEach(() => {
    if (service) {
      service.dispose();
      service = null;
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("starts HTTP server and handles plan feedback", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-plan-test-"));
    const planFile = path.join(tempDir, "plan.md");
    fs.writeFileSync(planFile, "# Test Plan\n\nSome plan content here.", "utf8");

    service = new PlanPreviewerService();
    service.setActivePlan(planFile, "Testing Plan Context");

    const data = service.getPlanData(planFile);
    expect(data).not.toBeNull();
    expect(data?.filename).toBe("plan.md");
    expect(data?.content).toContain("Some plan content here.");

    // Submit feedback with execution mode
    const feedbackRes = service.submitFeedback({
      filePath: planFile,
      status: "approved",
      comment: "Looks solid, proceed!",
      executionMode: "auto-edit",
      choices: [{ id: "D1", title: "DB", selected: "SQLite" }],
      questions: [],
      answers: [],
    });

    expect(feedbackRes.success).toBe(true);

    // Verify .plan-feedback.json was generated
    const jsonPath = path.join(tempDir, ".plan-feedback.json");
    expect(fs.existsSync(jsonPath)).toBe(true);
    const savedJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(savedJson.status).toBe("approved");
    expect(savedJson.executionMode).toBe("auto-edit");
    expect(savedJson.comment).toBe("Looks solid, proceed!");

    // Verify .plan-feedback.md was generated
    const mdPath = path.join(tempDir, ".plan-feedback.md");
    expect(fs.existsSync(mdPath)).toBe(true);
    const savedMd = fs.readFileSync(mdPath, "utf8");
    expect(savedMd).toContain("AUTO-EDIT");
    expect(savedMd).toContain("Looks solid, proceed!");
  });

  it("only listens after start() and stops on dispose()", async () => {
    service = new PlanPreviewerService();
    expect(service.isListening()).toBe(false);
    service.start(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(service.isListening()).toBe(true);
    const port = service.getPort();
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    expect((await res.json()).running).toBe(true);
    service.dispose();
    expect(service.isListening()).toBe(false);
  });

  it("emits openPlanTab through the event sink on /api/notify", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-plan-test-"));
    const planFile = path.join(tempDir, "plan.md");
    fs.writeFileSync(planFile, "# P\n", "utf8");
    const events: Array<[string, unknown]> = [];
    service = new PlanPreviewerService((event, payload) => events.push([event, payload]));
    service.start(0);
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`http://127.0.0.1:${service.getPort()}/api/notify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: planFile, context: "ctx" }),
    });
    expect(events).toEqual([["openPlanTab", { filePath: path.resolve(planFile), context: "ctx" }]]);
  });
});

describe("PlanPreviewerService isolation between concurrent plans", () => {
  let dirs: string[] = [];
  let service: PlanPreviewerService | null = null;

  afterEach(() => {
    service?.dispose();
    service = null;
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    dirs = [];
  });

  const makePlan = (name: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hive-plan-${name}-`));
    dirs.push(dir);
    const file = path.join(dir, "plan.md");
    fs.writeFileSync(file, `# ${name}\n`, "utf8");
    return file;
  };

  const approve = (svc: PlanPreviewerService, filePath: string) =>
    svc.submitFeedback({ filePath, status: "approved", comment: "", executionMode: "auto-edit", choices: [], questions: [], answers: [] });

  it("approving one plan does not mark the other approved", () => {
    const a = makePlan("a");
    const b = makePlan("b");
    service = new PlanPreviewerService();
    service.setActivePlan(a, "A");
    service.setActivePlan(b, "B");

    expect(approve(service, a).success).toBe(true);
    expect(service.getPlanData(a)?.planApproved).toBe(true);
    expect(service.getPlanData(b)?.planApproved).toBe(false);
  });

  it("approving one plan releases only its own waiting CLI call", async () => {
    const a = makePlan("a");
    const b = makePlan("b");
    service = new PlanPreviewerService();
    service.start(0);
    await new Promise((r) => setTimeout(r, 50));
    const base = `http://127.0.0.1:${service.getPort()}`;
    for (const f of [a, b]) {
      await fetch(`${base}/api/notify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath: f, context: "ctx" }) });
    }

    const waitA = fetch(`${base}/api/wait-feedback?planFile=${encodeURIComponent(a)}&timeout=5`).then((r) => r.json());
    const waitB = fetch(`${base}/api/wait-feedback?planFile=${encodeURIComponent(b)}&timeout=1`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));

    expect(approve(service, a).success).toBe(true);

    const resA = await waitA;
    expect(resA.timeout).toBe(false);
    expect(resA.feedback?.status).toBe("approved");

    // B was never approved: its wait only ends by timing out, never with feedback.
    const resB = await waitB;
    expect(resB.timeout).toBe(true);
    expect(resB.feedback).toBeUndefined();
    expect(service.getPlanData(b)?.planApproved).toBe(false);
  });

  it("rejects requests carrying an Origin header and non-JSON POSTs", async () => {
    const a = makePlan("sec");
    service = new PlanPreviewerService();
    service.start(0);
    await new Promise((r) => setTimeout(r, 50));
    const base = `http://127.0.0.1:${service.getPort()}`;
    const json = { "Content-Type": "application/json" };
    await fetch(`${base}/api/notify`, { method: "POST", headers: json, body: JSON.stringify({ filePath: a }) });
    const http = await import("node:http");
    const status = (path: string, headers: Record<string, string>, method = "GET", body?: string) =>
      new Promise<number>((resolve) => {
        const req = http.request(`${base}${path}`, { method, headers }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        if (body) req.write(body);
        req.end();
      });
    expect(await status(`/api/plan?planFile=${encodeURIComponent(a)}`, { Origin: "http://evil.test" })).toBe(403);
    expect(await status(`/api/plan?planFile=${encodeURIComponent(a)}`, {})).toBe(200);
    expect(await status(`/api/plan?planFile=${encodeURIComponent(path.join(os.tmpdir(), "nope.md"))}`, {})).toBe(404);
    expect(await status("/api/feedback", { "Content-Type": "text/plain" }, "POST", JSON.stringify({ filePath: a, content: "x" }))).toBe(415);
  });

  it("keeps feedback submitted with no waiter and returns it on the next wait, even after re-notify", async () => {
    const a = makePlan("pending");
    service = new PlanPreviewerService();
    service.start(0);
    await new Promise((r) => setTimeout(r, 50));
    const base = `http://127.0.0.1:${service.getPort()}`;
    const json = { "Content-Type": "application/json" };
    await fetch(`${base}/api/notify`, { method: "POST", headers: json, body: JSON.stringify({ filePath: a }) });
    expect(approve(service, a).success).toBe(true);
    await fetch(`${base}/api/notify`, { method: "POST", headers: json, body: JSON.stringify({ filePath: a }) });
    const res = await fetch(`${base}/api/wait-feedback?planFile=${encodeURIComponent(a)}&timeout=1`).then((r) => r.json());
    expect(res.timeout).toBe(false);
    expect(res.feedback?.status).toBe("approved");
    expect(service.getPlanData(a)?.planApproved).toBe(true);
  });

  it("rejects feedback with an empty file path", () => {
    service = new PlanPreviewerService();
    expect(service.submitFeedback({ filePath: "", status: "approved" } as any).success).toBe(false);
  });
});

describe("sanitizeOrigin", () => {
  it("keeps only non-empty string fields", () => {
    expect(sanitizeOrigin({ sessionFile: "/s.jsonl", sessionId: 5, cwd: " " })).toEqual({ sessionFile: "/s.jsonl", sessionId: undefined, cwd: undefined });
  });

  it("returns undefined when nothing usable is sent", () => {
    expect(sanitizeOrigin(undefined)).toBeUndefined();
    expect(sanitizeOrigin("x")).toBeUndefined();
    expect(sanitizeOrigin({ cwd: "" })).toBeUndefined();
  });
});
