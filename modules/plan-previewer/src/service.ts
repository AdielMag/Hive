import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  PlanEvents,
  type OpenPlanTabEvent,
  type PlanFeedbackPayload,
  type PlanPreviewData,
  type PlanQuestionRound,
  type PlanAgentResponse,
  type PlanAgentQuestion,
  type PlanUpdatedEvent,
} from "./shared.ts";
import { normalizePlanPath, samePlanPath } from "./plan-utils.ts";

/** Pushes an event to the renderer (the module's `ctx.ipc.emit`). */
export type PlanEventSink = (event: string, payload: OpenPlanTabEvent | PlanUpdatedEvent) => void;

export interface PlanSessionMarker {
  port: number;
  pid: number;
  planFile: string;
  updatedAt: string;
}

interface PlanSessionRecord {
  filePath: string;
  sessionContext: string;
  fileVersion: number;
  planApproved: boolean;
  agentResponses: PlanAgentResponse[];
  agentQuestions: PlanQuestionRound[];
  questionRoundId: number;
  watcher: fs.FSWatcher | null;
  selfWriteUntil: number;
}

export class PlanPreviewerService {
  private server: http.Server | null = null;
  private port = 3456;
  private actualPort: number | null = null;
  private activePlanPath: string | null = null;
  private plans = new Map<string, PlanSessionRecord>();
  private pendingFeedbackWaiters: Array<{
    res: http.ServerResponse;
    timer: NodeJS.Timeout;
    planFile: string | null;
  }> = [];

  /** The HTTP server is not started here; call `start()` (the module does so in `activate`). */
  constructor(private emit: PlanEventSink = () => {}) {}

  public start(preferredPort = 3456): void {
    if (this.server) return;
    this.startServer(preferredPort);
  }

  public isListening(): boolean {
    return this.server?.listening ?? false;
  }

  public getPort(): number {
    return this.actualPort ?? this.port;
  }

