import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PlanPreviewerService } from "./plan-previewer.ts";

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
      method: "POST",
      body: JSON.stringify({ filePath: planFile, context: "ctx" }),
    });
    expect(events).toEqual([["openPlanTab", { filePath: path.resolve(planFile), context: "ctx" }]]);
  });
});
