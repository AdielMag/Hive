import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTidyWorktrees,
  createWorktree,
  isManagedWorktree,
  listOrphans,
  mergeWorktree,
  projectPathFromWorktreeCwd,
  removeWorktree,
  repairNodeModules,
  renameWorktreeBranch,
  sanitizeSlug,
  scanTidyWorktrees,
  worktreeStatus,
} from "./worktrees.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function initRepo(dir: string): void {
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "one\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
}

describe("worktrees", { timeout: 60_000 }, () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "hive-wt-")));
    repo = join(tmp, "repo");
    mkdirSync(repo);
  });

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it("returns null for a non-git dir and for a repo with no commits", async () => {
    expect(await createWorktree({ projectPath: repo, title: "x" })).toBeNull();
    git(repo, "init", "-q", "-b", "main");
    expect(await createWorktree({ projectPath: repo, title: "x" })).toBeNull();
  });

  it("creates a worktree on a unique branch and excludes the folder", async () => {
    initRepo(repo);
    const a = await createWorktree({ projectPath: repo, title: "Fix the Login Bug!!" });
    const b = await createWorktree({ projectPath: repo, title: "Fix the Login Bug!!" });
    expect(a && b).toBeTruthy();
    expect(a!.branch).toMatch(/^hive\/fix-the-login-bug-[0-9a-f]{6}$/);
    expect(a!.branch).not.toBe(b!.branch);
    expect(a!.baseBranch).toBe("main");
    expect(a!.baseCommit).toBe(git(repo, "rev-parse", "HEAD"));
    expect(a!.projectPath).toBe(repo);
    expect(existsSync(join(a!.worktreePath, "a.txt"))).toBe(true);
    expect(git(a!.worktreePath, "rev-parse", "--abbrev-ref", "HEAD")).toBe(a!.branch);

    const exclude = readFileSync(join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude.split("\n").filter((l) => l.trim() === ".hive-worktrees/")).toHaveLength(1);
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(existsSync(join(repo, ".gitignore"))).toBe(false);
  });

  it("records HEAD for a detached main tree and honors baseBranch", async () => {
    initRepo(repo);
    git(repo, "branch", "dev");
    writeFileSync(join(repo, "b.txt"), "two\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "second");
    const fromDev = await createWorktree({ projectPath: repo, title: "d", baseBranch: "dev" });
    expect(fromDev!.baseBranch).toBe("dev");
    expect(existsSync(join(fromDev!.worktreePath, "b.txt"))).toBe(false);
    expect(await createWorktree({ projectPath: repo, title: "d", baseBranch: "nope" })).toBeNull();

    git(repo, "checkout", "-q", "--detach");
    const det = await createWorktree({ projectPath: repo, title: "det" });
    expect(det!.baseBranch).toBe("HEAD");
  });

  it("reports ahead / behind / dirty", async () => {
    initRepo(repo);
    const wt = (await createWorktree({ projectPath: repo, title: "st" }))!;
    expect(await worktreeStatus(wt)).toEqual({ exists: true, ahead: 0, behind: 0, dirty: 0 });

    writeFileSync(join(wt.worktreePath, "n.txt"), "new\n");
    expect((await worktreeStatus(wt)).dirty).toBe(1);
    git(wt.worktreePath, "add", ".");
    git(wt.worktreePath, "commit", "-q", "-m", "work");
    writeFileSync(join(repo, "m.txt"), "main\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "main moves");
    expect(await worktreeStatus(wt)).toEqual({ exists: true, ahead: 1, behind: 1, dirty: 0 });
  });

  it("merges the session branch into the base branch", async () => {
    initRepo(repo);
    const wt = (await createWorktree({ projectPath: repo, title: "mg" }))!;
    writeFileSync(join(wt.worktreePath, "feature.txt"), "f\n");
    git(wt.worktreePath, "add", ".");
    git(wt.worktreePath, "commit", "-q", "-m", "feature");

    const res = await mergeWorktree(wt);
    expect(res).toMatchObject({ ok: true, alreadyUpToDate: false });
    expect(existsSync(join(repo, "feature.txt"))).toBe(true);
    expect((await worktreeStatus(wt)).ahead).toBe(0);
    expect(await mergeWorktree(wt)).toMatchObject({ ok: true, alreadyUpToDate: true });
  });

  it("fails cleanly on dirty main, wrong branch, and conflicts", async () => {
    initRepo(repo);
    const wt = (await createWorktree({ projectPath: repo, title: "cf" }))!;
    writeFileSync(join(wt.worktreePath, "a.txt"), "from worktree\n");
    git(wt.worktreePath, "commit", "-q", "-am", "wt change");

    writeFileSync(join(repo, "a.txt"), "dirty\n");
    expect(await mergeWorktree(wt)).toMatchObject({ ok: false, reason: "dirty-main" });

    git(repo, "commit", "-q", "-am", "main change");
    const conflict = await mergeWorktree(wt);
    expect(conflict).toMatchObject({ ok: false, reason: "conflict", conflicts: ["a.txt"] });
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(repo, "a.txt"), "utf8").trim()).toBe("dirty");

    git(repo, "checkout", "-q", "-b", "other");
    expect(await mergeWorktree(wt)).toMatchObject({ ok: false, reason: "base-not-checked-out" });
  });

  it("removes the worktree and branch, keeping the real node_modules", async () => {
    initRepo(repo);
    mkdirSync(join(repo, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(repo, "node_modules", "pkg", "pkg.txt"), "p\n");
    const wt = (await createWorktree({ projectPath: repo, title: "rm" }))!;
    expect(existsSync(join(wt.worktreePath, "node_modules", "pkg", "pkg.txt"))).toBe(true);
    expect((await worktreeStatus(wt)).dirty).toBe(0);

    writeFileSync(join(wt.worktreePath, "u.txt"), "u\n");
    const refused = await removeWorktree(wt);
    expect(refused.ok).toBe(false);
    expect(existsSync(wt.worktreePath)).toBe(true);
    expect(existsSync(join(wt.worktreePath, "node_modules"))).toBe(true);

    expect(await removeWorktree(wt, { force: true })).toEqual({ ok: true, branchDeleted: true });
    expect(existsSync(wt.worktreePath)).toBe(false);
    expect(existsSync(join(repo, "node_modules", "pkg", "pkg.txt"))).toBe(true);
    expect(git(repo, "branch", "--list", wt.branch)).toBe("");
    expect(await worktreeStatus(wt)).toMatchObject({ exists: false });
  });

  describe("monorepo node_modules", () => {
    /** Repo with workspaces `packages/*` + `apps/*`, a root node_modules whose @hive/core link points at the ROOT tree. */
    function initMonorepo(): void {
      mkdirSync(join(repo, "packages", "core"), { recursive: true });
      mkdirSync(join(repo, "apps", "desktop"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*", "apps/*"] }));
      writeFileSync(join(repo, "packages", "core", "package.json"), JSON.stringify({ name: "@hive/core" }));
      writeFileSync(join(repo, "apps", "desktop", "package.json"), JSON.stringify({ name: "@hive/desktop" }));
      initRepo(repo);
      mkdirSync(join(repo, "node_modules", "lodash"), { recursive: true });
      writeFileSync(join(repo, "node_modules", "lodash", "index.js"), "x\n");
      mkdirSync(join(repo, "node_modules", "@hive"), { recursive: true });
      symlinkSync(join(repo, "packages", "core"), join(repo, "node_modules", "@hive", "core"), "junction");
      mkdirSync(join(repo, "node_modules", "@other", "pkg"), { recursive: true });
      mkdirSync(join(repo, "apps", "desktop", "node_modules", "vite"), { recursive: true });
      writeFileSync(join(repo, "apps", "desktop", "node_modules", "vite", "v.js"), "v\n");
    }

    it("points workspace packages at the worktree and shares third-party deps", async () => {
      initMonorepo();
      const wt = (await createWorktree({ projectPath: repo, title: "mono" }))!;
      const nm = join(wt.worktreePath, "node_modules");
      expect(lstatSync(nm).isSymbolicLink()).toBe(false);
      // third-party: shared with root
      expect(realpathSync(join(nm, "lodash"))).toBe(realpathSync(join(repo, "node_modules", "lodash")));
      expect(realpathSync(join(nm, "@other", "pkg"))).toBe(realpathSync(join(repo, "node_modules", "@other", "pkg")));
      // workspaces: the worktree's own sources, not the root's
      expect(realpathSync(join(nm, "@hive", "core"))).toBe(realpathSync(join(wt.worktreePath, "packages", "core")));
      expect(realpathSync(join(nm, "@hive", "desktop"))).toBe(realpathSync(join(wt.worktreePath, "apps", "desktop")));
      // per-workspace node_modules
      expect(existsSync(join(wt.worktreePath, "apps", "desktop", "node_modules", "vite", "v.js"))).toBe(true);
      expect((await worktreeStatus(wt)).dirty).toBe(0);
    });

    it("repairs the legacy single-junction layout", async () => {
      initMonorepo();
      const wtPath = join(tmp, "legacy-wt");
      git(repo, "worktree", "add", "-q", "-b", "legacy", wtPath, "HEAD");
      const nm = join(wtPath, "node_modules");
      symlinkSync(join(repo, "node_modules"), nm, "junction"); // the old single-junction layout
      expect(realpathSync(join(nm, "@hive", "core"))).toBe(realpathSync(join(repo, "packages", "core")));

      repairNodeModules(repo, wtPath);

      expect(lstatSync(nm).isSymbolicLink()).toBe(false);
      expect(realpathSync(join(nm, "@hive", "core"))).toBe(realpathSync(join(wtPath, "packages", "core")));
      expect(existsSync(join(nm, "lodash", "index.js"))).toBe(true);
      expect(existsSync(join(repo, "node_modules", "lodash", "index.js"))).toBe(true);
      repairNodeModules(repo, wtPath); // idempotent
      expect(realpathSync(join(nm, "@hive", "core"))).toBe(realpathSync(join(wtPath, "packages", "core")));
    });

    it("removing the worktree never touches the root's node_modules or sources", async () => {
      initMonorepo();
      const wt = (await createWorktree({ projectPath: repo, title: "rm-mono" }))!;
      expect(await removeWorktree(wt, { force: true })).toMatchObject({ ok: true });
      expect(existsSync(wt.worktreePath)).toBe(false);
      expect(existsSync(join(repo, "node_modules", "lodash", "index.js"))).toBe(true);
      expect(existsSync(join(repo, "node_modules", "@hive", "core", "package.json"))).toBe(true);
      expect(existsSync(join(repo, "apps", "desktop", "node_modules", "vite", "v.js"))).toBe(true);
      expect(existsSync(join(repo, "packages", "core", "package.json"))).toBe(true);
    });
  });

  it("refuses paths outside .hive-worktrees", async () => {
    initRepo(repo);
    const wt = (await createWorktree({ projectPath: repo, title: "g" }))!;
    const bad = { ...wt, worktreePath: repo };
    expect(isManagedWorktree(bad)).toBe(false);
    expect(await removeWorktree(bad, { force: true })).toMatchObject({ ok: false });
    expect(existsSync(join(repo, "a.txt"))).toBe(true);
    expect(isManagedWorktree({ ...wt, branch: "main" })).toBe(false);
  });

  it("lists orphans", async () => {
    initRepo(repo);
    const a = (await createWorktree({ projectPath: repo, title: "a" }))!;
    const b = (await createWorktree({ projectPath: repo, title: "b" }))!;
    const orphans = await listOrphans(repo, [a.worktreePath]);
    expect(orphans.map((o) => o.branch)).toEqual([b.branch]);
  });

  it("tidy: scans unused worktrees/branches (local + remote) and deletes only what is chosen", async () => {
    initRepo(repo);
    const remote = join(tmp, "remote.git");
    mkdirSync(remote);
    git(remote, "init", "-q", "--bare");
    git(repo, "remote", "add", "origin", remote);
    const live = (await createWorktree({ projectPath: repo, title: "live" }))!;
    const old = (await createWorktree({ projectPath: repo, title: "old" }))!;
    const gone = (await createWorktree({ projectPath: repo, title: "gone" }))!;
    git(repo, "push", "-q", "origin", old.branch, gone.branch);
    await removeWorktree(gone, { force: true, deleteBranch: true }); // local gone, remote stays

    const req = { projectPath: repo, liveBranches: [live.branch], livePaths: [live.worktreePath], archivedBranches: [] as string[] };
    const found = await scanTidyWorktrees(req);
    expect(found.map((c) => c.branch).sort()).toEqual([gone.branch, old.branch].sort());
    expect(found.find((c) => c.branch === gone.branch)).toMatchObject({ reason: "remote-only", hasRemoteBranch: true, hasLocalBranch: false });
    const oldFound = found.find((c) => c.branch === old.branch);
    expect(oldFound).toMatchObject({ hasLocalBranch: true, hasRemoteBranch: true });
    // Windows CI may report 8.3 short vs long temp paths for the same dir.
    expect(realpathSync.native(oldFound!.worktreePath!)).toBe(realpathSync.native(old.worktreePath));

    const res = await applyTidyWorktrees(repo, [
      { branch: old.branch, worktreePath: old.worktreePath, deleteLocal: true, deleteRemote: false },
      { branch: gone.branch, deleteLocal: false, deleteRemote: true },
      { branch: "main", deleteLocal: true, deleteRemote: true },
    ]);
    expect(res.map((r) => r.ok)).toEqual([true, true, false]);
    expect(existsSync(old.worktreePath)).toBe(false);
    expect(existsSync(live.worktreePath)).toBe(true);
    const after = await scanTidyWorktrees(req);
    expect(after.map((c) => c.branch)).toEqual([old.branch]); // only its remote copy is left
    expect(after[0]).toMatchObject({ hasLocalBranch: false, hasRemoteBranch: true });
  });

  it("sanitizes slugs and maps worktree cwd back to the project", () => {
    expect(sanitizeSlug("  Héllo / World: CON?? ")).toBe("hello-world-con");
    expect(sanitizeSlug("a".repeat(80)).length).toBeLessThanOrEqual(36);
    expect(sanitizeSlug("***")).toBe("");
    expect(sanitizeSlug("can you please fix the login bug")).toBe("fix-the-login-bug");
    expect(sanitizeSlug("/plan add worktrees to branch tree")).toBe("add-worktrees-to-branch-tree");
    expect(sanitizeSlug("New Session")).toBe("");
    expect(projectPathFromWorktreeCwd("C:\\p\\repo\\.hive-worktrees\\fix-ab12cd")).toBe("C:\\p\\repo");
    expect(projectPathFromWorktreeCwd("/p/repo/.hive-worktrees/fix-ab12cd/src")).toBe("/p/repo");
    expect(projectPathFromWorktreeCwd("/p/repo")).toBeNull();
  });

  it("renames worktree branch to a descriptive name", async () => {
    initRepo(repo);
    const wt = (await createWorktree({ projectPath: repo, title: "session" }))!;
    expect(wt.branch).toMatch(/^hive\/session-[0-9a-f]{6}$/);

    const res = await renameWorktreeBranch(wt, "fix login authentication bug");
    if (!res.ok) throw new Error(res.error);
    expect(res.branch).toMatch(/^hive\/fix-login-authentication-bug-[0-9a-f]{6}$/);
    expect(wt.branch).toBe(res.branch);
    expect(git(wt.worktreePath, "rev-parse", "--abbrev-ref", "HEAD")).toBe(res.branch);
  });
});
