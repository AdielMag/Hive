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

/** Pushes an event to the renderer (the module's `ctx.ipc.emit`). */
export type PlanEventSink = (event: string, payload: OpenPlanTabEvent | PlanUpdatedEvent) => void;

export interface PlanSessionMarker {
  port: number;
  pid: number;
  planFile: string;
  updatedAt: string;
}

export class PlanPreviewerService {
  private server: http.Server | null = null;
  private port = 3456;
  private actualPort: number | null = null;
  private activePlanPath: string | null = null;
  private sessionContext = "";
  private fileVersion = 1;
  private planApproved = false;
  private agentResponses: PlanAgentResponse[] = [];
  private agentQuestions: PlanQuestionRound[] = [];
  private questionRoundId = 0;
  private activeWatcher: fs.FSWatcher | null = null;
  private selfWriteUntil = 0;
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

  private updateActiveMarker() {
    if (this.activePlanPath && this.actualPort) {
      writeSessionMarker(this.activePlanPath, this.actualPort, process.pid);
    }
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
      this.json(res, {
        success: true,
        running: true,
        port: this.getPort(),
        pid: process.pid,
        planFile: this.activePlanPath,
        sessionContext: this.sessionContext,
        fileVersion: this.fileVersion,
        agentResponses: this.agentResponses,
        agentQuestions: this.agentQuestions,
        planApproved: this.planApproved,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/version") {
      let mtime = 0;
      if (this.activePlanPath && fs.existsSync(this.activePlanPath)) {
        try {
          mtime = fs.statSync(this.activePlanPath).mtimeMs;
        } catch {}
      }
      this.json(res, {
        fileVersion: this.fileVersion,
        mtime,
        planFile: this.activePlanPath,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/heartbeat") {
      this.json(res, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/plan") {
      if (!this.activePlanPath || !fs.existsSync(this.activePlanPath)) {
        this.json(res, { success: false, error: "No active plan file" }, 404);
        return;
      }
      const data = this.buildPlanPreviewData(this.activePlanPath);
      this.json(res, { success: true, ...data });
      return;
    }

    if (req.method === "POST" && pathname === "/api/notify") {
      this.readBody(req, (body) => {
        const { filePath, context, response, questions } = body ?? {};
        if (filePath) {
          const resolvedPath = path.resolve(filePath);
          this.setActivePlan(resolvedPath, context);
        }
        if (context) this.sessionContext = context;
        if (typeof response === "string" && response.trim()) {
          this.agentResponses.push({
            text: response.trim(),
            timestamp: new Date().toISOString(),
            fileVersion: this.fileVersion + 1,
          });
        }
        if (Array.isArray(questions) && questions.length > 0) {
          this.pushQuestionRound(questions);
        }
        this.fileVersion++;

        // Notify the renderer to open/focus the plan tab
        if (this.activePlanPath) {
          this.emit(PlanEvents.openTab, { filePath: this.activePlanPath, context: this.sessionContext });
        }

        this.json(res, {
          success: true,
          fileVersion: this.fileVersion,
          planFile: this.activePlanPath,
          agentQuestions: this.agentQuestions,
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
    if (this.activePlanPath === resolved) {
      if (context) this.sessionContext = context;
      return;
    }

    if (this.activePlanPath) {
      clearSessionMarker(this.activePlanPath);
    }

    this.activePlanPath = resolved;
    this.sessionContext = context || extractDerivedContext(resolved);
    this.fileVersion = 1;
    this.planApproved = false;
    this.agentResponses = [];
    this.agentQuestions = [];
    this.questionRoundId = 0;

    this.updateActiveMarker();
    this.attachWatcher(resolved);
  }

  private pushQuestionRound(rawQuestions: any[]) {
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
    this.questionRoundId++;
    const round: PlanQuestionRound = {
      roundId: this.questionRoundId,
      status: "pending",
      fileVersion: this.fileVersion + 1,
      questions,
      timestamp: new Date().toISOString(),
    };
    this.agentQuestions.push(round);
  }

  private attachWatcher(targetPath: string) {
    if (this.activeWatcher) {
      try {
        this.activeWatcher.close();
      } catch {}
      this.activeWatcher = null;
    }

    try {
      this.activeWatcher = fs.watch(targetPath, () => {
        if (Date.now() < this.selfWriteUntil) return;
        this.fileVersion++;
        const content = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
        this.emit(PlanEvents.updated, { filePath: targetPath, fileVersion: this.fileVersion, content });
      });
    } catch {}
  }

  public getPlanData(targetPath?: string): PlanPreviewData | null {
    const p = targetPath ? path.resolve(targetPath) : this.activePlanPath;
    if (!p || !fs.existsSync(p)) return null;
    return this.buildPlanPreviewData(p);
  }

  private buildPlanPreviewData(p: string): PlanPreviewData {
    let content = "";
    let stats: fs.Stats | null = null;
    try {
      content = fs.readFileSync(p, "utf8");
      stats = fs.statSync(p);
    } catch {}

    const createdAt = stats?.birthtime && !isNaN(stats.birthtime.getTime()) ? stats.birthtime : (stats?.mtime ?? new Date());
    const updatedAt = stats?.mtime ?? new Date();

    return {
      filename: path.basename(p),
      filePath: p,
      content,
      fileVersion: this.fileVersion,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      callerAgent: { id: "pi", name: "Hive Agent" },
      sessionContext: this.sessionContext || extractDerivedContext(p, content),
      agentResponses: this.agentResponses,
      agentQuestions: this.agentQuestions,
      planApproved: this.planApproved,
    };
  }

  public savePlanContent(filePath: string, content: string): { success: boolean; fileVersion: number; error?: string } {
    try {
      const p = path.resolve(filePath);
      this.selfWriteUntil = Date.now() + 500;
      fs.writeFileSync(p, content, "utf8");
      this.fileVersion++;
      return { success: true, fileVersion: this.fileVersion };
    } catch (err: any) {
      return { success: false, fileVersion: this.fileVersion, error: err.message };
    }
  }

  public submitFeedback(payload: PlanFeedbackPayload): { success: boolean; error?: string } {
    try {
      const planFile = path.resolve(payload.filePath || this.activePlanPath || "");
      if (!planFile) {
        return { success: false, error: "No plan file provided" };
      }

      // If user provided updated markdown content, save it
      if (typeof payload.content === "string") {
        this.savePlanContent(planFile, payload.content);
      }

      const answers = Array.isArray(payload.answers) ? payload.answers : [];
      if (answers.length > 0) {
        const answeredRounds = new Set(answers.map((a) => a.roundId).filter(Boolean));
        this.agentQuestions.forEach((round) => {
          if (answeredRounds.has(round.roundId)) {
            round.status = "answered";
            round.answers = answers.filter((a) => a.roundId === round.roundId);
            round.answeredAt = new Date().toISOString();
          }
        });
      }

      if (payload.status === "approved") {
        this.planApproved = true;
      }

      const feedbackData = {
        timestamp: new Date().toISOString(),
        planFile,
        sessionContext: this.sessionContext,
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

      // Notify all waiting CLI HTTP requests
      const matchingWaiters = this.pendingFeedbackWaiters.filter(
        (w) => !w.planFile || path.resolve(w.planFile) === planFile,
      );
      this.pendingFeedbackWaiters = this.pendingFeedbackWaiters.filter(
        (w) => w.planFile && path.resolve(w.planFile) !== planFile,
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
    if (this.activeWatcher) {
      try {
        this.activeWatcher.close();
      } catch {}
      this.activeWatcher = null;
    }
    if (this.activePlanPath) {
      clearSessionMarker(this.activePlanPath);
    }
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