  private startServer(preferredPort = 3456) {
    this.port = preferredPort;
    const server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Fall back to ephemeral port
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            this.actualPort = addr.port;
            this.updateActiveMarker();
          }
        });
      } else {
        console.error("[Hive PlanPreviewer] Server error:", err);
      }
    });

    server.listen(preferredPort, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        this.actualPort = addr.port;
        this.updateActiveMarker();
      }
    });

    this.server = server;
  }

  private updateActiveMarker(filePath?: string) {
    const target = filePath || this.activePlanPath;
    if (target && this.actualPort) {
      writeSessionMarker(target, this.actualPort, process.pid);
    }
  }

  private getPlanRecord(filePath: string): PlanSessionRecord | null {
    const resolved = path.resolve(filePath);
    for (const [key, rec] of this.plans.entries()) {
      if (samePlanPath(key, resolved) || samePlanPath(rec.filePath, resolved)) return rec;
    }
    return null;
  }

  private getOrCreatePlanRecord(filePath: string, context?: string): PlanSessionRecord {
    const resolved = path.resolve(filePath);
    let rec = this.getPlanRecord(resolved);
    if (!rec) {
      rec = {
        filePath: resolved,
        sessionContext: context || extractDerivedContext(resolved),
        fileVersion: 1,
        planApproved: false,
        agentResponses: [],
        agentQuestions: [],
        questionRoundId: 0,
        watcher: null,
        selfWriteUntil: 0,
      };
      this.plans.set(normalizePlanPath(resolved).toLowerCase(), rec);
    } else if (context) {
      rec.sessionContext = context;
    }
    return rec;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers for local tools
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.getPort()}`);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/status") {
      const planFileQuery = url.searchParams.get("planFile") || url.searchParams.get("filePath");
      const targetPath = planFileQuery ? path.resolve(planFileQuery) : this.activePlanPath;
      const rec = targetPath ? this.getPlanRecord(targetPath) : null;
      this.json(res, {
        success: true,
        running: true,
        port: this.getPort(),
        pid: process.pid,
        planFile: rec?.filePath ?? targetPath,
        sessionContext: rec?.sessionContext ?? "",
        fileVersion: rec?.fileVersion ?? 1,
        agentResponses: rec?.agentResponses ?? [],
        agentQuestions: rec?.agentQuestions ?? [],
        planApproved: rec?.planApproved ?? false,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/version") {
      const planFileQuery = url.searchParams.get("planFile") || url.searchParams.get("filePath");
      const targetPath = planFileQuery ? path.resolve(planFileQuery) : this.activePlanPath;
      const rec = targetPath ? this.getPlanRecord(targetPath) : null;
      let mtime = 0;
      const fPath = rec?.filePath ?? targetPath;
      if (fPath && fs.existsSync(fPath)) {
        try {
          mtime = fs.statSync(fPath).mtimeMs;
        } catch {}
      }
      this.json(res, {
        fileVersion: rec?.fileVersion ?? 1,
        mtime,
        planFile: fPath,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/heartbeat") {
      this.json(res, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/plan") {
      const planFileQuery = url.searchParams.get("planFile") || url.searchParams.get("filePath");
      const targetPath = planFileQuery ? path.resolve(planFileQuery) : this.activePlanPath;
      if (!targetPath || !fs.existsSync(targetPath)) {
        this.json(res, { success: false, error: "No active plan file" }, 404);
        return;
      }
      const data = this.buildPlanPreviewData(targetPath);
      this.json(res, { success: true, ...data });
      return;
    }

    if (req.method === "POST" && pathname === "/api/notify") {
      this.readBody(req, (body) => {
        const { filePath, context, response, questions, origin } = body ?? {};
        const targetPath = filePath ? path.resolve(filePath) : this.activePlanPath;
        if (!targetPath) {
          this.json(res, { success: false, error: "No plan file provided" }, 400);
          return;
        }
        this.setActivePlan(targetPath, context);
        const rec = this.getOrCreatePlanRecord(targetPath, context);
        if (typeof response === "string" && response.trim()) {
          rec.agentResponses.push({
            text: response.trim(),
            timestamp: new Date().toISOString(),
            fileVersion: rec.fileVersion + 1,
          });
        }
        if (Array.isArray(questions) && questions.length > 0) {
          this.pushQuestionRound(rec, questions);
        }
        rec.fileVersion++;

        // Notify the renderer to open/focus the plan tab
        this.emit(PlanEvents.openTab, {
          filePath: rec.filePath,
          context: rec.sessionContext,
          origin: sanitizeOrigin(origin),
        });

        this.json(res, {
          success: true,
          fileVersion: rec.fileVersion,
          planFile: rec.filePath,
          agentQuestions: rec.agentQuestions,
        });
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/wait-feedback") {
      const planFileQuery = url.searchParams.get("planFile");
      const timeoutSec = parseInt(url.searchParams.get("timeout") || "240", 10);
      const timeoutMs = (!isNaN(timeoutSec) && timeoutSec > 0 ? timeoutSec : 240) * 1000;

      const waiter = {
        res,
        timer: setTimeout(() => {
          const idx = this.pendingFeedbackWaiters.indexOf(waiter);
          if (idx !== -1) this.pendingFeedbackWaiters.splice(idx, 1);
          this.json(res, { success: true, timeout: true });
        }, timeoutMs),
        planFile: planFileQuery ? path.resolve(planFileQuery) : null,
      };

      this.pendingFeedbackWaiters.push(waiter);
      return;
    }

    if (req.method === "POST" && pathname === "/api/feedback") {
      this.readBody(req, (body) => {
        if (!body) {
          this.json(res, { success: false, error: "Invalid feedback body" }, 400);
          return;
        }
        const result = this.submitFeedback(body as PlanFeedbackPayload);
        this.json(res, result);
      });
      return;
    }

    this.json(res, { error: "Not found" }, 404);
  }

  private readBody(req: http.IncomingMessage, cb: (body: any) => void) {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        cb(raw ? JSON.parse(raw) : {});
      } catch {
        cb(null);
      }
    });
  }

  private json(res: http.ServerResponse, data: any, statusCode = 200) {
    try {
      res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    } catch {}
  }

  public setActivePlan(filePath: string, context?: string) {
    const resolved = path.resolve(filePath);
    this.activePlanPath = resolved;
    const rec = this.getOrCreatePlanRecord(resolved, context);
    // Setting a plan active again (CLI notify) starts a fresh review round for it
    rec.planApproved = false;
    if (context) rec.sessionContext = context;

    this.updateActiveMarker(resolved);
    this.attachWatcher(rec);
  }

  private pushQuestionRound(rec: PlanSessionRecord, rawQuestions: any[]) {
    const questions: PlanAgentQuestion[] = rawQuestions.map((q, idx) => ({
      id: q.id || `q-${idx + 1}`,
      type: q.type || (Array.isArray(q.options) && q.options.length ? "choice" : "text"),
      title: q.title || q.label || `Question ${idx + 1}`,
      question: q.question || q.prompt || "",
      options: Array.isArray(q.options)
        ? q.options.map((o: any) => ({
            value: o.value || o.label || String(o),
            label: o.label || o.value || String(o),
            description: o.description,
            recommended: Boolean(o.recommended),
          }))
        : undefined,
      allowOther: q.allowOther ?? true,
    }));

    if (!questions.length) return;
    rec.questionRoundId++;
    const round: PlanQuestionRound = {
      roundId: rec.questionRoundId,
      status: "pending",
      fileVersion: rec.fileVersion + 1,
      questions,
      timestamp: new Date().toISOString(),
    };
    rec.agentQuestions.push(round);
  }

  private attachWatcher(rec: PlanSessionRecord) {
    if (rec.watcher) {
      try {
        rec.watcher.close();
      } catch {}
      rec.watcher = null;
    }

    try {
      rec.watcher = fs.watch(rec.filePath, () => {
        if (Date.now() < rec.selfWriteUntil) return;
        rec.fileVersion++;
        const content = fs.existsSync(rec.filePath) ? fs.readFileSync(rec.filePath, "utf8") : "";
        this.emit(PlanEvents.updated, { filePath: rec.filePath, fileVersion: rec.fileVersion, content });
      });
    } catch {}
  }

  public getPlanData(targetPath?: string): PlanPreviewData | null {
    const p = targetPath ? path.resolve(targetPath) : this.activePlanPath;
    if (!p || !fs.existsSync(p)) return null;
    return this.buildPlanPreviewData(p);
  }

  private buildPlanPreviewData(p: string): PlanPreviewData {
    const resolved = path.resolve(p);
    const rec = this.getOrCreatePlanRecord(resolved);
    let content = "";
    let stats: fs.Stats | null = null;
    try {
      content = fs.readFileSync(resolved, "utf8");
      stats = fs.statSync(resolved);
    } catch {}

    const createdAt = stats?.birthtime && !isNaN(stats.birthtime.getTime()) ? stats.birthtime : (stats?.mtime ?? new Date());
    const updatedAt = stats?.mtime ?? new Date();

    return {
      filename: path.basename(resolved),
      filePath: resolved,
      content,
      fileVersion: rec.fileVersion,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      callerAgent: { id: "pi", name: "Hive Agent" },
      sessionContext: rec.sessionContext || extractDerivedContext(resolved, content),
      agentResponses: rec.agentResponses,
      agentQuestions: rec.agentQuestions,
      planApproved: rec.planApproved,
    };
  }

  public savePlanContent(filePath: string, content: string): { success: boolean; fileVersion: number; error?: string } {
    try {
      const p = path.resolve(filePath);
      const rec = this.getOrCreatePlanRecord(p);
      rec.selfWriteUntil = Date.now() + 500;
      fs.writeFileSync(p, content, "utf8");
      rec.fileVersion++;
      return { success: true, fileVersion: rec.fileVersion };
    } catch (err: any) {
      const rec = this.getPlanRecord(filePath);
      return { success: false, fileVersion: rec?.fileVersion ?? 1, error: err.message };
    }
  }

  public submitFeedback(payload: PlanFeedbackPayload): { success: boolean; error?: string } {
    try {
      const planFile = path.resolve(payload.filePath || this.activePlanPath || "");
      if (!planFile) {
        return { success: false, error: "No plan file provided" };
      }
      const rec = this.getOrCreatePlanRecord(planFile);

      // If user provided updated markdown content, save it
      if (typeof payload.content === "string") {
        this.savePlanContent(planFile, payload.content);
      }

      const answers = Array.isArray(payload.answers) ? payload.answers : [];
      if (answers.length > 0) {
        const answeredRounds = new Set(answers.map((a) => a.roundId).filter(Boolean));
        rec.agentQuestions.forEach((round) => {
          if (answeredRounds.has(round.roundId)) {
            round.status = "answered";
            round.answers = answers.filter((a) => a.roundId === round.roundId);
            round.answeredAt = new Date().toISOString();
          }
        });
      }

      if (payload.status === "approved") {
        rec.planApproved = true;
        // Approved plans are done: stop watching (a later notify re-attaches via setActivePlan).
        if (rec.watcher) {
          try {
            rec.watcher.close();
          } catch {}
          rec.watcher = null;
        }
      }

      const feedbackData = {
        timestamp: new Date().toISOString(),
        planFile,
        sessionContext: rec.sessionContext,
        callerAgent: "pi",
        callerName: "Hive Agent",
        status: payload.status,
        comment: payload.comment || "",
        executionMode: payload.executionMode, // "auto-edit" | "manual"
        questions: Array.isArray(payload.questions) ? payload.questions : [],
        choices: Array.isArray(payload.choices) ? payload.choices : [],
        answers,
      };

      const dir = path.dirname(planFile);
      const jsonPath = path.join(dir, ".plan-feedback.json");
      fs.writeFileSync(jsonPath, JSON.stringify(feedbackData, null, 2), "utf8");

      const mdPath = path.join(dir, ".plan-feedback.md");
      fs.writeFileSync(mdPath, generateFeedbackMarkdown(feedbackData), "utf8");

      // Notify only waiting CLI HTTP requests for THIS planFile
      const matchingWaiters = this.pendingFeedbackWaiters.filter(
        (w) => w.planFile && samePlanPath(w.planFile, planFile),
      );
      this.pendingFeedbackWaiters = this.pendingFeedbackWaiters.filter(
        (w) => !w.planFile || !samePlanPath(w.planFile, planFile),
      );

      matchingWaiters.forEach((waiter) => {
        clearTimeout(waiter.timer);
        this.json(waiter.res, { success: true, timeout: false, feedback: feedbackData });
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public dispose() {
    for (const rec of this.plans.values()) {
      if (rec.watcher) {
        try {
          rec.watcher.close();
        } catch {}
        rec.watcher = null;
      }
      clearSessionMarker(rec.filePath);
    }
    this.plans.clear();
    this.pendingFeedbackWaiters.forEach((w) => {
      clearTimeout(w.timer);
      this.json(w.res, { success: true, timeout: true, closed: true });
    });
    this.pendingFeedbackWaiters = [];
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
  }
}

/** Keep only string fields of the CLI-supplied origin (untrusted JSON from localhost). */
export function sanitizeOrigin(raw: unknown): OpenPlanTabEvent["origin"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const origin = { sessionFile: pick(o.sessionFile), sessionId: pick(o.sessionId), cwd: pick(o.cwd) };
  return origin.sessionFile || origin.sessionId || origin.cwd ? origin : undefined;
}

function extractDerivedContext(filePath: string, content?: string): string {
  if (content) {
    const match = content.match(/^#\s+(.+)$/m);
    if (match && match[1]) return match[1].trim();
  }
  return `Plan file: ${path.basename(filePath)} in ${path.basename(path.dirname(filePath))}`;
}

function sessionMarkerPath(planPath: string): string {
  const dir = path.dirname(path.resolve(planPath));
  const base = path.basename(planPath);
  return path.join(dir, `.plan-previewer-${base}.session.json`);
}

export function writeSessionMarker(planPath: string, port: number, pid: number) {
  try {
    const marker = sessionMarkerPath(planPath);
    const data: PlanSessionMarker = {
      port,
      pid,
      planFile: path.resolve(planPath),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(marker, JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

export function clearSessionMarker(planPath: string) {
  try {
    const marker = sessionMarkerPath(planPath);
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  } catch {}
}

function generateFeedbackMarkdown(data: any): string {
  let md = `# Plan Review Feedback\n\n`;
  md += `- **Date:** ${data.timestamp}\n`;
  md += `- **Context / Task:** ${data.sessionContext}\n`;
  md += `- **Plan File:** \`${data.planFile}\`\n`;
  md += `- **Caller Agent:** ${data.callerName} (${data.callerAgent})\n`;
  md += `- **Status:** ${String(data.status).toUpperCase()}\n`;
  if (data.executionMode) {
    md += `- **Execution Mode Chosen:** ${String(data.executionMode).toUpperCase()}\n`;
  }
  md += `\n`;

  if (data.comment) {
    md += `## User Feedback & Comments\n\n${data.comment}\n\n`;
  }

  if (data.answers && data.answers.length > 0) {
    md += `## Answers To Your Questions\n\n`;
    data.answers.forEach((a: any, i: number) => {
      md += `### ${i + 1}. ${a.title || a.question || a.id}\n`;
      if (a.question && a.question !== a.title) md += `> ${a.question}\n\n`;
      const value = a.selected || a.answer || "(skipped by user)";
      md += `- **Answer:** ${value}\n\n`;
    });
  }

  if (data.choices && data.choices.length > 0) {
    md += `## Design Choices & Selected Options\n\n`;
    data.choices.forEach((c: any, i: number) => {
      md += `### ${i + 1}. ${c.title || "Choice"}\n`;
      if (c.selected) md += `- **Selected Option:** ${c.selected}\n`;
      if (c.answer) md += `- **User Answer:** ${c.answer}\n`;
    });
    md += `\n`;
  }

  if (data.questions && data.questions.length > 0) {
    md += `## Text Selection Questions & Annotations\n\n`;
    data.questions.forEach((q: any, i: number) => {
      md += `### Note ${i + 1}\n`;
      if (q.selectedText) md += `> "${q.selectedText}"\n\n`;
      md += `**Question/Note:** ${q.question}\n\n`;
    });
  }

  return md;
}
