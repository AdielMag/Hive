import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ShadowRepo } from "./shadow-repo.ts";

export interface CheckpointTurnRecord {
  id: string;
  sessionId: string;
  userEntryId?: string;
  userTs: number;
  beforeTree: string;
  afterTree?: string;
  beforeCommit?: string;
  afterCommit?: string;
  partial: boolean;
  late?: boolean;
  createdAt: number;
  settledAt?: number;
}

export interface CheckpointIndex {
  version: 1;
  turns: CheckpointTurnRecord[];
}

export interface CheckpointServiceOptions {
  storageDir: string;
  maxProjectStorageBytes?: number;
}

export interface TurnDiffInfo {
  turnId: string;
  files: { path: string; status: "added" | "modified" | "deleted" }[];
  partial: boolean;
}

export class CheckpointService {
  readonly storageDir: string;
  readonly maxProjectStorageBytes: number;
  private repos = new Map<string, ShadowRepo>();
  private locks = new Map<string, Promise<void>>();

  constructor(opts: CheckpointServiceOptions) {
    this.storageDir = opts.storageDir;
    this.maxProjectStorageBytes = opts.maxProjectStorageBytes ?? 1024 * 1024 * 1024; // 1GB
  }

  /** Obtain or instantiate the shadow repo for a project directory. */
  private getRepo(cwd: string): ShadowRepo {
    let repo = this.repos.get(cwd);
    if (!repo) {
      repo = new ShadowRepo({
        cwd,
        storageDir: this.storageDir,
      });
      this.repos.set(cwd, repo);
    }
    return repo;
  }

