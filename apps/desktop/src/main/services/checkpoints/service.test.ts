import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CheckpointService } from "./service.ts";

describe("CheckpointService", () => {
  let testCwd: string;
  let testStorage: string;
  let service: CheckpointService;

  beforeEach(() => {
    const id = Math.random().toString(36).slice(2);
    testCwd = join(tmpdir(), `hive-svc-cwd-${id}`);
    testStorage = join(tmpdir(), `hive-svc-storage-${id}`);
    mkdirSync(testCwd, { recursive: true });
    mkdirSync(testStorage, { recursive: true });

    service = new CheckpointService({
      storageDir: testStorage,
    });
  });

  afterEach(() => {
    try { rmSync(testCwd, { recursive: true, force: true }); } catch {}
    try { rmSync(testStorage, { recursive: true, force: true }); } catch {}
  });

  it("manages turn lifecycle: prompt -> settle -> diff -> restore", async () => {
    writeFileSync(join(testCwd, "code.ts"), "const version = 1;\n", "utf8");

    const sessionId = "session_123";
    const userTs = Date.now();

    // 1. Prompt sent: capture before
    const beforeRec = await service.onPromptSent(testCwd, sessionId, userTs);
    expect(beforeRec).not.toBeNull();
    expect(beforeRec?.beforeTree).toBeDefined();

    // 2. Agent mutates file
    writeFileSync(join(testCwd, "code.ts"), "const version = 2;\n", "utf8");
    writeFileSync(join(testCwd, "new_file.ts"), "export const ok = true;\n", "utf8");

    // 3. Turn settles: capture after
    const afterRec = await service.onTurnSettled(testCwd, sessionId, userTs);
    expect(afterRec?.afterTree).toBeDefined();

    // 4. Inspect diff info
    const diffInfo = await service.getTurnDiffInfo(testCwd, beforeRec!.id);
    expect(diffInfo?.files).toEqual([
      { path: "code.ts", status: "modified" },
      { path: "new_file.ts", status: "added" },
    ]);

    // 5. Restore turn
    const restoreRes = await service.restoreTurn(testCwd, beforeRec!.id, "turn");
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.restored).toContain("code.ts");
    expect(restoreRes.deleted).toContain("new_file.ts");
    expect(restoreRes.safetyCommit).toBeDefined();

    // 6. Verify disk restored
    expect(readFileSync(join(testCwd, "code.ts"), "utf8")).toBe("const version = 1;\n");
    expect(existsSync(join(testCwd, "new_file.ts"))).toBe(false);
  });
});
