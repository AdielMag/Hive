import { IPC } from "@hive/protocol";
import type { AppContext } from "../context.ts";
import { handle } from "./util.ts";

export function registerCheckpointIpc(ctx: AppContext): void {
  handle(IPC.checkpointsList, (sessionId: string) => {
    const active = ctx.sessions?.getSession(sessionId);
    const cwd = active?.cwd ?? process.cwd();
    return ctx.checkpoints.listTurns(cwd, sessionId);
  });

  handle(IPC.checkpointsDiffInfo, async (turnId: string) => {
    const activeSessions = ctx.sessions?.getAllSessions() ?? [];
    for (const s of activeSessions) {
      const diff = await ctx.checkpoints.getTurnDiffInfo(s.cwd, turnId);
      if (diff) return diff;
    }
    return ctx.checkpoints.getTurnDiffInfo(process.cwd(), turnId);
  });

  handle(IPC.checkpointsDiffText, async (turnId: string, filePath?: string) => {
    const activeSessions = ctx.sessions?.getAllSessions() ?? [];
    for (const s of activeSessions) {
      const diffText = await ctx.checkpoints.getTurnDiffText(s.cwd, turnId, filePath);
      if (diffText) return diffText;
    }
    return ctx.checkpoints.getTurnDiffText(process.cwd(), turnId, filePath);
  });

  handle(IPC.checkpointsRestore, async (turnId: string, mode: "turn" | "rewind") => {
    const activeSessions = ctx.sessions?.getAllSessions() ?? [];
    for (const s of activeSessions) {
      const diff = await ctx.checkpoints.getTurnDiffInfo(s.cwd, turnId);
      if (diff) {
        return ctx.checkpoints.restoreTurn(s.cwd, turnId, mode);
      }
    }
    return ctx.checkpoints.restoreTurn(process.cwd(), turnId, mode);
  });
}