  /** Run an operation with an async lock per project directory. */
  private async withProjectLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(cwd)) {
      try {
        await this.locks.get(cwd);
      } catch {}
    }

    let release!: () => void;
    const lockPromise = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(cwd, lockPromise);

    try {
      return await fn();
    } finally {
      this.locks.delete(cwd);
      release();
    }
  }

  private getIndexPath(cwd: string): string {
    const repo = this.getRepo(cwd);
    return join(repo.gitDir, "checkpoints-index.json");
  }

  private loadIndex(cwd: string): CheckpointIndex {
    const path = this.getIndexPath(cwd);
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf8");
        return JSON.parse(raw);
      } catch {}
    }
    return { version: 1, turns: [] };
  }

  private saveIndex(cwd: string, index: CheckpointIndex): void {
    const path = this.getIndexPath(cwd);
    try {
      const dir = join(path, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(path, JSON.stringify(index, null, 2), "utf8");
    } catch (err) {
      console.error("[checkpoints] failed to save index", err);
    }
  }

  private static readonly MAX_TURNS_KEPT = 200;

  /** Approximate recursive directory size in bytes (bounded walk). */
  private dirSize(dir: string, budget = { n: 200_000 }): number {
    let total = 0;
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
      if (budget.n-- <= 0) return total;
      const p = join(dir, e.name);
      try {
        total += e.isDirectory() ? this.dirSize(p, budget) : statSync(p).size;
      } catch {}
    }
    return total;
  }

  /** Best-effort: drop oldest turn records when shadow repo exceeds budget or turn cap. */
  private pruneIfOverBudget(repo: ShadowRepo, index: CheckpointIndex): void {
    try {
      const over = this.dirSize(repo.gitDir) > this.maxProjectStorageBytes;
      const cap = CheckpointService.MAX_TURNS_KEPT;
      if (index.turns.length > cap) {
        index.turns.splice(0, index.turns.length - cap);
      } else if (over && index.turns.length > 10) {
        index.turns.splice(0, Math.ceil(index.turns.length / 2));
      }
    } catch (err) {
      console.warn("[checkpoints] prune failed", err);
    }
  }

  /**
   * Called when a prompt is sent. Captures "before" snapshot.
   */
  async onPromptSent(cwd: string, sessionId: string, userTs: number): Promise<CheckpointTurnRecord | null> {
    return this.withProjectLock(cwd, async () => {
      const isAvail = await ShadowRepo.isGitAvailable();
      if (!isAvail) return null;

      const repo = this.getRepo(cwd);
      const snap = await repo.snapshot(`turn prompt ${userTs}`);

      const record: CheckpointTurnRecord = {
        id: `turn_${sessionId}_${userTs}`,
        sessionId,
        userTs,
        beforeTree: snap.tree,
        beforeCommit: snap.commit,
        partial: snap.partial,
        createdAt: Date.now(),
      };

      const index = this.loadIndex(cwd);
      index.turns.push(record);
      this.saveIndex(cwd, index);
      return record;
    });
  }

  /**
   * Called when agent settles. Captures "after" snapshot and computes changes.
   */
  async onTurnSettled(cwd: string, sessionId: string, userTs: number): Promise<CheckpointTurnRecord | null> {
    return this.withProjectLock(cwd, async () => {
      const index = this.loadIndex(cwd);
      const record = index.turns.find((t) => t.sessionId === sessionId && t.userTs === userTs);
      if (!record) return null;

      const repo = this.getRepo(cwd);
      const snap = await repo.snapshot(`turn settled ${userTs}`);

      record.afterTree = snap.tree;
      record.afterCommit = snap.commit;
      record.settledAt = Date.now();
      if (snap.partial) record.partial = true;

      this.pruneIfOverBudget(repo, index);
      this.saveIndex(cwd, index);
      return record;
    });
  }

  /**
   * Binds the permanent user entry id once generated by Pi.
   */
  async bindEntryId(cwd: string, sessionId: string, userTs: number, entryId: string): Promise<void> {
    return this.withProjectLock(cwd, async () => {
      const index = this.loadIndex(cwd);
      const record = index.turns.find((t) => t.sessionId === sessionId && t.userTs === userTs);
      if (record) {
        record.userEntryId = entryId;
        this.saveIndex(cwd, index);
      }
    });
  }

  /**
   * Lists all recorded checkpoints for a session.
   */
  async listTurns(cwd: string, sessionId: string): Promise<CheckpointTurnRecord[]> {
    const index = this.loadIndex(cwd);
    return index.turns.filter((t) => t.sessionId === sessionId);
  }

  /**
   * Returns list of changed files for a specific turn.
   */
  async getTurnDiffInfo(cwd: string, turnId: string): Promise<TurnDiffInfo | null> {
    const index = this.loadIndex(cwd);
    const record = index.turns.find((t) => t.id === turnId);
    if (!record || !record.beforeTree || !record.afterTree) return null;

    const repo = this.getRepo(cwd);
    const files = await repo.changedFiles(record.beforeTree, record.afterTree);
    return {
      turnId,
      files,
      partial: record.partial,
    };
  }

  /**
   * Returns unified diff text for a turn (optionally for a specific file).
   */
  async getTurnDiffText(cwd: string, turnId: string, filePath?: string): Promise<string> {
    const index = this.loadIndex(cwd);
    const record = index.turns.find((t) => t.id === turnId);
    if (!record || !record.beforeTree || !record.afterTree) return "";

    const repo = this.getRepo(cwd);
    return repo.diffText(record.beforeTree, record.afterTree, filePath);
  }

  /**
   * Restores files back to the "before" state of a given turn.
   * Takes a safety snapshot first.
   */
  async restoreTurn(cwd: string, turnId: string, mode: "turn" | "rewind"): Promise<{
    success: boolean;
    restored: string[];
    deleted: string[];
    safetyCommit?: string;
    errors: { path: string; error: string }[];
  }> {
    return this.withProjectLock(cwd, async () => {
      const index = this.loadIndex(cwd);
      const record = index.turns.find((t) => t.id === turnId);
      if (!record || !record.beforeTree) {
        return { success: false, restored: [], deleted: [], errors: [{ path: "", error: "Turn checkpoint not found" }] };
      }

      const repo = this.getRepo(cwd);

      // Automatic safety snapshot before modifying disk
      let safetyCommit: string | undefined;
      try {
        const safety = await repo.snapshot("safety checkpoint before restore");
        safetyCommit = safety.commit;
      } catch (err) {
        console.warn("[checkpoints] failed to take safety snapshot", err);
      }

      let pathsFilter: string[] | undefined;
      if (mode === "turn" && record.afterTree) {
        // "turn" mode: only revert files that were touched during THIS turn
        const changes = await repo.changedFiles(record.beforeTree, record.afterTree);
        // Normalize paths so relative path matching against git output is consistent
        pathsFilter = changes.map((c) => c.path.replaceAll("\\", "/"));
      }

      const res = await repo.restore(record.beforeTree, pathsFilter);
      return {
        success: res.errors.length === 0,
        restored: res.restored,
        deleted: res.deleted,
        safetyCommit,
        errors: res.errors,
      };
    });
  }
}
