/**
 * Wrapper unwrapping: `sudo`, `env`, `nohup`, `timeout`, `xargs`, `bash -c`, `cmd /c`,
 * `powershell -Command`, `eval`, `trap`, `ssh host cmd`, `find -exec`, ... expose the
 * command they will actually run. The analyser recurses into the result (depth-limited).
 */

import { makeSegment, normalizeProgram, type Segment } from "./tokenize.ts";

export const MAX_UNWRAP_DEPTH = 8;

export type Unwrapped = { kind: "words"; words: string[] } | { kind: "text"; text: string };

export const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh", "mksh", "rbash"]);

interface WrapperSpec {
  /** Options that consume the following word. */
  optArgs?: string[];
  /** Number of positional words to skip before the command. */
  positional?: number;
  /** Skip leading VAR=value words. */
  assign?: boolean;
}

const WRAPPERS: Record<string, WrapperSpec> = {
  sudo: { optArgs: ["-u", "-g", "-h", "-p", "-C", "-r", "-t", "-U", "-D", "-R", "-T", "--user", "--group", "--host", "--prompt", "--chdir", "--role", "--type", "--other-user"], assign: true },
  doas: { optArgs: ["-u", "-C"] },
  pkexec: { optArgs: ["--user"] },
  gsudo: { optArgs: [] },
  runuser: { optArgs: ["-u", "-g", "-l", "-s", "--user", "--group"] },
  env: { optArgs: ["-u", "-C", "--unset", "--chdir"], assign: true },
  command: { optArgs: [] },
  builtin: { optArgs: [] },
  exec: { optArgs: ["-a"] },
  nohup: { optArgs: [] },
  time: { optArgs: ["-f", "-o", "--format", "--output"] },
  nice: { optArgs: ["-n", "--adjustment"] },
  ionice: { optArgs: ["-c", "-n", "-p", "-t"] },
  setsid: { optArgs: [] },
  stdbuf: { optArgs: ["-i", "-o", "-e"] },
  timeout: { optArgs: ["-s", "-k", "--signal", "--kill-after"], positional: 1 },
  watch: { optArgs: ["-n", "-d", "--interval"] },
  unbuffer: { optArgs: [] },
  caffeinate: { optArgs: ["-t", "-w"] },
  chroot: { positional: 1, optArgs: ["--userspec", "--groups"] },
  taskset: { optArgs: [], positional: 1 },
  chrt: { optArgs: [], positional: 1 },
  flock: { optArgs: ["-w", "-E", "--timeout"], positional: 1 },
  sshpass: { optArgs: ["-p", "-f", "-d", "-P"] },
  xargs: { optArgs: ["-I", "-J", "-n", "-P", "-L", "-d", "-E", "-s", "-a", "-R", "-S", "--max-args", "--max-procs", "--delimiter", "--arg-file", "--replace"] },
  npx: { optArgs: ["-p", "--package", "-c", "--call", "--node-arg"] },
  pnpx: { optArgs: [] },
  bunx: { optArgs: [] },
};

function skipOptions(args: string[], spec: WrapperSpec): string[] | null {
  let k = 0;
  while (k < args.length) {
    const a = args[k] as string;
    if (a === "--") {
      k++;
      break;
    }
    if (a.startsWith("-") && a.length > 1) {
      k += spec.optArgs?.includes(a) ? 2 : 1;
      continue;
    }
    break;
  }
  k += spec.positional ?? 0;
  if (spec.assign) {
    while (k < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[k] as string)) k++;
  }
  const rest = args.slice(k);
  return rest.length ? rest : null;
}

/** Index of the `-c`-style script argument for a POSIX shell. */
function shellScript(args: string[]): string | null {
  for (let k = 0; k < args.length; k++) {
    const a = args[k] as string;
    if (a === "--") return null;
    if (a === "-o" || a === "+o" || a === "-O" || a === "+O") {
      k++;
      continue;
    }
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a)) {
      if (args[k + 1] === "--") return args[k + 2] ?? null;
      return args[k + 1] ?? null;
    }
    if (!a.startsWith("-") && !a.startsWith("+")) return null;
  }
  return null;
}

