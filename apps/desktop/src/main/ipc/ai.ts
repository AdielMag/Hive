import { closeSync, openSync, readSync } from "node:fs";
import { IPC, type SubagentLocateRequest } from "@hive/protocol";
import type { AppContext } from "../context.ts";
import { listContextFiles } from "../services/context-files.ts";
import { getMcpCatalog } from "../services/mcp-catalog.ts";
import { locateSubagentOutput, readChunk } from "../services/subagent-output.ts";
import { handle } from "./util.ts";

export function registerAiIpc(ctx: AppContext): void {
  // Session Registry
  handle(IPC.aiSessionRegistry, ({ key }: { key?: string }) => {
    if (!key) return null;
    return ctx.sessions?.getRegistry(key) ?? null;
  });

  // MCP Catalog
  handle(IPC.aiMcpCatalog, () => {
    return getMcpCatalog();
  });

  // Instruction-file sizes for the context breakdown
  handle(IPC.aiContextFiles, ({ cwd }: { cwd?: string }) => listContextFiles(cwd || undefined));

  // Locate subagent output file
  handle(IPC.subagentLocate, async (req: SubagentLocateRequest) => {
    let sessionId: string | null = null;
    if (req.key) {
      sessionId = (await ctx.sessions?.getPiSessionId(req.key)) ?? null;
    }
    if (!sessionId && req.sessionPath) {
      try {
        // Only the header line is needed; session files can be many MB.
        const fd = openSync(req.sessionPath, "r");
        let raw = "";
        try {
          const buf = Buffer.alloc(64 * 1024);
          raw = buf.toString("utf8", 0, readSync(fd, buf, 0, buf.length, 0));
        } finally {
          closeSync(fd);
        }
        const firstLine = raw.split("\n")[0]?.trim();
        if (firstLine) {
          const header = JSON.parse(firstLine) as { id?: string };
          if (typeof header.id === "string") {
            sessionId = header.id;
          }
        }
      } catch {
        // ignore
      }
    }

    return locateSubagentOutput(req, sessionId);
  });

  // Read subagent output chunk
  handle(IPC.subagentRead, ({ path, fromOffset }: { path: string; fromOffset?: number }) => {
    return readChunk(path, fromOffset ?? 0);
  });

}
