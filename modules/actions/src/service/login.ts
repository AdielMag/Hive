import { spawn, type ChildProcess } from "node:child_process";
import type { LoginState } from "../shared.ts";

const LOGIN_TIMEOUT_MS = 5 * 60_000;
const CODE_RE = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/;

/** Drives `gh auth login --web` in the background and exposes its progress (device code, done, failed). */
export function createGhLogin(onFinished: () => void, env: NodeJS.ProcessEnv = process.env) {
  let state: LoginState = { phase: "idle" };
  let child: ChildProcess | null = null;
  let timer: NodeJS.Timeout | null = null;

  /** Ends the run owned by `proc`; events from a superseded process are ignored. */
  function finish(proc: ChildProcess, next: LoginState) {
    if (child !== proc || state.phase !== "running") return;
    if (timer) clearTimeout(timer);
    timer = null;
    state = next;
    child = null;
    onFinished();
  }

  return {
    status: (): LoginState => state,
    start(): LoginState {
      if (state.phase === "running") return state;
      state = { phase: "running" };
      let output = "";
      try {
        child = spawn("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"], {
          windowsHide: true,
          env: { ...env, GH_PROMPT_DISABLED: "", NO_COLOR: "1" },
        });
      } catch {
        state = { phase: "failed", message: "Could not start the GitHub CLI." };
        return state;
      }
      const proc = child;
      timer = setTimeout(() => {
        proc.kill();
        finish(proc, { phase: "failed", message: "Login timed out." });
      }, LOGIN_TIMEOUT_MS);
      const onData = (d: Buffer) => {
        output += d.toString();
        const code = CODE_RE.exec(output)?.[1];
        if (code && child === proc && state.phase === "running" && !state.code) {
          state = { phase: "running", code };
          // gh waits on "Press Enter to open github.com in your browser".
          proc.stdin?.write("\n");
        }
      };
      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);
      proc.stdin?.on("error", () => undefined);
      proc.on("error", (err: NodeJS.ErrnoException) => {
        finish(proc, {
          phase: "failed",
          notInstalled: err.code === "ENOENT",
          message: err.code === "ENOENT" ? "GitHub CLI (gh) is not installed." : err.message,
        });
      });
      proc.on("close", (code) => {
        finish(proc, code === 0 ? { phase: "done" } : { phase: "failed", message: "Login was cancelled or failed." });
      });
      return state;
    },
    cancel(): void {
      const proc = child;
      if (!proc || state.phase !== "running") return;
      finish(proc, { phase: "idle" });
      proc.kill();
    },
  };
}

export type GhLogin = ReturnType<typeof createGhLogin>;