const PS_OPT_ARGS = new Set(["-executionpolicy", "-ep", "-windowstyle", "-w", "-inputformat", "-outputformat", "-version", "-configurationname", "-workingdirectory", "-wd", "-psconsolefile", "-custompipename"]);

function powershellScript(args: string[]): string | null {
  for (let k = 0; k < args.length; k++) {
    const a = (args[k] as string).toLowerCase();
    if (a.startsWith("-") || a.startsWith("/")) {
      const name = a.replace(/^[-/]/, "").split(":")[0] as string;
      if (name !== "" && "command".startsWith(name)) {
        const rest = args.slice(k + 1);
        return rest.length ? rest.join(" ") : null;
      }
      if (name !== "" && "file".startsWith(name)) return null;
      if (PS_OPT_ARGS.has("-" + name)) k++;
      continue;
    }
    // first positional: the command to run
    return args.slice(k).join(" ");
  }
  return null;
}

function cmdScript(args: string[]): string | null {
  for (let k = 0; k < args.length; k++) {
    const a = (args[k] as string).toLowerCase();
    if (a === "/c" || a === "/k" || a === "/r") {
      const rest = args.slice(k + 1);
      return rest.length ? rest.join(" ") : null;
    }
    const m = /^\/[ckr](.+)$/.exec(a);
    if (m) return [(args[k] as string).slice(2), ...args.slice(k + 1)].join(" ");
  }
  return null;
}

/** The part of `args` after the first `--`, as words. */
function afterDoubleDash(args: string[]): string[] | null {
  const k = args.indexOf("--");
  if (k < 0) return null;
  const rest = args.slice(k + 1);
  return rest.length ? rest : null;
}

const SSH_OPT_ARGS = new Set(["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"]);

function sshCommand(args: string[]): string | null {
  let k = 0;
  while (k < args.length) {
    const a = args[k] as string;
    if (a.startsWith("-") && a.length > 1) {
      k += SSH_OPT_ARGS.has(a) ? 2 : 1;
      continue;
    }
    break;
  }
  k++; // host
  const rest = args.slice(k);
  return rest.length ? rest.join(" ") : null;
}

const DOCKER_EXEC_OPT_ARGS = new Set(["-e", "--env", "-u", "--user", "-w", "--workdir", "--env-file", "--detach-keys"]);

function dockerExecCommand(args: string[]): string[] | null {
  // docker [global opts] exec [opts] CONTAINER cmd...
  let k = 0;
  while (k < args.length && (args[k] as string).startsWith("-")) k += ["-H", "--host", "-c", "--context", "-l", "--log-level", "--config"].includes(args[k] as string) ? 2 : 1;
  const sub = args[k];
  if (sub !== "exec") return null;
  k++;
  while (k < args.length && (args[k] as string).startsWith("-")) k += DOCKER_EXEC_OPT_ARGS.has(args[k] as string) ? 2 : 1;
  k++; // container
  const rest = args.slice(k);
  return rest.length ? rest : null;
}

const WSL_OPT_ARGS = new Set(["-d", "--distribution", "-u", "--user", "--cd"]);

function wslCommand(args: string[]): string[] | null {
  let k = 0;
  while (k < args.length) {
    const a = args[k] as string;
    if (a === "-e" || a === "--exec" || a === "--") {
      k++;
      break;
    }
    if (a.startsWith("-")) {
      k += WSL_OPT_ARGS.has(a) ? 2 : 1;
      continue;
    }
    break;
  }
  const rest = args.slice(k);
  return rest.length ? rest : null;
}

const FIND_EXEC = new Set(["-exec", "-execdir", "-ok", "-okdir"]);

function findExecCommands(args: string[]): string[][] {
  const out: string[][] = [];
  for (let k = 0; k < args.length; k++) {
    if (FIND_EXEC.has(args[k] as string)) {
      const cmd: string[] = [];
      let j = k + 1;
      while (j < args.length && args[j] !== ";" && args[j] !== "+" && args[j] !== "\\;") {
        cmd.push(args[j] as string);
        j++;
      }
      if (cmd.length) out.push(cmd);
      k = j;
    }
  }
  return out;
}

