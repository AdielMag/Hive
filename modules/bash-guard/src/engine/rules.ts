/**
 * Predicate rules over parsed commands. Each rule inspects `{ program, args, redirects }`
 * (never the raw string), so quoted text such as `echo 'rm -rf /'` is data, not a command.
 *
 * Scopes:
 *  - "segment":  evaluated for every segment (including unwrapped / substituted ones)
 *  - "pipeline": evaluated once per pipeline, sees all stages
 *  - "command":  evaluated once per parsed command, sees every segment in order
 *
 * Skeleton rules are the only regexes over text: they run on the command with quoted
 * content blanked out, for constructs that are syntax rather than program arguments.
 */

import type { DangerSeverity } from "../shared.ts";
import { parseCommand, type ParsedCommand, type Segment } from "./tokenize.ts";
import { effectiveSegment, SHELLS } from "./unwrap.ts";

export type RuleScope = "segment" | "pipeline" | "command";

export interface RuleContext {
  seg: Segment;
  pipeline: Segment[];
  index: number;
  parsed: ParsedCommand;
}

export interface Rule {
  id: string;
  title: string;
  severity: DangerSeverity;
  reason: string;
  scope: RuleScope;
  test(ctx: RuleContext): boolean;
}

export interface SkeletonRule {
  id: string;
  title: string;
  severity: DangerSeverity;
  reason: string;
  pattern: RegExp;
}

// ---------------------------------------------------------------------------
// argument helpers
// ---------------------------------------------------------------------------

const norm = (p: string) => p.replace(/\\/g, "/");

/** Letters of every short-option cluster (`-rf` -> "rf") before `--`. */
function shortFlags(args: readonly string[]): string {
  let f = "";
  for (const a of args) {
    if (a === "--") break;
    if (/^-[A-Za-z0-9]+$/.test(a)) f += a.slice(1);
  }
  return f;
}

function hasLong(args: readonly string[], name: string): boolean {
  return args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

function positional(args: readonly string[]): string[] {
  const out: string[] = [];
  let dd = false;
  for (const a of args) {
    if (!dd && a === "--") {
      dd = true;
      continue;
    }
    if (dd || !a.startsWith("-") || a === "-") out.push(a);
  }
  return out;
}

/** PowerShell-style option name (abbreviation allowed): `-Recurse:$true` -> "recurse". */
function psName(a: string): string | null {
  if (!a.startsWith("-") || a.startsWith("--") || a.length < 2) return null;
  return (a.slice(1).split(":")[0] as string).toLowerCase();
}
const psHas = (args: readonly string[], full: string, minLen = 1): boolean =>
  args.some((a) => {
    const n = psName(a);
    return n !== null && n.length >= minLen && full.startsWith(n);
  });

const WRITE_OPS = new Set([">", ">>", ">|", "&>", "&>>", ">&", "<>"]);
function writeTargets(seg: Segment): string[] {
  return seg.redirects.filter((r) => WRITE_OPS.has(r.op) && !(r.op === ">&" && /^(\d+-?|-)$/.test(r.target))).map((r) => r.target);
}
function readTargets(seg: Segment): string[] {
  return seg.redirects.filter((r) => r.op === "<").map((r) => r.target);
}

function gitCommand(seg: Segment): { sub: string; rest: string[] } | null {
  if (seg.program !== "git") return null;
  const a = seg.args;
  let k = 0;
  while (k < a.length) {
    const x = a[k] as string;
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--exec-path"].includes(x)) {
      k += 2;
      continue;
    }
    if (x.startsWith("-")) {
      k++;
      continue;
    }
    break;
  }
  const sub = a[k];
  if (!sub) return null;
  return { sub: sub.toLowerCase(), rest: a.slice(k + 1) };
}

// ---------------------------------------------------------------------------
// path classes
// ---------------------------------------------------------------------------

function isDangerousRmTarget(raw: string): boolean {
  const a = norm(raw);
  if (a === "/" || a === "/*" || a === "~" || a === "~/" || a === "~/*") return true;
  if (/^\$\{?(HOME|USERPROFILE)\}?(\/\*?)?$/i.test(a) || /^%USERPROFILE%/i.test(a)) return true;
  if (a === "*" || a === ".*" || a === "." || a === "./" || a === "./*" || a === ".." || a === "../" || a === "../*" || a.startsWith("../")) return true;
  if (/^\/(bin|boot|dev|etc|home|lib|lib64|opt|proc|root|sbin|srv|sys|usr|var|Users|System|Library|Applications|mnt|media)(\/\*?)?$/.test(a)) return true;
  if (/^[A-Za-z]:\/?\*?$/.test(a)) return true;
  return false;
}

const SYSTEM_PATH = /^\/(etc|boot|usr|bin|sbin|lib|lib64|System|Library)(\/|$)|^[A-Za-z]:\/Windows(\/|$)/i;
const RC_FILE =
  /(^|\/)\.(bashrc|bash_profile|bash_login|bash_logout|profile|zshrc|zshenv|zprofile|zlogin|zlogout|cshrc|tcshrc|kshrc)$|(^|\/)\.config\/fish\/config\.fish$|(^|\/)authorized_keys2?$|(^|\/)\.ssh(\/|$)|^\/etc\/(profile|bash\.bashrc|environment|zshrc)(\.d\/.*)?$/;
const HISTORY_FILE = /(^|\/)\.(bash|zsh|python|node_repl|mysql|psql)_history$/;