/** Commands/strings a segment hands over to for execution. Empty when it is not a wrapper. */
export function unwrap(seg: Segment): Unwrapped[] {
  const p = seg.program;
  const args = seg.args;
  const out: Unwrapped[] = [];
  const words = (w: string[] | null) => {
    if (w && w.length) out.push({ kind: "words", words: w });
  };
  const text = (t: string | null) => {
    if (t !== null && t.trim()) out.push({ kind: "text", text: t });
  };

  if (p === "command" && args.some((a) => a === "-v" || a === "-V")) return out;
  if (p === "env" && args.some((a) => a === "-S" || a === "--split-string")) {
    const k = args.findIndex((a) => a === "-S" || a === "--split-string");
    text(args[k + 1] ?? null);
    return out;
  }
  if (p === "su") {
    const k = args.findIndex((a) => a === "-c" || a === "--command");
    if (k >= 0) text(args[k + 1] ?? null);
    return out;
  }
  if (p === "busybox") {
    const rest = skipOptions(args, { optArgs: [] });
    if (rest && rest.length) {
      const applet = normalizeProgram(rest[0] as string);
      if (SHELLS.has(applet)) {
        text(shellScript(rest.slice(1)));
      } else {
        words(rest);
      }
    }
    return out;
  }
  if (WRAPPERS[p]) {
    words(skipOptions(args, WRAPPERS[p] as WrapperSpec));
    return out;
  }
  if (p === "pnpm" || p === "yarn" || p === "bun" || p === "npm") {
    const sub = args[0];
    if (sub === "dlx" || (sub === "exec" && p !== "yarn" && p !== "bun") || (p === "yarn" && sub === "exec")) {
      words(skipOptions(args.slice(1), { optArgs: ["-p", "--package", "-c", "--call"] }));
    }
    return out;
  }
  if (SHELLS.has(p)) {
    text(shellScript(args));
    return out;
  }
  if (p === "eval") {
    text(args.join(" "));
    return out;
  }
  if (p === "trap") {
    const a = args[0];
    if (a && a !== "-" && !a.startsWith("-")) text(a);
    return out;
  }
  if (p === "cmd") {
    text(cmdScript(args));
    return out;
  }
  if (p === "powershell" || p === "pwsh") {
    text(powershellScript(args));
    return out;
  }
  if (p === "wsl") {
    words(wslCommand(args));
    return out;
  }
  if (p === "ssh") {
    text(sshCommand(args));
    return out;
  }
  if (p === "docker" || p === "podman" || p === "nerdctl") {
    words(dockerExecCommand(args));
    return out;
  }
  if (p === "kubectl" || p === "oc") {
    if (args.includes("exec")) words(afterDoubleDash(args));
    return out;
  }
  if (p === "find") {
    for (const c of findExecCommands(args)) words(c);
    return out;
  }
  return out;
}

/** Build a Segment for an unwrapped word list, inheriting redirects/heredoc from the wrapper. */
export function segmentFromWords(words: string[], outer: Segment): Segment | null {
  const seg = makeSegment({
    words,
    redirects: outer.redirects,
    subs: [],
    raw: words.join(" "),
    ...(outer.heredoc !== undefined ? { heredoc: outer.heredoc, heredocQuoted: outer.heredocQuoted ?? false } : {}),
  });
  return seg;
}

/**
 * The segment that finally executes after peeling simple word-wrappers
 * (sudo/env/nohup/...). Does not follow `-c` strings. Depth-limited.
 */
export function effectiveSegment(seg: Segment): Segment {
  let cur = seg;
  for (let d = 0; d < MAX_UNWRAP_DEPTH; d++) {
    const inner = unwrap(cur).find((u) => u.kind === "words");
    if (!inner || inner.kind !== "words") return cur;
    const next = segmentFromWords(inner.words, seg);
    if (!next || !next.program) return cur;
    // `find -exec cmd` is not a pass-through wrapper for pipeline analysis
    if (cur.program === "find") return cur;
    cur = next;
  }
  return cur;
}

export { normalizeProgram };