const SECRET_RES: RegExp[] = [
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.gnupg(\/|$)/,
  /\.(pem|key|p12|pfx|ppk|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/,
  /(^|\/)\.(netrc|git-credentials|pypirc)$/,
  /(^|\/)\.docker\/config\.json$/,
  /(^|\/)\.kube\/config$/,
  /^\/etc\/(shadow|sudoers|gshadow)/,
  /(^|\/)credentials\.json$/,
];

export function isSecretPath(raw: string): boolean {
  const p = norm(raw);
  if (/\.pub$/.test(p)) return false;
  if (/(^|\/)known_hosts2?(\.old)?$/.test(p)) return false;
  if (/(^|\/)\.ssh\/config$/.test(p)) return false;
  if (/(^|\/)\.env([._-][\w.-]*)?$/.test(p)) return !/\.(example|sample|template|dist|defaults?)$/i.test(p);
  return SECRET_RES.some((re) => re.test(p));
}

/** Paths a segment writes to (redirects, tee, cp/mv/install/ln destination, sed -i, dd of=). */
function writeCandidates(seg: Segment): string[] {
  const out = writeTargets(seg);
  const pos = positional(seg.args);
  const p = seg.program;
  if (p === "tee") out.push(...pos);
  else if ((p === "cp" || p === "mv" || p === "install" || p === "ln") && pos.length >= 2) out.push(pos[pos.length - 1] as string);
  else if ((p === "sed" || p === "perl") && (/i/.test(shortFlags(seg.args)) || seg.args.some((a) => a.startsWith("-i") || a === "--in-place"))) out.push(...pos.slice(1));
  else if (p === "dd") {
    for (const a of seg.args) if (a.startsWith("of=")) out.push(a.slice(3));
  } else if (p === "truncate" || p === "rm" || p === "shred") out.push(...pos);
  return out.map(norm);
}

// ---------------------------------------------------------------------------
// program classes
// ---------------------------------------------------------------------------

const FETCHERS = new Set(["curl", "wget", "fetch", "aria2c", "iwr", "irm", "invoke-webrequest", "invoke-restmethod", "http", "https", "lwp-request", "nc", "ncat", "netcat", "socat", "telnet"]);
const HTTP_FETCHERS = new Set(["curl", "wget", "iwr", "invoke-webrequest", "aria2c", "fetch"]);
const NET_SENDERS = new Set(["curl", "wget", "nc", "ncat", "netcat", "socat", "telnet", "scp", "sftp", "ftp", "iwr", "irm", "invoke-webrequest", "invoke-restmethod", "http", "https", "sendmail", "mail"]);
const SCRIPT_LANGS = /^(python[\d.]*|pypy[\d.]*|node|nodejs|deno|bun|perl|ruby|php|lua|osascript|rscript|tclsh)$/;
const INTERPRETER_EXTRA = new Set(["pwsh", "powershell", "cmd", "iex", "invoke-expression", "eval", "source", "."]);

function isInterpreter(p: string): boolean {
  return SHELLS.has(p) || SCRIPT_LANGS.test(p) || INTERPRETER_EXTRA.has(p);
}
function isShellLike(p: string): boolean {
  return SHELLS.has(p) || p === "pwsh" || p === "powershell" || p === "cmd" || p === "iex" || p === "invoke-expression";
}
const isFetcher = (e: Segment) => FETCHERS.has(e.program);

function isDecoder(e: Segment): boolean {
  const f = shortFlags(e.args);
  switch (e.program) {
    case "base64":
      return /[dD]/.test(f) || hasLong(e.args, "decode");
    case "xxd":
      return /r/.test(f);
    case "openssl":
      return (e.args.includes("base64") || e.args.includes("enc")) && e.args.some((a) => a === "-d" || a === "-D");
    case "certutil":
      return e.args.some((a) => /^[-/]decode(hex)?$/i.test(a));
    default:
      return false;
  }
}

function isEnvDump(e: Segment): boolean {
  const p = e.program;
  if (p === "printenv") return true;
  if (p === "env") return e.args.every((a) => a.startsWith("-") && a !== "-S");
  if (p === "set" || p === "export" || p === "declare" || p === "typeset") {
    const pos = positional(e.args);
    return pos.length === 0 && (p === "set" || /[pxX]/.test(shortFlags(e.args)));
  }
  if (p === "get-childitem" || p === "gci" || p === "ls" || p === "dir") return e.args.some((a) => /^env:/i.test(a));
  return false;
}

/** Does this segment (the effective program) read a script from stdin? */
function readsStdin(e: Segment): boolean {
  const p = e.program;
  if (p === "iex" || p === "invoke-expression") return true;
  const args = e.args;
  if (SHELLS.has(p)) {
    for (const a of args) {
      if (a === "-s") return true;
      if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a)) return false;
      if (a.startsWith("-") || a.startsWith("+")) continue;
      return false;
    }
    return true;
  }
  if (p === "pwsh" || p === "powershell") {
    if (args.some((a) => /^-(c|co|com|comm|comma|comman|command|f|fi|fil|file)$/i.test(a))) return args.includes("-");
    return positional(args).length === 0;
  }
  if (SCRIPT_LANGS.test(p)) {
    if (p === "deno" || p === "bun") return args.includes("-");
    for (let k = 0; k < args.length; k++) {
      const a = args[k] as string;
      if (a === "-") return true;
      if (/^-(c|e|m|p|r|E|x|S)$/.test(a) || a === "--eval" || a === "--print" || a === "-pe" || a === "-ne") return false;
      if (a.startsWith("-")) continue;
      return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// substitution analysis (e.g. `sh -c "$(curl ...)"`, `bash <(curl ...)`)
// ---------------------------------------------------------------------------

type SubKind = "fetch" | "decode" | "env";

function subKinds(text: string, depth = 0): Set<SubKind> {
  const kinds = new Set<SubKind>();
  if (depth > 3) return kinds;
  const parsed = parseCommand(text);
  if (!parsed.ok) return kinds;
  for (const seg of parsed.segments) {
    const e = effectiveSegment(seg);
    if (isFetcher(e)) kinds.add("fetch");
    if (isDecoder(e)) kinds.add("decode");
    if (isEnvDump(e)) kinds.add("env");
    for (const s of seg.subs) for (const k of subKinds(s.text, depth + 1)) kinds.add(k);
  }
  return kinds;
}

function segmentSubKinds(seg: Segment): Set<SubKind> {
  const kinds = new Set<SubKind>();
  for (const s of seg.subs) for (const k of subKinds(s.text)) kinds.add(k);
  return kinds;
}

// ---------------------------------------------------------------------------
// pipeline helpers
// ---------------------------------------------------------------------------

function stdinExecFrom(pipe: Segment[], pred: (e: Segment) => boolean, readerOk: (e: Segment) => boolean = () => true): boolean {
  const effs = pipe.map(effectiveSegment);
  for (let j = 1; j < effs.length; j++) {
    if (!readsStdin(effs[j] as Segment) || !readerOk(effs[j] as Segment)) continue;
    for (let k = 0; k < j; k++) if (pred(effs[k] as Segment)) return true;
  }
  return false;
}

/** Text from heredocs / echo / printf feeding stdin of the shell at `pipe[j]`. */
export function stdinPayloads(pipe: Segment[]): string[] {
  const out: string[] = [];
  const effs = pipe.map(effectiveSegment);
  for (let j = 0; j < effs.length; j++) {
    const e = effs[j] as Segment;
    if (!isShellLike(e.program) || !readsStdin(e)) continue;
    if (e.heredoc) out.push(e.heredoc);
    for (const r of e.redirects) if (r.op === "<<<") out.push(r.target);
    for (let k = 0; k < j; k++) {
      const s = effs[k] as Segment;
      if (s.program === "echo" || s.program === "printf") out.push(positional(s.args).join(" "));
      else if (s.program === "cat" && s.heredoc) out.push(s.heredoc);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// download-then-run
// ---------------------------------------------------------------------------

const cleanName = (p: string) => norm(p).replace(/^\.\//, "");

function downloadTargets(e: Segment, seg: Segment): string[] {
  const out: string[] = [];
  const a = e.args;
  const urlBase = () => {
    const u = a.find((x) => /^[a-z]+:\/\//i.test(x));
    if (!u) return null;
    const last = (u.split(/[?#]/)[0] as string).split("/").filter(Boolean).pop();
    return last && !/^[a-z]+:$/i.test(last) ? last : null;
  };
  if (e.program === "curl") {
    for (let k = 0; k < a.length; k++) {
      const x = a[k] as string;
      if ((x === "-o" || x === "--output") && a[k + 1]) out.push(a[k + 1] as string);
      else if (/^-o./.test(x) && !x.startsWith("--")) out.push(x.slice(2));
      else if (x.startsWith("--output=")) out.push(x.slice(9));
      else if (x === "--remote-name" || (/^-[A-Za-z]*O[A-Za-z]*$/.test(x) && !x.startsWith("--"))) {
        const b = urlBase();
        if (b) out.push(b);
      }
    }
  } else if (e.program === "wget") {
    let any = false;
    for (let k = 0; k < a.length; k++) {
      const x = a[k] as string;
      if ((x === "-O" || x === "--output-document") && a[k + 1]) {
        out.push(a[k + 1] as string);
        any = true;
      } else if (x.startsWith("-O") && x.length > 2 && !x.startsWith("--")) {
        out.push(x.slice(2));
        any = true;
      } else if (x.startsWith("--output-document=")) {
        out.push(x.slice(18));
        any = true;
      }
    }
    if (!any) {
      const b = urlBase();
      if (b) out.push(b);
    }
  } else if (e.program === "iwr" || e.program === "invoke-webrequest") {
    for (let k = 0; k < a.length; k++) {
      const n = psName(a[k] as string);
      if (n && n.length >= 2 && "outfile".startsWith(n) && a[k + 1]) out.push(a[k + 1] as string);
    }
  } else return out;
  for (const t of writeTargets(seg)) out.push(t);
  return out.map(cleanName).filter((x) => x && x !== "-" && !x.startsWith("/dev/"));
}

function downloadThenRun(parsed: ParsedCommand): boolean {
  const downloaded = new Set<string>();
  for (const seg of parsed.segments) {
    const e = effectiveSegment(seg);
    if (HTTP_FETCHERS.has(e.program)) {
      for (const t of downloadTargets(e, seg)) downloaded.add(t);
      continue;
    }
    if (!downloaded.size) continue;
    if (e.rawProgram && downloaded.has(cleanName(e.rawProgram))) return true;
    if (isInterpreter(e.program) || e.program === "source" || e.program === ".") {
      if (positional(e.args).some((x) => downloaded.has(cleanName(x)))) return true;
    }
    if (e.program === "start-process" || e.program === "start" || e.program === "saps" || e.program === "invoke-item") {
      if (e.args.some((x) => downloaded.has(cleanName(x)))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// SQL / datastore text scoping
// ---------------------------------------------------------------------------

const DB_CLIENTS = new Set(["psql", "pgcli", "mysql", "mycli", "mariadb", "sqlite3", "litecli", "sqlcmd", "mssql-cli", "mongosh", "mongo", "redis-cli", "valkey-cli", "duckdb", "clickhouse-client", "clickhouse", "cockroach", "usql", "isql", "sqlplus", "cqlsh", "bq", "snowsql"]);

/** Bare SQL typed as a shell command (`DELETE FROM users;`): the verb parses as the program name. */
const SQL_VERBS = new Set(["delete", "drop", "truncate"]);

function dbText(ctx: RuleContext): string | null {
  const e = ctx.seg;
  if (SQL_VERBS.has(e.program) && e.args.length > 0) return e.raw;
  if (!DB_CLIENTS.has(e.program)) return null;
  const parts: string[] = [e.args.join(" ")];
  if (e.heredoc) parts.push(e.heredoc);
  for (const r of e.redirects) if (r.op === "<<<") parts.push(r.target);
  for (let k = 0; k < ctx.index; k++) {
    const s = effectiveSegment(ctx.pipeline[k] as Segment);
    if (s.program === "echo" || s.program === "printf") parts.push(positional(s.args).join(" "));
    else if (s.program === "cat" && s.heredoc) parts.push(s.heredoc);
  }
  return parts.join("\n");
}

const SQL_DROP = /\bdrop\s+(database|schema|table|keyspace)\b/i;
const SQL_TRUNCATE = /\btruncate\s+(table\s+)?[\w"`[\]]/i;

function sqlDeleteWithoutWhere(text: string): boolean {
  for (const stmt of text.split(";")) {
    if (/\bdelete\s+from\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// rule table
// ---------------------------------------------------------------------------

const rules: Rule[] = [];
function rule(id: string, title: string, severity: DangerSeverity, reason: string, test: (ctx: RuleContext) => boolean, scope: RuleScope = "segment"): void {
  rules.push({ id, title, severity, reason, scope, test });
}

const PS_RM = new Set(["remove-item", "ri", "rmdir", "rd", "del", "erase"]);

// --- filesystem -------------------------------------------------------------
rule(
  "fs-recursive-delete",
  "Recursive Directory Deletion",
  "critical",
  "Recursively removes directories and files (`rm -rf`) without confirmation.",
  ({ seg }) => {
    if (seg.program !== "rm") return false;
    const f = shortFlags(seg.args);
    const recursive = /r/i.test(f) || hasLong(seg.args, "recursive") || psHas(seg.args, "recurse", 2);
    if (!recursive) return false;
    const force = /f/i.test(f) || hasLong(seg.args, "force") || psHas(seg.args, "force", 2);
    return force || hasLong(seg.args, "recursive") || hasLong(seg.args, "no-preserve-root") || positional(seg.args).some(isDangerousRmTarget);
  },
);
rule("fs-force-delete", "Forced File Deletion", "moderate", "Deletes files without prompting or errors (`rm -f`).", ({ seg }) => {
  if (seg.program !== "rm") return false;
  const f = shortFlags(seg.args);
  return /f/i.test(f) || hasLong(seg.args, "force") || psHas(seg.args, "force", 2);
});
rule("fs-find-delete", "Find and Delete Operation", "critical", "Executes mass file deletion via find command (`find ... -delete` / `-exec rm`).", ({ seg }) => {
  if (seg.program !== "find") return false;
  if (seg.args.includes("-delete")) return true;
  for (let k = 0; k < seg.args.length; k++) {
    if (["-exec", "-execdir", "-ok", "-okdir"].includes(seg.args[k] as string)) {
      const cmd = (seg.args[k + 1] ?? "").toLowerCase().replace(/^.*[\\/]/, "");
      if (cmd === "rm" || cmd === "shred" || cmd === "unlink" || cmd === "rmdir") return true;
    }
  }
  return false;
});
rule("fs-truncate-zero", "File Truncation", "high", "Instantly truncates file contents to zero bytes (`truncate -s 0`).", ({ seg }) => {
  if (seg.program !== "truncate") return false;
  const a = seg.args;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] as string;
    if (x === "-s" && /^0[kmgtb]*$/i.test(a[k + 1] ?? "")) return true;
    if (/^-s0[kmgtb]*$/i.test(x) || /^--size=0[kmgtb]*$/i.test(x)) return true;
    if (x === "--size" && /^0[kmgtb]*$/i.test(a[k + 1] ?? "")) return true;
  }
  return false;
});
rule("fs-shred", "Secure Erase", "high", "Irrecoverably overwrites or erases files (`shred`, `srm`).", ({ seg }) => seg.program === "shred" || seg.program === "srm");
rule("fs-overwrite-system", "System Path Overwrite", "high", "Writes into system directories (`/etc`, `/boot`, `/usr`, ...).", ({ seg }) => {
  if (seg.program === "rm" || seg.program === "shred" || seg.program === "truncate") return false;
  return writeCandidates(seg).some((p) => SYSTEM_PATH.test(p));
});
rule("win-recurse-delete", "Windows Recursive Deletion", "critical", "Recursively deletes directory trees on Windows (`del /s` or `rmdir /s`).", ({ seg }) => {
  if (!["del", "erase", "rmdir", "rd"].includes(seg.program)) return false;
  return seg.args.some((a) => a.startsWith("/") && a.slice(1).toLowerCase().split("/").includes("s"));
});
rule("ps-recurse-delete", "PowerShell Recursive Removal", "critical", "Recursively forces deletion of items in PowerShell (`Remove-Item -Recurse -Force`).", ({ seg }) => {
  if (!PS_RM.has(seg.program)) return false;
  const recurse = psHas(seg.args, "recurse", 1) && seg.args.some((a) => a.startsWith("-") && /^-r/i.test(a));
  const force = psHas(seg.args, "force", 1) && seg.args.some((a) => /^-f/i.test(a));
  return recurse && force;
});
rule("ps-remove-recurse", "PowerShell Recursive Removal", "high", "Recursively deletes items in PowerShell (`Remove-Item -Recurse`).", ({ seg }) => {
  if (!PS_RM.has(seg.program)) return false;
  return seg.args.some((a) => /^-r/i.test(a) && psName(a) !== null && "recurse".startsWith(psName(a) as string));
});

// --- git ------------------------------------------------------------------
rule("git-reset-hard", "Hard Git Reset", "high", "Discards all uncommitted changes and resets git working tree (`git reset --hard`).", ({ seg }) => {
  const g = gitCommand(seg);
  return !!g && g.sub === "reset" && g.rest.includes("--hard");
});
rule("git-clean-force", "Force Git Clean", "high", "Permanently deletes untracked files from the repository (`git clean -f`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g || g.sub !== "clean") return false;
  return /f/.test(shortFlags(g.rest)) || hasLong(g.rest, "force");
});
rule("git-push-force", "Force Git Push", "high", "Overwrites remote repository history (`git push --force`, `+ref`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g || g.sub !== "push") return false;
  if (/f/.test(shortFlags(g.rest)) || hasLong(g.rest, "force") || hasLong(g.rest, "force-with-lease") || hasLong(g.rest, "mirror")) return true;
  return positional(g.rest).some((a) => a.startsWith("+") && a.length > 1);
});
rule("git-push-delete", "Delete Remote Git Ref", "high", "Deletes a branch or tag on the remote (`git push --delete` / `git push origin :ref`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g || g.sub !== "push") return false;
  if (hasLong(g.rest, "delete") || /d/.test(shortFlags(g.rest))) return true;
  return positional(g.rest).some((a) => /^:[^:\s]+/.test(a));
});
rule("git-restore-all", "Discard Working Tree Changes", "high", "Overwrites all modified files in the working directory (`git checkout .` or `git restore .`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g || (g.sub !== "restore" && g.sub !== "checkout")) return false;
  if (g.sub === "restore") {
    const staged = g.rest.includes("--staged") || /S/.test(shortFlags(g.rest));
    const worktree = g.rest.includes("--worktree") || /W/.test(shortFlags(g.rest));
    if (staged && !worktree) return false;
  }
  return positional(g.rest).some((a) => a === "." || a === "*" || a === ":/" || a === ":/*" || a === ":(top)");
});
rule("git-checkout-discard", "Discard Path Changes", "high", "Overwrites local modifications (`git checkout -f`, `git checkout -- <path>`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g || g.sub !== "checkout") return false;
  if (hasLong(g.rest, "force") || /f/.test(shortFlags(g.rest))) return true;
  const dd = g.rest.indexOf("--");
  return dd >= 0 && g.rest.length > dd + 1;
});
rule("git-branch-force-del", "Force Delete Git Branch", "moderate", "Force-deletes a git branch regardless of merge status (`git branch -D`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g || g.sub !== "branch") return false;
  const f = shortFlags(g.rest);
  return /D/.test(f) || ((/d/.test(f) || hasLong(g.rest, "delete")) && (/f/.test(f) || hasLong(g.rest, "force")));
});
rule("git-stash-drop", "Drop Git Stash", "moderate", "Permanently drops stashed work (`git stash drop|clear`).", ({ seg }) => {
  const g = gitCommand(seg);
  return !!g && g.sub === "stash" && (g.rest[0] === "drop" || g.rest[0] === "clear");
});
rule("git-history-rewrite", "Git History Destruction", "high", "Rewrites or irrecoverably prunes git history (`filter-branch`, `reflog expire`, `gc --prune=now`, `update-ref -d`).", ({ seg }) => {
  const g = gitCommand(seg);
  if (!g) return false;
  if (g.sub === "filter-branch" || g.sub === "filter-repo") return true;
  if (g.sub === "reflog") return g.rest[0] === "expire" || g.rest[0] === "delete";
  if (g.sub === "gc" || g.sub === "prune") return g.rest.some((a) => /^--prune=(now|all)$/.test(a)) || (g.sub === "prune" && g.rest.some((a) => /^--expire(=|$)/.test(a)));
  if (g.sub === "update-ref") return g.rest.includes("-d") || g.rest.includes("--delete");
  return false;
});

// --- privilege / permissions ----------------------------------------------
rule("priv-escalation", "Elevated Privileges Execution", "critical", "Executes commands with superuser or administrative privileges (`sudo` or `su -`).", ({ seg }) => {
  if (["sudo", "sudoedit", "doas", "pkexec", "gsudo", "su", "runas"].includes(seg.program)) return true;
  if (["start-process", "saps", "start"].includes(seg.program)) return seg.args.some((a) => a.toLowerCase() === "runas");
  return false;
});
rule("perm-wide-open", "Unrestricted File Permissions", "critical", "Grants unrestricted or setuid permissions (`chmod 777`, `chmod a+rwx`, `chmod +s`) or recursively changes ownership of system paths.", ({ seg }) => {
  const p = seg.program;
  const f = shortFlags(seg.args);
  if (p === "chmod") {
    const pos = positional(seg.args);
    const mode = pos[0];
    const targets = pos.slice(1);
    if (mode === undefined) return false;
    if (/^0?777$/.test(mode)) return true;
    if (/^[2467][0-7]{3}$/.test(mode)) return true;
    if (/^0{3,4}$/.test(mode) && /[rR]/.test(f)) return true;
    if (/[rR]/.test(f) && /^0?[0-7]{3}$/.test(mode) && targets.some(isDangerousRmTarget)) return true;
    for (const clause of mode.split(",")) {
      const m = /^([ugoa]*)([+=-])([rwxXst]*)$/.exec(clause);
      if (!m) continue;
      const who = m[1] as string;
      const op = m[2] as string;
      const perms = m[3] as string;
      if (op === "-") continue;
      if (/s/.test(perms) && (who === "" || /[ug]/.test(who) || who === "a")) return true;
      if (/w/.test(perms) && (who === "a" || who === "ugo" || who === "o" || /o/.test(who))) return true;
    }
    return false;
  }
  if (p === "chown" || p === "chgrp") {
    if (!/[rR]/.test(f) && !hasLong(seg.args, "recursive")) return false;
    return positional(seg.args)
      .slice(1)
      .some((t) => norm(t).startsWith("/") || t.startsWith("~") || t.startsWith("$") || t.startsWith("..") || t === "*");
  }
  return false;
});

// --- disks ---------------------------------------------------------------
rule("disk-raw-format", "Raw Filesystem Format", "critical", "Formats or creates a raw filesystem (`mkfs` or Windows `format`).", ({ seg }) => {
  const p = seg.program;
  if (/^(mkfs(\.[a-z0-9]+)?|mke2fs|mkswap|newfs(_[a-z0-9]+)?)$/.test(p)) return true;
  if (p === "format") return seg.args.some((a) => /^[a-zA-Z]:/.test(a));
  if (p === "diskutil") return /^(erase|reformat|partition|zero|secure)/i.test(seg.args[0] ?? "");
  return false;
});
rule("disk-raw-dd", "Direct Disk Write (dd)", "critical", "Writes raw blocks directly to a drive (`dd of=/dev/sd*`).", ({ seg }) => seg.program === "dd" && seg.args.some((a) => /^of=\/dev\/(sd[a-z]|nvme\d|vd[a-z]|xvd[a-z]|loop\d|hd[a-z]|disk\d|rdisk\d|mmcblk\d)/i.test(a)));
rule("disk-redirect", "Block Device Redirection", "critical", "Redirects output directly into a raw storage block device.", ({ seg }) => writeTargets(seg).some((t) => /^\/dev\/(sd[a-z]|nvme\d|vd[a-z]|xvd[a-z]|hd[a-z]|mmcblk\d|disk\d|rdisk\d)/i.test(t)));
rule("disk-partition", "Disk Partitioning Utility", "critical", "Invokes low-level disk partitioning utilities (`fdisk`, `parted`, `diskpart`).", ({ seg }) => {
  const p = seg.program;
  if (p === "diskpart") return true;
  if (!["fdisk", "parted", "sfdisk", "gdisk", "cfdisk", "sgdisk"].includes(p)) return false;
  const listOnly = seg.args.some((a) => a === "-l" || a === "--list" || a === "print");
  return !listOnly;
});
rule("disk-wipe", "Disk Signature Wipe", "critical", "Erases filesystem signatures or discards blocks (`wipefs -a`, `blkdiscard`).", ({ seg }) => {
  if (seg.program === "blkdiscard") return true;
  if (seg.program === "wipefs") return /[afo]/.test(shortFlags(seg.args)) || hasLong(seg.args, "all") || hasLong(seg.args, "force");
  return false;
});
rule("win-disk-wipe", "Windows Disk/Volume Destruction", "critical", "Wipes disks, partitions or volume shadow copies (`Clear-Disk`, `Format-Volume`, `vssadmin delete shadows`).", ({ seg }) => {
  const p = seg.program;
  if (["clear-disk", "format-volume", "initialize-disk", "remove-partition"].includes(p)) return true;
  if (p === "vssadmin") return seg.args.some((a) => a.toLowerCase() === "delete");
  if (p === "cipher") return seg.args.some((a) => /^\/w/i.test(a));
  if (p === "bcdedit") return seg.args.some((a) => /^\/(delete|deletevalue)$/i.test(a));
  return false;
});

// --- pipe-to-interpreter / remote exec --------------------------------------
rule(
  "remote-pipe-exec",
  "Remote Script Piped to Interpreter",
  "high",
  "Downloads untrusted content and feeds it straight into a shell or interpreter (`curl ... | sh`, `bash <(curl ...)`, download-then-run).",
  (ctx) => stdinExecFrom(ctx.pipeline, isFetcher, (e) => e.program !== "iex" && e.program !== "invoke-expression"),
  "pipeline",
);
rule(
  "remote-pipe-exec",
  "Remote Script Piped to Interpreter",
  "high",
  "Downloads untrusted content and feeds it straight into a shell or interpreter (`bash <(curl ...)`, `sh -c \"$(curl ...)\"`).",
  (ctx) => isInterpreter(effectiveSegment(ctx.seg).program) && segmentSubKinds(ctx.seg).has("fetch"),
);
rule(
  "decode-pipe-exec",
  "Decoded Payload Executed",
  "high",
  "Decodes an obfuscated payload and executes it (`base64 -d | sh`).",
  (ctx) => stdinExecFrom(ctx.pipeline, isDecoder),
  "pipeline",
);
rule(
  "decode-pipe-exec",
  "Decoded Payload Executed",
  "high",
  "Decodes an obfuscated payload and executes it (`sh -c \"$(echo ... | base64 -d)\"`).",
  (ctx) => isInterpreter(effectiveSegment(ctx.seg).program) && segmentSubKinds(ctx.seg).has("decode"),
);
rule(
  "download-then-run",
  "Downloaded File Executed",
  "high",
  "Downloads a file and then executes it in the same command.",
  ({ parsed }) => downloadThenRun(parsed),
  "command",
);
rule("ps-web-exec", "PowerShell Remote Web Execution", "high", "Executes unverified remote web script directly in PowerShell (`irm ... | iex`).", (ctx) => stdinExecFrom(ctx.pipeline, (e) => ["iwr", "irm", "invoke-webrequest", "invoke-restmethod", "curl", "wget"].includes(e.program)), "pipeline");

// --- secrets and exfiltration ---------------------------------------------
const READ_ALL = new Set(["cat", "bat", "batcat", "less", "more", "most", "head", "tail", "nl", "tac", "od", "xxd", "hexdump", "strings", "base64", "get-content", "gc", "type", "tar", "zip", "7z", "7za", "grep", "egrep", "fgrep", "rg", "ag", "ack", "cp", "mv", "install"]);
rule("secret-read", "Sensitive File Access", "high", "Reads credentials or private keys (`~/.ssh/*`, `.env*`, `~/.aws/*`, `*.pem`).", ({ seg }) => {
  const p = seg.program;
  if (!READ_ALL.has(p)) return false;
  let pos = positional(seg.args);
  if (p === "cp" || p === "mv" || p === "install") pos = pos.slice(0, -1);
  if (pos.some(isSecretPath)) return true;
  return readTargets(seg).some(isSecretPath);
});
rule("secret-exfil", "Secret Exfiltration", "critical", "Sends credentials or private keys over the network (`curl -d @~/.ssh/id_rsa`, `scp ~/.ssh/*`).", ({ seg }) => {
  const p = seg.program;
  if (!NET_SENDERS.has(p) && p !== "rsync") return false;
  if (readTargets(seg).some(isSecretPath)) return true;
  let args = seg.args;
  if (p === "scp" || p === "rsync") args = positional(args).slice(0, -1);
  for (const a of args) {
    if (isSecretPath(a)) return true;
    const at = a.lastIndexOf("@");
    if (at >= 0 && isSecretPath(a.slice(at + 1))) return true;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0 && isSecretPath(a.slice(eq + 1))) return true;
    }
  }
  return false;
});
rule(
  "env-exfil",
  "Environment Exfiltration",
  "high",
  "Pipes the process environment (secrets) to a network tool (`printenv | curl ...`).",
  (ctx) => {
    const effs = ctx.pipeline.map(effectiveSegment);
    for (let j = 1; j < effs.length; j++) {
      if (!NET_SENDERS.has((effs[j] as Segment).program)) continue;
      for (let k = 0; k < j; k++) if (isEnvDump(effs[k] as Segment)) return true;
    }
    return false;
  },
  "pipeline",
);
rule(
  "env-exfil",
  "Environment Exfiltration",
  "high",
  "Sends the process environment (secrets) to a network tool (`curl -d \"$(printenv)\"`).",
  (ctx) => NET_SENDERS.has(effectiveSegment(ctx.seg).program) && segmentSubKinds(ctx.seg).has("env"),
);

// --- reverse shells --------------------------------------------------------
rule("reverse-shell", "Reverse Shell", "critical", "Opens an interactive shell over the network (`nc -e`, `/dev/tcp/`, `socat ... exec:`).", ({ seg }) => {
  const p = seg.program;
  if (["nc", "ncat", "netcat"].includes(p)) {
    if (/[ec]/.test(shortFlags(seg.args)) || hasLong(seg.args, "exec") || hasLong(seg.args, "sh-exec") || hasLong(seg.args, "lua-exec")) return true;
  }
  if (p === "socat" && seg.args.some((a) => /(^|[:,])(exec|system):/i.test(a))) return true;
  return seg.redirects.some((r) => /^\/dev\/(tcp|udp)\//.test(r.target));
});

// --- persistence / tampering ------------------------------------------------
rule("persist-shell-rc", "Shell Startup / SSH Key Modification", "high", "Modifies shell startup files, `authorized_keys` or `~/.ssh` (persistence).", ({ seg }) => {
  if (seg.program === "rm") return false;
  return writeCandidates(seg).some((p) => RC_FILE.test(p));
});
rule("persist-cron", "Crontab Removal", "high", "Removes or replaces the user's scheduled jobs (`crontab -r`).", ({ seg }) => seg.program === "crontab" && /r/.test(shortFlags(seg.args)));
rule("tamper-history", "Shell History Tampering", "high", "Clears or disables shell history (`history -c`, `unset HISTFILE`).", ({ seg }) => {
  const p = seg.program;
  const f = shortFlags(seg.args);
  if (p === "history") return /[cdw]/.test(f);
  if (p === "unset") return seg.args.some((a) => /^HIST(FILE|SIZE|FILESIZE)$/.test(a));
  const kv = [...seg.assignments, ...seg.args];
  if (kv.some((a) => /^HIST(FILE|SIZE|FILESIZE)=(\/dev\/null|0|)$/.test(a))) return true;
  if (p === "set" && seg.args.join(" ") === "+o history") return true;
  if (p === "rm" || p === "shred" || p === "truncate" || p === "ln") return writeCandidates(seg).some((x) => HISTORY_FILE.test(x));
  return writeTargets(seg).some((t) => HISTORY_FILE.test(norm(t)));
});
rule("tamper-security", "Security Control Tampering", "high", "Disables firewall, SELinux or endpoint protection (`iptables -F`, `ufw disable`, `setenforce 0`).", ({ seg }) => {
  const p = seg.program;
  const a = seg.args.map((x) => x.toLowerCase());
  if (["iptables", "ip6tables", "ebtables", "arptables"].includes(p)) return a.some((x) => x === "-f" || x === "--flush" || x === "-x" || x === "--delete-chain") || (a.includes("-p") && a.includes("accept"));
  if (p === "nft") return a.includes("flush");
  if (p === "ufw") return a.includes("disable") || a.includes("reset");
  if (p === "setenforce") return a.includes("0") || a.includes("permissive");
  if (p === "auditctl") return a.includes("-e") && a.includes("0");
  if (p === "netsh") return a.includes("advfirewall") && a.includes("off");
  if (p === "set-mppreference") return a.some((x) => x.startsWith("-disable"));
  if (p === "spctl") return a.includes("--master-disable");
  if (p === "csrutil") return a.includes("disable");
  return false;
});

// --- system ----------------------------------------------------------------
rule("proc-mass-kill", "Mass Process Termination", "moderate", "Forcefully terminates processes by name or all processes (`killall`, `pkill`, `kill -9 -1`, `taskkill /F`).", ({ seg }) => {
  const p = seg.program;
  if (p === "killall" || p === "pkill") return !seg.args.some((a) => a === "-l" || a === "--list" || a === "-V");
  if (p === "kill") return seg.args.length >= 2 && seg.args[seg.args.length - 1] === "-1";
  if (p === "taskkill") return seg.args.some((a) => a.toLowerCase() === "/f");
  if (p === "stop-process" || p === "spps") return psHas(seg.args, "force", 1) && seg.args.some((a) => /^-f/i.test(a));
  return false;
});
rule("sys-power", "System Shutdown / Reboot", "high", "Shuts down, reboots or halts the machine.", ({ seg }) => {
  const p = seg.program;
  const a = seg.args.map((x) => x.toLowerCase());
  if (p === "shutdown") return !a.some((x) => x === "-c" || x === "/a");
  if (["reboot", "halt", "poweroff", "stop-computer", "restart-computer"].includes(p)) return true;
  if (p === "init" || p === "telinit") return a[0] === "0" || a[0] === "6";
  if (p === "systemctl") return ["poweroff", "reboot", "halt", "kexec"].includes(positional(a)[0] ?? "");
  return false;
});
rule("sys-service-stop", "Stop System Service", "moderate", "Stops or kills a system service (`systemctl stop`, `service ... stop`, `Stop-Service`).", ({ seg }) => {
  const p = seg.program;
  const a = seg.args.map((x) => x.toLowerCase());
  const pos = positional(a);
  if (p === "systemctl") return ["stop", "kill", "isolate"].includes(pos[0] ?? "");
  if (p === "service") return pos[1] === "stop";
  if (p === "launchctl") return ["unload", "remove", "bootout", "kill"].includes(pos[0] ?? "");
  if (p === "sc") return pos[0] === "stop";
  if (p === "net") return pos[0] === "stop";
  return p === "stop-service";
});
rule("sys-service-disable", "Disable System Service", "high", "Disables or masks a system service so it no longer starts (`systemctl disable|mask`).", ({ seg }) => {
  const p = seg.program;
  const a = seg.args.map((x) => x.toLowerCase());
  const pos = positional(a);
  if (p === "systemctl") return ["disable", "mask"].includes(pos[0] ?? "");
  if (p === "launchctl") return pos[0] === "disable";
  if (p === "sc") return pos[0] === "delete";
  if (p === "set-service") return a.some((x) => x === "disabled");
  if (p === "chkconfig") return a.includes("off");
  return false;
});
rule("exec-dynamic", "Dynamic Command Name", "moderate", "Executes a command whose name comes from a shell variable (`$CMD ...`), which cannot be inspected.", ({ seg }) => /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(seg.rawProgram));

// --- infra / cloud ----------------------------------------------------------
rule("infra-destroy", "Infrastructure Destroy", "critical", "Tears down managed infrastructure (`terraform destroy`, `pulumi destroy`).", ({ seg }) => {
  if (!["terraform", "tofu", "terragrunt", "pulumi", "cdk", "sam", "serverless", "sls"].includes(seg.program)) return false;
  return positional(seg.args).includes("destroy");
});
rule("infra-auto-approve", "Unattended Infrastructure Apply", "high", "Applies infrastructure changes without review (`terraform apply -auto-approve`).", ({ seg }) => {
  const p = seg.program;
  if (["terraform", "tofu", "terragrunt"].includes(p)) return seg.args.some((a) => /^-{1,2}auto-approve(=true)?$/.test(a));
  if (p === "pulumi") return positional(seg.args)[0] === "up" && (seg.args.includes("--yes") || seg.args.includes("-y"));
  return false;
});
rule("k8s-delete", "Kubernetes Delete", "high", "Deletes cluster resources (`kubectl delete`, `helm uninstall`).", ({ seg }) => {
  const p = seg.program;
  const pos = positional(seg.args);
  if (p === "kubectl" || p === "oc") {
    if (!pos.includes("delete")) return false;
    return !seg.args.some((a) => a === "--dry-run" || /^--dry-run=(client|server|true)$/.test(a));
  }
  if (p === "helm") return ["uninstall", "delete"].includes(pos[0] ?? "");
  return false;
});

function dockerWords(seg: Segment): string[] | null {
  if (!["docker", "podman", "nerdctl", "docker-compose", "podman-compose"].includes(seg.program)) return null;
  const a = seg.args;
  const out: string[] = [];
  for (let k = 0; k < a.length; k++) {
    const x = a[k] as string;
    if (["-H", "--host", "-c", "--context", "-l", "--log-level", "--config"].includes(x)) {
      k++;
      continue;
    }
    if (x.startsWith("-")) continue;
    out.push(x.toLowerCase());
    if (out.length >= 3) break;
  }
  return out;
}
rule("docker-destructive", "Docker Destructive Operation", "high", "Prunes or force-removes Docker data (`docker system prune`, `docker volume rm`, `docker compose down -v`).", ({ seg }) => {
  const w = dockerWords(seg);
  if (!w) return false;
  const f = shortFlags(seg.args);
  const force = /f/.test(f) || hasLong(seg.args, "force");
  const [a, b] = w;
  if (seg.program.endsWith("compose")) {
    const sub = a;
    return sub === "down" && (/v/.test(f) || hasLong(seg.args, "volumes"));
  }
  if (a === "system" && b === "prune") return true;
  if (a === "volume" && (b === "prune" || b === "rm" || b === "remove")) return true;
  if (a === "compose" && b === "down") return /v/.test(f) || hasLong(seg.args, "volumes");
  if ((a === "rm" || a === "rmi") && force) return true;
  if ((a === "container" || a === "image") && (b === "rm" || b === "rmi") && force) return true;
  if ((a === "container" || a === "image" || a === "network" || a === "builder") && b === "prune") return force || hasLong(seg.args, "all") || /a/.test(f);
  return false;
});
rule("docker-privileged", "Privileged Container", "high", "Runs a container with host-level access (`--privileged`, root volume mount).", ({ seg }) => {
  const w = dockerWords(seg);
  if (!w || !["run", "create", "exec"].includes(w[0] ?? "")) return false;
  const a = seg.args;
  if (a.some((x) => x === "--privileged" || x === "--privileged=true" || x === "--pid=host" || x === "--cap-add=ALL" || x === "--cap-add=SYS_ADMIN")) return true;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] as string;
    let val: string | null = null;
    if (x === "-v" || x === "--volume") val = a[k + 1] ?? null;
    else if (x.startsWith("--volume=")) val = x.slice(9);
    else if (/^-v./.test(x) && !x.startsWith("--")) val = x.slice(2);
    if (val !== null && /^\/(:|$)/.test(val)) return true;
    let mount: string | null = null;
    if (x === "--mount") mount = a[k + 1] ?? null;
    else if (x.startsWith("--mount=")) mount = x.slice(8);
    if (mount !== null && /(^|,)(source|src)=\/(,|$)/.test(mount)) return true;
  }
  return false;
});
rule("cloud-delete", "Cloud Resource Deletion", "high", "Deletes or empties cloud resources (`aws s3 rb|rm --recursive`, `gcloud ... delete`, `az ... delete`).", ({ seg }) => {
  const p = seg.program;
  const pos = positional(seg.args).map((x) => x.toLowerCase());
  if (p === "aws") {
    if (pos[0] === "s3" || pos[0] === "s3api") {
      if (pos[1] === "rb") return true;
      if (pos[1] === "rm" && (seg.args.includes("--recursive") || seg.args.includes("--include"))) return true;
      if (pos[1] === "sync" && seg.args.includes("--delete")) return true;
    }
    return pos.some((x) => /^(delete|terminate|remove|deregister|purge|destroy)-/.test(x));
  }
  if (["gcloud", "az", "doctl", "oci", "ibmcloud", "flyctl", "fly", "heroku", "gsutil", "bq"].includes(p)) {
    return pos.includes("delete") || pos.includes("destroy") || (p === "gsutil" && pos[0] === "rm" && /[rR]/.test(shortFlags(seg.args)));
  }
  return false;
});
rule("gh-repo-delete", "Delete GitHub Repository", "critical", "Permanently deletes a GitHub repository (`gh repo delete`).", ({ seg }) => {
  if (seg.program !== "gh") return false;
  const pos = positional(seg.args);
  return pos[0] === "repo" && pos[1] === "delete";
});
rule("pkg-publish", "Package Publish", "high", "Publishes or unpublishes a package to a public registry (`npm publish`).", ({ seg }) => {
  const p = seg.program;
  const pos = positional(seg.args).map((x) => x.toLowerCase());
  if (seg.args.some((a) => a === "--dry-run" || a === "-n" || a === "--dry-run=true")) return false;
  if (p === "npm" || p === "pnpm" || p === "bun") return pos[0] === "publish" || pos[0] === "unpublish";
  if (p === "yarn") return pos[0] === "publish" || (pos[0] === "npm" && (pos[1] === "publish" || pos[1] === "unpublish"));
  if (p === "cargo") return pos[0] === "publish" || pos[0] === "yank";
  if (p === "twine") return pos[0] === "upload";
  if (p === "gem") return pos[0] === "push";
  return false;
});
rule("deploy-prod", "Production Deploy", "high", "Deploys to production (`vercel --prod`, `netlify deploy --prod`).", ({ seg }) => {
  const p = seg.program;
  if (p !== "vercel" && p !== "netlify") return false;
  return seg.args.some((a) => a === "--prod" || a === "--production" || a === "--prod=true");
});

// --- data stores ------------------------------------------------------------
rule("db-drop-table", "Database Drop or Truncate", "critical", "Drops or truncates database tables and schemas without rollback.", (ctx) => {
  const p = ctx.seg.program;
  const pos = positional(ctx.seg.args);
  if (p === "dropdb") return true;
  if (p === "mysqladmin") return pos.includes("drop");
  if ((p === "rake" || p === "rails") && pos.some((x) => /^db:(drop|reset)$/.test(x))) return true;
  if (p === "prisma") {
    if (pos[0] === "migrate" && pos[1] === "reset") return true;
    if (pos[0] === "db" && pos[1] === "push" && ctx.seg.args.some((a) => a === "--force-reset" || a === "--accept-data-loss")) return true;
  }
  const t = dbText(ctx);
  return t !== null && (SQL_DROP.test(t) || SQL_TRUNCATE.test(t));
});
rule("db-delete-all", "Unbounded DELETE", "high", "Deletes every row of a table (`DELETE FROM ...` without `WHERE`).", (ctx) => {
  const t = dbText(ctx);
  return t !== null && (sqlDeleteWithoutWhere(t) || /\.(deleteMany|remove)\s*\(\s*\{\s*\}\s*\)/.test(t));
});
rule("db-flush", "Datastore Flush / Drop", "critical", "Wipes a datastore (`FLUSHALL`, `FLUSHDB`, `dropDatabase()`).", (ctx) => {
  const t = dbText(ctx);
  return t !== null && (/\bflush(all|db)\b/i.test(t) || /\bdropDatabase\s*\(/.test(t) || /\.drop\s*\(\s*\)/.test(t));
});

// --- windows ------------------------------------------------------------------
rule("win-encoded-command", "PowerShell Encoded Command", "high", "Runs an opaque base64-encoded PowerShell payload (`powershell -enc`).", ({ seg }) => {
  if (seg.program !== "powershell" && seg.program !== "pwsh") return false;
  return seg.args.some((a) => {
    const n = psName(a);
    return n !== null && n.length >= 1 && /^e/.test(n) && ("encodedcommand".startsWith(n) || "encodedarguments".startsWith(n));
  });
});
rule("win-exec-policy", "Execution Policy Change", "moderate", "Weakens the PowerShell script execution policy (`Set-ExecutionPolicy`).", ({ seg }) => seg.program === "set-executionpolicy");
rule("win-registry-delete", "Registry Key Deletion", "high", "Deletes Windows registry keys or values (`reg delete`).", ({ seg }) => seg.program === "reg" && (seg.args[0] ?? "").toLowerCase() === "delete");

export const RULES: readonly Rule[] = rules;

// ---------------------------------------------------------------------------
// skeleton rules (syntax-level, quoted content blanked)
// ---------------------------------------------------------------------------

export const SKELETON_RULES: readonly SkeletonRule[] = [
  {
    id: "sys-fork-bomb",
    title: "Fork Bomb",
    severity: "critical",
    reason: "Defines a self-replicating shell function (`:(){ :|:& };:`) that exhausts the machine.",
    pattern: /([A-Za-z_:][\w:-]*)\s*\(\s*\)\s*\{[^}]*\b\1\b[^}]*\|[^}]*\b\1\b[^}]*&|:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&/,
  },
  {
    id: "ps-web-exec",
    title: "PowerShell Remote Web Execution",
    severity: "high",
    reason: "Executes unverified remote web script directly in PowerShell (`iex (New-Object Net.WebClient).DownloadString(...)`).",
    pattern: /\b(iex|invoke-expression)\b[\s\S]*\b(new-object|irm|invoke-restmethod|iwr|invoke-webrequest|downloadstring|downloadfile)\b/i,
  },
  {
    id: "decode-pipe-exec",
    title: "Decoded Payload Executed",
    severity: "high",
    reason: "Decodes an obfuscated payload and executes it (`iex ([Convert]::FromBase64String(...))`).",
    pattern: /\b(iex|invoke-expression)\b[\s\S]*\bfrombase64string\b/i,
  },
  {
    id: "reverse-shell",
    title: "Reverse Shell",
    severity: "critical",
    reason: "Opens an interactive shell over the network (PowerShell `Net.Sockets.TCPClient`).",
    pattern: /\bnet\.sockets\.tcpclient\b/i,
  },
];
