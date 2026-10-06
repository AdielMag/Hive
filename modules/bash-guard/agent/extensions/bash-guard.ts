/**
 * GENERATED - do not edit.
 *
 * Source: modules/bash-guard/src/extension/hook.ts (+ src/engine/*, src/jev.ts).
 * Regenerate: npm run build:extension -w @hive-module/bash-guard
 * A vitest check fails when this file is stale.
 */
// src/engine/legacy.ts
var LEGACY_RULES = [
  {
    id: "fs-recursive-delete",
    title: "Recursive Directory Deletion",
    severity: "critical",
    reason: "Recursively removes directories and files (`rm -rf`) without confirmation.",
    pattern: /\brm\s+.*(-[a-zA-Z0-9]*r[a-zA-Z0-9]*f|-[a-zA-Z0-9]*f[a-zA-Z0-9]*r|--recursive|(-r\b.*-f\b|-f\b.*-r\b))/i
  },
  {
    id: "fs-find-delete",
    title: "Find and Delete Operation",
    severity: "critical",
    reason: "Executes mass file deletion via find command (`find ... -delete` / `-exec rm`).",
    pattern: /\bfind\b.*(-delete|-exec\s+rm)/i
  },
  {
    id: "fs-truncate-zero",
    title: "File Truncation",
    severity: "high",
    reason: "Instantly truncates file contents to zero bytes (`truncate -s 0`).",
    pattern: /\btruncate\s+(-s\s*0|--size(=|\s+)0)/i
  },
  {
    id: "win-recurse-delete",
    title: "Windows Recursive Deletion",
    severity: "critical",
    reason: "Recursively deletes directory trees on Windows (`del /s` or `rmdir /s`).",
    pattern: /\b(del|erase)\s+.*(\/s|\-s)|\b(rmdir|rd)\s+.*(\/s|\-s)/i
  },
  {
    id: "ps-recurse-delete",
    title: "PowerShell Recursive Removal",
    severity: "critical",
    reason: "Recursively forces deletion of items in PowerShell (`Remove-Item -Recurse -Force`).",
    pattern: /\b(Remove-Item|ri|rmdir)\b.*(-Recurse|-r\b).*(-Force|-f\b)|\b(Remove-Item|ri|rmdir)\b.*(-Force|-f\b).*(-Recurse|-r\b)/i
  },
  {
    id: "git-reset-hard",
    title: "Hard Git Reset",
    severity: "high",
    reason: "Discards all uncommitted changes and resets git working tree (`git reset --hard`).",
    pattern: /\bgit\s+.*reset\s+.*--hard/i
  },
  {
    id: "git-clean-force",
    title: "Force Git Clean",
    severity: "high",
    reason: "Permanently deletes untracked files from the repository (`git clean -f`).",
    pattern: /\bgit\s+.*clean\s+.*-[a-zA-Z]*f/i
  },
  {
    id: "git-push-force",
    title: "Force Git Push",
    severity: "high",
    reason: "Overwrites remote repository history (`git push --force`).",
    pattern: /\bgit\s+.*push\s+.*(--force|-f\b|--force-with-lease|\s\+\S)/i
  },
  {
    id: "git-restore-all",
    title: "Discard Working Tree Changes",
    severity: "high",
    reason: "Overwrites all modified files in the working directory (`git checkout .` or `git restore .`).",
    pattern: /\bgit\s+.*(restore\s+\.|checkout\s+(--\s+)?\.)/i
  },
  {
    id: "git-branch-force-del",
    title: "Force Delete Git Branch",
    severity: "moderate",
    reason: "Force-deletes a git branch regardless of merge status (`git branch -D`).",
    pattern: /\bgit\s+.*branch\s+.*-D\b/
  },
  {
    id: "priv-escalation",
    title: "Elevated Privileges Execution",
    severity: "critical",
    reason: "Executes commands with superuser or administrative privileges (`sudo` or `su -`).",
    pattern: /\b(sudo|doas)\b|\bsu(\s+-|\s+root|\s*$)/i
  },
  {
    id: "perm-wide-open",
    title: "Unrestricted File Permissions",
    severity: "critical",
    reason: "Grants unrestricted read/write/execute permissions to all users (`chmod 777`).",
    pattern: /\bchmod\b.*(-R\s+)?777|\bchown\b.*-R/i
  },
  {
    id: "disk-raw-format",
    title: "Raw Filesystem Format",
    severity: "critical",
    reason: "Formats or creates a raw filesystem (`mkfs` or Windows `format`).",
    pattern: /\bmkfs(\.[a-z0-9]+)?\b|\bformat\s+[a-zA-Z]:/i
  },
  {
    id: "disk-raw-dd",
    title: "Direct Disk Write (dd)",
    severity: "critical",
    reason: "Writes raw blocks directly to a drive (`dd of=/dev/sd*`).",
    pattern: /\bdd\s+.*of=\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|loop[0-9]|hd[a-z]|disk|rdisk|mmcblk)/i
  },
  {
    id: "disk-redirect",
    title: "Block Device Redirection",
    severity: "critical",
    reason: "Redirects output directly into a raw storage block device.",
    pattern: />\s*\/dev\/(sd[a-z]|nvme[0-9]n[0-9]|vd[a-z]|hd[a-z])/i
  },
  {
    id: "disk-partition",
    title: "Disk Partitioning Utility",
    severity: "critical",
    reason: "Invokes low-level disk partitioning utilities (`fdisk`, `parted`, `diskpart`).",
    pattern: /\b(fdisk|parted|sfdisk|diskpart)\b/i
  },
  {
    id: "remote-pipe-exec",
    title: "Remote Script Piped to Shell",
    severity: "high",
    reason: "Downloads remote untrusted script and pipes directly into a shell interpreter.",
    pattern: /\b(curl|wget)\b.*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(curl|wget)\b.*\|\s*(sudo\s+)?(python[\d.]*|node|perl|ruby|php)\b/i
  },
  {
    id: "ps-web-exec",
    title: "PowerShell Remote Web Execution",
    severity: "high",
    reason: "Executes unverified remote web script directly in PowerShell (`iex ...`).",
    pattern: /\b(iex|Invoke-Expression)\b.*(New-Object|irm|Invoke-RestMethod|DownloadString)|\b(irm|Invoke-RestMethod)\b.*\|\s*(iex|Invoke-Expression)\b/i
  },
  {
    id: "db-drop-table",
    title: "Database Drop or Truncate",
    severity: "critical",
    reason: "Drops or truncates database tables and schemas without rollback.",
    pattern: /\b(drop\s+(database|table)|truncate\s+table)\b/i
  },
  {
    id: "proc-mass-kill",
    title: "Mass Process Termination",
    severity: "moderate",
    reason: "Forcefully terminates all matching or system processes (`killall -9` or `kill -9 -1`).",
    pattern: /\b(killall\s+-9|kill\s+-9\s+-1|pkill\s+-9)\b/i
  }
];
function legacySegments(rawCommand) {
  const segments = [];
  const normalized = rawCommand.trim();
  if (!normalized) return [];
  const subshellRe = /\$\(([^)]+)\)|`([^`]+)`/g;
  let match;
  while ((match = subshellRe.exec(normalized)) !== null) {
    const sub = match[1] || match[2];
    if (sub && sub.trim()) segments.push(sub.trim());
  }
  for (const part of normalized.split(/&&|\|\||;|\||&|\n/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    segments.push(trimmed);
    const inner = trimmed.match(/(?:bash|sh|zsh|cmd\.exe|powershell|pwsh)\s+(?:-c|\/c|-Command)\s+["']([^"']+)["']/i);
    if (inner?.[1]) segments.push(inner[1].trim());
  }
  return segments;
}
function legacyScan(command) {
  const full = command.trim();
  if (!full) return null;
  for (const seg of legacySegments(full)) {
    for (const rule2 of LEGACY_RULES) if (rule2.pattern.test(seg)) return { rule: rule2, segment: seg };
  }
  for (const rule2 of LEGACY_RULES) if (rule2.pattern.test(full)) return { rule: rule2, segment: full };
  return null;
}

// src/engine/tokenize.ts
var RESERVED = /* @__PURE__ */ new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "!", "{", "}", "time", "coproc", "esac"]);
var ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;
var EXEC_EXT = /\.(exe|cmd|bat|com|ps1)$/;
function normalizeProgram(word) {
  let w = word;
  if (!w.includes("/") && !w.includes(":") && w.includes("\\")) w = w.replace(/\\/g, "");
  const parts = w.split(/[\\/]/);
  const base = parts[parts.length - 1] ?? "";
  return base.toLowerCase().replace(EXEC_EXT, "");
}
function skipSingle(s, i) {
  const e = s.indexOf("'", i + 1);
  return e < 0 ? -1 : e + 1;
}
function skipBacktick(s, i) {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "`") return k + 1;
    k++;
  }
  return -1;
}
function skipDouble(s, i) {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === '"') return k + 1;
    if (c === "$" && s[k + 1] === "(") {
      const e = readBalanced(s, k + 1);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    k++;
  }
  return -1;
}
function readBalanced(s, open) {
  let depth = 0;
  let k = open;
  const pendingHeredocs = [];
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "<" && s[k + 1] === "<" && s[k + 2] !== "<") {
      let j = k + 2;
      let strip = false;
      if (s[j] === "-") {
        strip = true;
        j++;
      }
      while (s[j] === " " || s[j] === "	") j++;
      let delim = "";
      if (s[j] === "'" || s[j] === '"') {
        const e = s.indexOf(s[j], j + 1);
        if (e < 0) return -1;
        delim = s.slice(j + 1, e);
        j = e + 1;
      } else {
        const m = /^[A-Za-z_][^\s;&|<>()]*/.exec(s.slice(j));
        if (m) {
          delim = m[0];
          j += delim.length;
        }
      }
      if (delim) pendingHeredocs.push({ delim, strip });
      k = Math.max(j, k + 2);
      continue;
    }
    if (c === "\n" && pendingHeredocs.length) {
      k++;
      while (pendingHeredocs.length) {
        const h = pendingHeredocs.shift();
        while (k < s.length) {
          let e = s.indexOf("\n", k);
          if (e < 0) e = s.length;
          const line = s.slice(k, e).replace(/\r$/, "");
          k = Math.min(s.length, e + 1);
          if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        }
      }
      continue;
    }
    if (c === "'") {
      const e = skipSingle(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === '"') {
      const e = skipDouble(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return k + 1;
    }
    k++;
  }
  return -1;
}
function readBraces(s, open) {
  let depth = 0;
  let k = open;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return k + 1;
    }
    k++;
  }
  return -1;
}
function decodeAnsiC(body) {
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|u[0-9a-fA-F]{1,4}|.)/gs, (_m, g) => {
    if (g[0] === "x" && g.length > 1) return String.fromCharCode(parseInt(g.slice(1), 16));
    if (g[0] === "u" && g.length > 1) return String.fromCharCode(parseInt(g.slice(1), 16));
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8));
    switch (g) {
      case "n":
        return "\n";
      case "t":
        return "	";
      case "r":
        return "\r";
      case "a":
        return "\x07";
      case "b":
        return "\b";
      case "e":
      case "E":
        return "\x1B";
      default:
        return g;
    }
  });
}
function findSubstitutions(text) {
  const out = [];
  let k = 0;
  while (k < text.length) {
    const c = text[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "$" && text[k + 1] === "(" && text[k + 2] !== "(") {
      const e = readBalanced(text, k + 1);
      if (e < 0) break;
      out.push({ text: text.slice(k + 2, e - 1), kind: "command" });
      k = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(text, k);
      if (e < 0) break;
      out.push({ text: text.slice(k + 1, e - 1).replace(/\\`/g, "`"), kind: "command" });
      k = e;
      continue;
    }
    k++;
  }
  return out;
}
function makeSegment(input) {
  const words = [...input.words];
  const assignments = [];
  for (; ; ) {
    const w = words[0];
    if (w === void 0) break;
    if (w === "function") {
      words.shift();
      if (words[0] !== void 0) words.shift();
      if (words[0] === "()") words.shift();
      continue;
    }
    if (w === "time") {
      words.shift();
      if (words[0] === "-p" || words[0] === "--portability") words.shift();
      continue;
    }
    if (RESERVED.has(w)) {
      words.shift();
      continue;
    }
    if (ASSIGNMENT.test(w)) {
      assignments.push(words.shift());
      continue;
    }
    break;
  }
  const redirects = input.redirects ?? [];
  const subs = input.subs ?? [];
  if (words.length === 0 && assignments.length === 0 && redirects.length === 0 && subs.length === 0) return null;
  const rawProgram = words[0] ?? "";
  const seg = {
    raw: input.raw ?? [...assignments, ...words].join(" "),
    program: rawProgram ? normalizeProgram(rawProgram) : "",
    rawProgram,
    args: words.slice(1),
    words,
    assignments,
    redirects,
    subs
  };
  if (input.heredoc !== void 0) {
    seg.heredoc = input.heredoc;
    seg.heredocQuoted = input.heredocQuoted ?? false;
  }
  return seg;
}
function parseCommand(src) {
  const s = src;
  const n = s.length;
  let i = 0;
  let skeleton = "";
  const pipelines = [];
  const allSegments = [];
  let curPipe = [];
  let words = [];
  let redirects = [];
  let extraSubs = [];
  let slots = [];
  let cur = null;
  let pending = null;
  const awaitingBody = [];
  const segSlots = /* @__PURE__ */ new Map();
  let failure;
  const blank = (e) => {
    skeleton += " ".repeat(Math.max(0, e - i));
    i = e;
  };
  const ensureWord = () => {
    if (!cur) cur = { value: "", quoted: false, subs: [], start: i };
    return cur;
  };
  const endWord = () => {
    if (!cur) return;
    const w = cur;
    cur = null;
    if (pending) {
      const op = pending.op;
      pending = null;
      redirects.push({ op, target: w.value });
      extraSubs.push(...w.subs);
      if (op === "<<" || op === "<<-") {
        const slot = { delim: w.value, strip: op === "<<-", quoted: w.quoted, body: "" };
        slots.push(slot);
        awaitingBody.push(slot);
      }
      return;
    }
    words.push(w);
  };
  const flushSegment = (end) => {
    endWord();
    pending = null;
    if (words.length || redirects.length || extraSubs.length) {
      const subs = [...extraSubs];
      for (const w of words) subs.push(...w.subs);
      const values = words.map((w) => w.value);
      let drop = 0;
      while (drop < values.length && RESERVED.has(values[drop])) drop++;
      const startIdx = words[drop]?.start ?? words[0]?.start ?? end;
      const raw = s.slice(startIdx, end).trim();
      const seg = makeSegment({ words: values, redirects, subs, raw: raw || values.join(" ") });
      if (seg) {
        if (slots.length) segSlots.set(seg, slots);
        curPipe.push(seg);
        allSegments.push(seg);
      }
    }
    words = [];
    redirects = [];
    extraSubs = [];
    slots = [];
  };
  const endPipeline = () => {
    if (curPipe.length) {
      pipelines.push({ segments: curPipe, raw: curPipe.map((x) => x.raw).join(" | ") });
    }
    curPipe = [];
  };
  const consumeHeredocs = () => {
    while (awaitingBody.length) {
      const slot = awaitingBody.shift();
      const lines = [];
      while (i < n) {
        let e = s.indexOf("\n", i);
        const last = e < 0;
        if (last) e = n;
        const line = s.slice(i, e);
        const cmp = (slot.strip ? line.replace(/^\t+/, "") : line).replace(/\r$/, "");
        skeleton += " ".repeat(Math.min(n, last ? e : e + 1) - i);
        i = last ? n : e + 1;
        if (cmp === slot.delim) {
          break;
        }
        lines.push(line.replace(/\r$/, ""));
      }
      slot.body = lines.join("\n");
    }
  };
  let afterPipe = false;
  while (i < n && !failure) {
    const c = s[i];
    if (c === " " || c === "	" || c === "\r") {
      endWord();
      skeleton += c;
      i++;
      continue;
    }
    if (c === "\n") {
      if (afterPipe) {
        endWord();
        skeleton += c;
        i++;
        if (awaitingBody.length) consumeHeredocs();
        continue;
      }
      flushSegment(i);
      endPipeline();
      skeleton += c;
      i++;
      if (awaitingBody.length) consumeHeredocs();
      continue;
    }
    if (c === "#" && cur === null) {
      const e = s.indexOf("\n", i);
      blank(e < 0 ? n : e);
      continue;
    }
    afterPipe = false;
    if (c === ";") {
      flushSegment(i);
      endPipeline();
      skeleton += c;
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      flushSegment(i);
      endPipeline();
      skeleton += c;
      i++;
      continue;
    }
    if (c === "&") {
      if (s[i + 1] === ">") {
        endWord();
        const op = s[i + 2] === ">" ? "&>>" : "&>";
        pending = { op };
        skeleton += op;
        i += op.length;
        continue;
      }
      flushSegment(i);
      endPipeline();
      const two = s[i + 1] === "&";
      skeleton += two ? "&&" : "&";
      i += two ? 2 : 1;
      continue;
    }
    if (c === "|") {
      flushSegment(i);
      if (s[i + 1] === "|") {
        endPipeline();
        skeleton += "||";
        i += 2;
        afterPipe = false;
        continue;
      }
      const two = s[i + 1] === "&";
      skeleton += two ? "|&" : "|";
      i += two ? 2 : 1;
      afterPipe = true;
      continue;
    }
    if (c === "<" || c === ">") {
      if (s[i + 1] === "(") {
        const e = readBalanced(s, i + 1);
        if (e < 0) {
          failure = "unterminated process substitution";
          break;
        }
        const w = ensureWord();
        w.value += s.slice(i, e);
        w.subs.push({ text: s.slice(i + 2, e - 1), kind: "process" });
        blank(e);
        continue;
      }
      if (cur !== null) {
        const w = cur;
        if (!w.quoted && /^\d+$/.test(w.value)) {
          cur = null;
        } else endWord();
      }
      let op;
      if (c === ">") {
        if (s[i + 1] === ">") op = ">>";
        else if (s[i + 1] === "|") op = ">|";
        else if (s[i + 1] === "&") op = ">&";
        else op = ">";
      } else if (s.startsWith("<<<", i)) op = "<<<";
      else if (s.startsWith("<<-", i)) op = "<<-";
      else if (s.startsWith("<<", i)) op = "<<";
      else if (s[i + 1] === "&") op = "<&";
      else if (s[i + 1] === ">") op = "<>";
      else op = "<";
      pending = { op };
      skeleton += op;
      i += op.length;
      continue;
    }
    if (c === "\\") {
      const nx = s[i + 1];
      if (nx === void 0) {
        ensureWord().value += "\\";
        skeleton += "\\";
        i++;
        continue;
      }
      if (nx === "\n") {
        skeleton += "  ";
        i += 2;
        continue;
      }
      if (cur === null && /[A-Za-z0-9_.\/-]/.test(nx)) {
        ensureWord().quoted = true;
        skeleton += "\\";
        i++;
        continue;
      }
      if (/[\s'"\\$`;&|<>()*?#~!{}[\]]/.test(nx)) {
        const w = ensureWord();
        w.value += nx;
        w.quoted = true;
        skeleton += "\\" + nx;
        i += 2;
        continue;
      }
      ensureWord().value += "\\";
      skeleton += "\\";
      i++;
      continue;
    }
    if (c === "'") {
      const e = skipSingle(s, i);
      if (e < 0) {
        failure = "unterminated single quote";
        break;
      }
      const w = ensureWord();
      w.quoted = true;
      w.value += s.slice(i + 1, e - 1);
      blank(e);
      continue;
    }
    if (c === '"') {
      const e = skipDouble(s, i);
      if (e < 0) {
        failure = "unterminated double quote";
        break;
      }
      const w = ensureWord();
      w.quoted = true;
      const body = s.slice(i + 1, e - 1);
      w.subs.push(...findSubstitutions(body));
      w.value += body.replace(/\\([\\"$`])/g, "$1");
      blank(e);
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(s, i);
      if (e < 0) {
        failure = "unterminated backtick";
        break;
      }
      const w = ensureWord();
      w.value += s.slice(i, e);
      w.subs.push({ text: s.slice(i + 1, e - 1).replace(/\\`/g, "`"), kind: "command" });
      blank(e);
      continue;
    }
    if (c === "$") {
      const nx = s[i + 1];
      if (nx === "(") {
        const e = readBalanced(s, i + 1);
        if (e < 0) {
          failure = "unterminated command substitution";
          break;
        }
        const w = ensureWord();
        w.value += s.slice(i, e);
        if (s[i + 2] !== "(") w.subs.push({ text: s.slice(i + 2, e - 1), kind: "command" });
        blank(e);
        continue;
      }
      if (nx === "{") {
        const e = readBraces(s, i + 1);
        if (e < 0) {
          failure = "unterminated parameter expansion";
          break;
        }
        ensureWord().value += s.slice(i, e);
        skeleton += s.slice(i, e);
        i = e;
        continue;
      }
      if (nx === "'") {
        const e = skipSingleAnsi(s, i + 1);
        if (e < 0) {
          failure = "unterminated $'' string";
          break;
        }
        const w = ensureWord();
        w.quoted = true;
        w.value += decodeAnsiC(s.slice(i + 2, e - 1));
        blank(e);
        continue;
      }
      if (nx === '"') {
        const e = skipDouble(s, i + 1);
        if (e < 0) {
          failure = 'unterminated $"" string';
          break;
        }
        const w = ensureWord();
        w.quoted = true;
        const body = s.slice(i + 2, e - 1);
        w.subs.push(...findSubstitutions(body));
        w.value += body.replace(/\\([\\"$`])/g, "$1");
        blank(e);
        continue;
      }
    }
    ensureWord().value += c;
    skeleton += c;
    i++;
  }
  if (failure) {
    return { ok: false, error: failure, src, pipelines: [], segments: [], skeleton };
  }
  flushSegment(n);
  endPipeline();
  for (const [seg, sl] of segSlots) {
    seg.heredoc = sl.map((x) => x.body).join("\n");
    seg.heredocQuoted = sl.every((x) => x.quoted);
    if (!seg.heredocQuoted) {
      for (const x of sl) if (!x.quoted) seg.subs.push(...findSubstitutions(x.body));
    }
  }
  return { ok: true, src, pipelines, segments: allSegments, skeleton };
}
function skipSingleAnsi(s, i) {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "'") return k + 1;
    k++;
  }
  return -1;
}

// src/engine/unwrap.ts
var MAX_UNWRAP_DEPTH = 8;
var SHELLS = /* @__PURE__ */ new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh", "mksh", "rbash"]);
var WRAPPERS = {
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
  bunx: { optArgs: [] }
};
function skipOptions(args, spec) {
  let k = 0;
  while (k < args.length) {
    const a = args[k];
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
    while (k < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[k])) k++;
  }
  const rest = args.slice(k);
  return rest.length ? rest : null;
}
function shellScript(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
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
var PS_OPT_ARGS = /* @__PURE__ */ new Set(["-executionpolicy", "-ep", "-windowstyle", "-w", "-inputformat", "-outputformat", "-version", "-configurationname", "-workingdirectory", "-wd", "-psconsolefile", "-custompipename"]);
function powershellScript(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k].toLowerCase();
    if (a.startsWith("-") || a.startsWith("/")) {
      const name = a.replace(/^[-/]/, "").split(":")[0];
      if (name !== "" && "command".startsWith(name)) {
        const rest = args.slice(k + 1);
        return rest.length ? rest.join(" ") : null;
      }
      if (name !== "" && "file".startsWith(name)) return null;
      if (PS_OPT_ARGS.has("-" + name)) k++;
      continue;
    }
    return args.slice(k).join(" ");
  }
  return null;
}
function cmdScript(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k].toLowerCase();
    if (a === "/c" || a === "/k" || a === "/r") {
      const rest = args.slice(k + 1);
      return rest.length ? rest.join(" ") : null;
    }
    const m = /^\/[ckr](.+)$/.exec(a);
    if (m) return [args[k].slice(2), ...args.slice(k + 1)].join(" ");
  }
  return null;
}
function afterDoubleDash(args) {
  const k = args.indexOf("--");
  if (k < 0) return null;
  const rest = args.slice(k + 1);
  return rest.length ? rest : null;
}
var SSH_OPT_ARGS = /* @__PURE__ */ new Set(["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"]);
function sshCommand(args) {
  let k = 0;
  while (k < args.length) {
    const a = args[k];
    if (a.startsWith("-") && a.length > 1) {
      k += SSH_OPT_ARGS.has(a) ? 2 : 1;
      continue;
    }
    break;
  }
  k++;
  const rest = args.slice(k);
  return rest.length ? rest.join(" ") : null;
}
var DOCKER_EXEC_OPT_ARGS = /* @__PURE__ */ new Set(["-e", "--env", "-u", "--user", "-w", "--workdir", "--env-file", "--detach-keys"]);
function dockerExecCommand(args) {
  let k = 0;
  while (k < args.length && args[k].startsWith("-")) k += ["-H", "--host", "-c", "--context", "-l", "--log-level", "--config"].includes(args[k]) ? 2 : 1;
  const sub = args[k];
  if (sub !== "exec") return null;
  k++;
  while (k < args.length && args[k].startsWith("-")) k += DOCKER_EXEC_OPT_ARGS.has(args[k]) ? 2 : 1;
  k++;
  const rest = args.slice(k);
  return rest.length ? rest : null;
}
var WSL_OPT_ARGS = /* @__PURE__ */ new Set(["-d", "--distribution", "-u", "--user", "--cd"]);
function wslCommand(args) {
  let k = 0;
  while (k < args.length) {
    const a = args[k];
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
var FIND_EXEC = /* @__PURE__ */ new Set(["-exec", "-execdir", "-ok", "-okdir"]);
function findExecCommands(args) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    if (FIND_EXEC.has(args[k])) {
      const cmd = [];
      let j = k + 1;
      while (j < args.length && args[j] !== ";" && args[j] !== "+" && args[j] !== "\\;") {
        cmd.push(args[j]);
        j++;
      }
      if (cmd.length) out.push(cmd);
      k = j;
    }
  }
  return out;
}
function unwrap(seg) {
  const p = seg.program;
  const args = seg.args;
  const out = [];
  const words = (w) => {
    if (w && w.length) out.push({ kind: "words", words: w });
  };
  const text = (t) => {
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
      const applet = normalizeProgram(rest[0]);
      if (SHELLS.has(applet)) {
        text(shellScript(rest.slice(1)));
      } else {
        words(rest);
      }
    }
    return out;
  }
  if (WRAPPERS[p]) {
    words(skipOptions(args, WRAPPERS[p]));
    return out;
  }
  if (p === "pnpm" || p === "yarn" || p === "bun" || p === "npm") {
    const sub = args[0];
    if (sub === "dlx" || sub === "exec" && p !== "yarn" && p !== "bun" || p === "yarn" && sub === "exec") {
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
function segmentFromWords(words, outer) {
  const seg = makeSegment({
    words,
    redirects: outer.redirects,
    subs: [],
    raw: words.join(" "),
    ...outer.heredoc !== void 0 ? { heredoc: outer.heredoc, heredocQuoted: outer.heredocQuoted ?? false } : {}
  });
  return seg;
}
function effectiveSegment(seg) {
  let cur = seg;
  for (let d = 0; d < MAX_UNWRAP_DEPTH; d++) {
    const inner = unwrap(cur).find((u) => u.kind === "words");
    if (!inner || inner.kind !== "words") return cur;
    const next = segmentFromWords(inner.words, seg);
    if (!next || !next.program) return cur;
    if (cur.program === "find") return cur;
    cur = next;
  }
  return cur;
}

// src/engine/rules.ts
var norm = (p) => p.replace(/\\/g, "/");
function shortFlags(args) {
  let f = "";
  for (const a of args) {
    if (a === "--") break;
    if (/^-[A-Za-z0-9]+$/.test(a)) f += a.slice(1);
  }
  return f;
}
function hasLong(args, name) {
  return args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}
function positional(args) {
  const out = [];
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
function psName(a) {
  if (!a.startsWith("-") || a.startsWith("--") || a.length < 2) return null;
  return a.slice(1).split(":")[0].toLowerCase();
}
var psHas = (args, full, minLen = 1) => args.some((a) => {
  const n = psName(a);
  return n !== null && n.length >= minLen && full.startsWith(n);
});
var WRITE_OPS = /* @__PURE__ */ new Set([">", ">>", ">|", "&>", "&>>", ">&", "<>"]);
function writeTargets(seg) {
  return seg.redirects.filter((r) => WRITE_OPS.has(r.op) && !(r.op === ">&" && /^(\d+-?|-)$/.test(r.target))).map((r) => r.target);
}
function readTargets(seg) {
  return seg.redirects.filter((r) => r.op === "<").map((r) => r.target);
}
function gitCommand(seg) {
  if (seg.program !== "git") return null;
  const a = seg.args;
  let k = 0;
  while (k < a.length) {
    const x = a[k];
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
function isDangerousRmTarget(raw) {
  const a = norm(raw);
  if (a === "/" || a === "/*" || a === "~" || a === "~/" || a === "~/*") return true;
  if (/^\$\{?(HOME|USERPROFILE)\}?(\/\*?)?$/i.test(a) || /^%USERPROFILE%/i.test(a)) return true;
  if (a === "*" || a === ".*" || a === "." || a === "./" || a === "./*" || a === ".." || a === "../" || a === "../*" || a.startsWith("../")) return true;
  if (/^\/(bin|boot|dev|etc|home|lib|lib64|opt|proc|root|sbin|srv|sys|usr|var|Users|System|Library|Applications|mnt|media)(\/\*?)?$/.test(a)) return true;
  if (/^[A-Za-z]:\/?\*?$/.test(a)) return true;
  return false;
}
var SYSTEM_PATH = /^\/(etc|boot|usr|bin|sbin|lib|lib64|System|Library)(\/|$)|^[A-Za-z]:\/Windows(\/|$)/i;
var RC_FILE = /(^|\/)\.(bashrc|bash_profile|bash_login|bash_logout|profile|zshrc|zshenv|zprofile|zlogin|zlogout|cshrc|tcshrc|kshrc)$|(^|\/)\.config\/fish\/config\.fish$|(^|\/)authorized_keys2?$|(^|\/)\.ssh(\/|$)|^\/etc\/(profile|bash\.bashrc|environment|zshrc)(\.d\/.*)?$/;
var HISTORY_FILE = /(^|\/)\.(bash|zsh|python|node_repl|mysql|psql)_history$/;
var SECRET_RES = [
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.gnupg(\/|$)/,
  /\.(pem|key|p12|pfx|ppk|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/,
  /(^|\/)\.(netrc|git-credentials|pypirc)$/,
  /(^|\/)\.docker\/config\.json$/,
  /(^|\/)\.kube\/config$/,
  /^\/etc\/(shadow|sudoers|gshadow)/,
  /(^|\/)credentials\.json$/
];
function isSecretPath(raw) {
  const p = norm(raw);
  if (/\.pub$/.test(p)) return false;
  if (/(^|\/)known_hosts2?(\.old)?$/.test(p)) return false;
  if (/(^|\/)\.ssh\/config$/.test(p)) return false;
  if (/(^|\/)\.env([._-][\w.-]*)?$/.test(p)) return !/\.(example|sample|template|dist|defaults?)$/i.test(p);
  return SECRET_RES.some((re) => re.test(p));
}
function writeCandidates(seg) {
  const out = writeTargets(seg);
  const pos = positional(seg.args);
  const p = seg.program;
  if (p === "tee") out.push(...pos);
  else if ((p === "cp" || p === "mv" || p === "install" || p === "ln") && pos.length >= 2) out.push(pos[pos.length - 1]);
  else if ((p === "sed" || p === "perl") && (/i/.test(shortFlags(seg.args)) || seg.args.some((a) => a.startsWith("-i") || a === "--in-place"))) out.push(...pos.slice(1));
  else if (p === "dd") {
    for (const a of seg.args) if (a.startsWith("of=")) out.push(a.slice(3));
  } else if (p === "truncate" || p === "rm" || p === "shred") out.push(...pos);
  return out.map(norm);
}
var FETCHERS = /* @__PURE__ */ new Set(["curl", "wget", "fetch", "aria2c", "iwr", "irm", "invoke-webrequest", "invoke-restmethod", "http", "https", "lwp-request", "nc", "ncat", "netcat", "socat", "telnet"]);
var HTTP_FETCHERS = /* @__PURE__ */ new Set(["curl", "wget", "iwr", "invoke-webrequest", "aria2c", "fetch"]);
var NET_SENDERS = /* @__PURE__ */ new Set(["curl", "wget", "nc", "ncat", "netcat", "socat", "telnet", "scp", "sftp", "ftp", "iwr", "irm", "invoke-webrequest", "invoke-restmethod", "http", "https", "sendmail", "mail"]);
var SCRIPT_LANGS = /^(python[\d.]*|pypy[\d.]*|node|nodejs|deno|bun|perl|ruby|php|lua|osascript|rscript|tclsh)$/;
var INTERPRETER_EXTRA = /* @__PURE__ */ new Set(["pwsh", "powershell", "cmd", "iex", "invoke-expression", "eval", "source", "."]);
function isInterpreter(p) {
  return SHELLS.has(p) || SCRIPT_LANGS.test(p) || INTERPRETER_EXTRA.has(p);
}
function isShellLike(p) {
  return SHELLS.has(p) || p === "pwsh" || p === "powershell" || p === "cmd" || p === "iex" || p === "invoke-expression";
}
var isFetcher = (e) => FETCHERS.has(e.program);
function isDecoder(e) {
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
function isEnvDump(e) {
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
function readsStdin(e) {
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
      const a = args[k];
      if (a === "-") return true;
      if (/^-(c|e|m|p|r|E|x|S)$/.test(a) || a === "--eval" || a === "--print" || a === "-pe" || a === "-ne") return false;
      if (a.startsWith("-")) continue;
      return false;
    }
    return true;
  }
  return false;
}
function subKinds(text, depth = 0) {
  const kinds = /* @__PURE__ */ new Set();
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
function segmentSubKinds(seg) {
  const kinds = /* @__PURE__ */ new Set();
  for (const s of seg.subs) for (const k of subKinds(s.text)) kinds.add(k);
  return kinds;
}
function stdinExecFrom(pipe, pred, readerOk = () => true) {
  const effs = pipe.map(effectiveSegment);
  for (let j = 1; j < effs.length; j++) {
    if (!readsStdin(effs[j]) || !readerOk(effs[j])) continue;
    for (let k = 0; k < j; k++) if (pred(effs[k])) return true;
  }
  return false;
}
function stdinPayloads(pipe) {
  const out = [];
  const effs = pipe.map(effectiveSegment);
  for (let j = 0; j < effs.length; j++) {
    const e = effs[j];
    if (!isShellLike(e.program) || !readsStdin(e)) continue;
    if (e.heredoc) out.push(e.heredoc);
    for (const r of e.redirects) if (r.op === "<<<") out.push(r.target);
    for (let k = 0; k < j; k++) {
      const s = effs[k];
      if (s.program === "echo" || s.program === "printf") out.push(positional(s.args).join(" "));
      else if (s.program === "cat" && s.heredoc) out.push(s.heredoc);
    }
  }
  return out;
}
var cleanName = (p) => norm(p).replace(/^\.\//, "");
function downloadTargets(e, seg) {
  const out = [];
  const a = e.args;
  const urlBase = () => {
    const u = a.find((x) => /^[a-z]+:\/\//i.test(x));
    if (!u) return null;
    const last = u.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    return last && !/^[a-z]+:$/i.test(last) ? last : null;
  };
  if (e.program === "curl") {
    for (let k = 0; k < a.length; k++) {
      const x = a[k];
      if ((x === "-o" || x === "--output") && a[k + 1]) out.push(a[k + 1]);
      else if (/^-o./.test(x) && !x.startsWith("--")) out.push(x.slice(2));
      else if (x.startsWith("--output=")) out.push(x.slice(9));
      else if (x === "--remote-name" || /^-[A-Za-z]*O[A-Za-z]*$/.test(x) && !x.startsWith("--")) {
        const b = urlBase();
        if (b) out.push(b);
      }
    }
  } else if (e.program === "wget") {
    let any = false;
    for (let k = 0; k < a.length; k++) {
      const x = a[k];
      if ((x === "-O" || x === "--output-document") && a[k + 1]) {
        out.push(a[k + 1]);
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
      const n = psName(a[k]);
      if (n && n.length >= 2 && "outfile".startsWith(n) && a[k + 1]) out.push(a[k + 1]);
    }
  } else return out;
  for (const t of writeTargets(seg)) out.push(t);
  return out.map(cleanName).filter((x) => x && x !== "-" && !x.startsWith("/dev/"));
}
function downloadThenRun(parsed) {
  const downloaded = /* @__PURE__ */ new Set();
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
var DB_CLIENTS = /* @__PURE__ */ new Set(["psql", "pgcli", "mysql", "mycli", "mariadb", "sqlite3", "litecli", "sqlcmd", "mssql-cli", "mongosh", "mongo", "redis-cli", "valkey-cli", "duckdb", "clickhouse-client", "clickhouse", "cockroach", "usql", "isql", "sqlplus", "cqlsh", "bq", "snowsql"]);
var SQL_VERBS = /* @__PURE__ */ new Set(["delete", "drop", "truncate"]);
function dbText(ctx) {
  const e = ctx.seg;
  if (SQL_VERBS.has(e.program) && e.args.length > 0) return e.raw;
  if (!DB_CLIENTS.has(e.program)) return null;
  const parts = [e.args.join(" ")];
  if (e.heredoc) parts.push(e.heredoc);
  for (const r of e.redirects) if (r.op === "<<<") parts.push(r.target);
  for (let k = 0; k < ctx.index; k++) {
    const s = effectiveSegment(ctx.pipeline[k]);
    if (s.program === "echo" || s.program === "printf") parts.push(positional(s.args).join(" "));
    else if (s.program === "cat" && s.heredoc) parts.push(s.heredoc);
  }
  return parts.join("\n");
}
var SQL_DROP = /\bdrop\s+(database|schema|table|keyspace)\b/i;
var SQL_TRUNCATE = /\btruncate\s+(table\s+)?[\w"`[\]]/i;
function sqlDeleteWithoutWhere(text) {
  for (const stmt of text.split(";")) {
    if (/\bdelete\s+from\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) return true;
  }
  return false;
}
var rules = [];
function rule(id, title, severity, reason, test, scope = "segment") {
  rules.push({ id, title, severity, reason, scope, test });
}
var PS_RM = /* @__PURE__ */ new Set(["remove-item", "ri", "rmdir", "rd", "del", "erase"]);
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
  }
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
    if (["-exec", "-execdir", "-ok", "-okdir"].includes(seg.args[k])) {
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
    const x = a[k];
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
  return seg.args.some((a) => /^-r/i.test(a) && psName(a) !== null && "recurse".startsWith(psName(a)));
});
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
  if (!g || g.sub !== "restore" && g.sub !== "checkout") return false;
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
  return /D/.test(f) || (/d/.test(f) || hasLong(g.rest, "delete")) && (/f/.test(f) || hasLong(g.rest, "force"));
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
  if (g.sub === "gc" || g.sub === "prune") return g.rest.some((a) => /^--prune=(now|all)$/.test(a)) || g.sub === "prune" && g.rest.some((a) => /^--expire(=|$)/.test(a));
  if (g.sub === "update-ref") return g.rest.includes("-d") || g.rest.includes("--delete");
  return false;
});
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
    if (mode === void 0) return false;
    if (/^0?777$/.test(mode)) return true;
    if (/^[2467][0-7]{3}$/.test(mode)) return true;
    if (/^0{3,4}$/.test(mode) && /[rR]/.test(f)) return true;
    if (/[rR]/.test(f) && /^0?[0-7]{3}$/.test(mode) && targets.some(isDangerousRmTarget)) return true;
    for (const clause of mode.split(",")) {
      const m = /^([ugoa]*)([+=-])([rwxXst]*)$/.exec(clause);
      if (!m) continue;
      const who = m[1];
      const op = m[2];
      const perms = m[3];
      if (op === "-") continue;
      if (/s/.test(perms) && (who === "" || /[ug]/.test(who) || who === "a")) return true;
      if (/w/.test(perms) && (who === "a" || who === "ugo" || who === "o" || /o/.test(who))) return true;
    }
    return false;
  }
  if (p === "chown" || p === "chgrp") {
    if (!/[rR]/.test(f) && !hasLong(seg.args, "recursive")) return false;
    return positional(seg.args).slice(1).some((t) => norm(t).startsWith("/") || t.startsWith("~") || t.startsWith("$") || t.startsWith("..") || t === "*");
  }
  return false;
});
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
rule(
  "remote-pipe-exec",
  "Remote Script Piped to Interpreter",
  "high",
  "Downloads untrusted content and feeds it straight into a shell or interpreter (`curl ... | sh`, `bash <(curl ...)`, download-then-run).",
  (ctx) => stdinExecFrom(ctx.pipeline, isFetcher, (e) => e.program !== "iex" && e.program !== "invoke-expression"),
  "pipeline"
);
rule(
  "remote-pipe-exec",
  "Remote Script Piped to Interpreter",
  "high",
  'Downloads untrusted content and feeds it straight into a shell or interpreter (`bash <(curl ...)`, `sh -c "$(curl ...)"`).',
  (ctx) => isInterpreter(effectiveSegment(ctx.seg).program) && segmentSubKinds(ctx.seg).has("fetch")
);
rule(
  "decode-pipe-exec",
  "Decoded Payload Executed",
  "high",
  "Decodes an obfuscated payload and executes it (`base64 -d | sh`).",
  (ctx) => stdinExecFrom(ctx.pipeline, isDecoder),
  "pipeline"
);
rule(
  "decode-pipe-exec",
  "Decoded Payload Executed",
  "high",
  'Decodes an obfuscated payload and executes it (`sh -c "$(echo ... | base64 -d)"`).',
  (ctx) => isInterpreter(effectiveSegment(ctx.seg).program) && segmentSubKinds(ctx.seg).has("decode")
);
rule(
  "download-then-run",
  "Downloaded File Executed",
  "high",
  "Downloads a file and then executes it in the same command.",
  ({ parsed }) => downloadThenRun(parsed),
  "command"
);
rule("ps-web-exec", "PowerShell Remote Web Execution", "high", "Executes unverified remote web script directly in PowerShell (`irm ... | iex`).", (ctx) => stdinExecFrom(ctx.pipeline, (e) => ["iwr", "irm", "invoke-webrequest", "invoke-restmethod", "curl", "wget"].includes(e.program)), "pipeline");
var READ_ALL = /* @__PURE__ */ new Set(["cat", "bat", "batcat", "less", "more", "most", "head", "tail", "nl", "tac", "od", "xxd", "hexdump", "strings", "base64", "get-content", "gc", "type", "tar", "zip", "7z", "7za", "grep", "egrep", "fgrep", "rg", "ag", "ack", "cp", "mv", "install"]);
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
      if (!NET_SENDERS.has(effs[j].program)) continue;
      for (let k = 0; k < j; k++) if (isEnvDump(effs[k])) return true;
    }
    return false;
  },
  "pipeline"
);
rule(
  "env-exfil",
  "Environment Exfiltration",
  "high",
  'Sends the process environment (secrets) to a network tool (`curl -d "$(printenv)"`).',
  (ctx) => NET_SENDERS.has(effectiveSegment(ctx.seg).program) && segmentSubKinds(ctx.seg).has("env")
);
rule("reverse-shell", "Reverse Shell", "critical", "Opens an interactive shell over the network (`nc -e`, `/dev/tcp/`, `socat ... exec:`).", ({ seg }) => {
  const p = seg.program;
  if (["nc", "ncat", "netcat"].includes(p)) {
    if (/[ec]/.test(shortFlags(seg.args)) || hasLong(seg.args, "exec") || hasLong(seg.args, "sh-exec") || hasLong(seg.args, "lua-exec")) return true;
  }
  if (p === "socat" && seg.args.some((a) => /(^|[:,])(exec|system):/i.test(a))) return true;
  return seg.redirects.some((r) => /^\/dev\/(tcp|udp)\//.test(r.target));
});
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
  if (["iptables", "ip6tables", "ebtables", "arptables"].includes(p)) return a.some((x) => x === "-f" || x === "--flush" || x === "-x" || x === "--delete-chain") || a.includes("-p") && a.includes("accept");
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
function dockerWords(seg) {
  if (!["docker", "podman", "nerdctl", "docker-compose", "podman-compose"].includes(seg.program)) return null;
  const a = seg.args;
  const out = [];
  for (let k = 0; k < a.length; k++) {
    const x = a[k];
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
    const x = a[k];
    let val = null;
    if (x === "-v" || x === "--volume") val = a[k + 1] ?? null;
    else if (x.startsWith("--volume=")) val = x.slice(9);
    else if (/^-v./.test(x) && !x.startsWith("--")) val = x.slice(2);
    if (val !== null && /^\/(:|$)/.test(val)) return true;
    let mount = null;
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
    return pos.includes("delete") || pos.includes("destroy") || p === "gsutil" && pos[0] === "rm" && /[rR]/.test(shortFlags(seg.args));
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
  if (p === "yarn") return pos[0] === "publish" || pos[0] === "npm" && (pos[1] === "publish" || pos[1] === "unpublish");
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
rule("win-encoded-command", "PowerShell Encoded Command", "high", "Runs an opaque base64-encoded PowerShell payload (`powershell -enc`).", ({ seg }) => {
  if (seg.program !== "powershell" && seg.program !== "pwsh") return false;
  return seg.args.some((a) => {
    const n = psName(a);
    return n !== null && n.length >= 1 && /^e/.test(n) && ("encodedcommand".startsWith(n) || "encodedarguments".startsWith(n));
  });
});
rule("win-exec-policy", "Execution Policy Change", "moderate", "Weakens the PowerShell script execution policy (`Set-ExecutionPolicy`).", ({ seg }) => seg.program === "set-executionpolicy");
rule("win-registry-delete", "Registry Key Deletion", "high", "Deletes Windows registry keys or values (`reg delete`).", ({ seg }) => seg.program === "reg" && (seg.args[0] ?? "").toLowerCase() === "delete");
var RULES = rules;
var SKELETON_RULES = [
  {
    id: "sys-fork-bomb",
    title: "Fork Bomb",
    severity: "critical",
    reason: "Defines a self-replicating shell function (`:(){ :|:& };:`) that exhausts the machine.",
    pattern: /([A-Za-z_:][\w:-]*)\s*\(\s*\)\s*\{[^}]*\b\1\b[^}]*\|[^}]*\b\1\b[^}]*&|:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&/
  },
  {
    id: "ps-web-exec",
    title: "PowerShell Remote Web Execution",
    severity: "high",
    reason: "Executes unverified remote web script directly in PowerShell (`iex (New-Object Net.WebClient).DownloadString(...)`).",
    pattern: /\b(iex|invoke-expression)\b[\s\S]*\b(new-object|irm|invoke-restmethod|iwr|invoke-webrequest|downloadstring|downloadfile)\b/i
  },
  {
    id: "decode-pipe-exec",
    title: "Decoded Payload Executed",
    severity: "high",
    reason: "Decodes an obfuscated payload and executes it (`iex ([Convert]::FromBase64String(...))`).",
    pattern: /\b(iex|invoke-expression)\b[\s\S]*\bfrombase64string\b/i
  },
  {
    id: "reverse-shell",
    title: "Reverse Shell",
    severity: "critical",
    reason: "Opens an interactive shell over the network (PowerShell `Net.Sockets.TCPClient`).",
    pattern: /\bnet\.sockets\.tcpclient\b/i
  }
];

// src/engine/analyze.ts
var RANK = { critical: 3, high: 2, moderate: 1 };
var DEPTH_FINDING = {
  id: "wrapper-depth",
  title: "Deeply Nested Command Wrappers",
  severity: "high",
  reason: "Command is wrapped more than 8 levels deep (`sudo env nohup ... bash -c ...`) and cannot be inspected safely."
};
function runRules(ctx, hits) {
  for (const r of RULES) {
    if (r.scope === "pipeline" && ctx.index !== 0) continue;
    if (r.scope === "command") continue;
    let matched = false;
    try {
      matched = r.test(ctx);
    } catch {
      matched = false;
    }
    if (matched) {
      const matchedSegment = r.scope === "pipeline" ? ctx.pipeline.map((s) => s.raw).join(" | ") : ctx.seg.raw;
      hits.push({ id: r.id, title: r.title, severity: r.severity, reason: r.reason, matchedSegment });
    }
  }
}
function runCommandRules(parsed, hits) {
  const first = parsed.segments[0];
  if (!first) return;
  const ctx = { seg: first, pipeline: [first], index: 0, parsed };
  for (const r of RULES) {
    if (r.scope !== "command") continue;
    let matched = false;
    try {
      matched = r.test(ctx);
    } catch {
      matched = false;
    }
    if (matched) hits.push({ id: r.id, title: r.title, severity: r.severity, reason: r.reason, matchedSegment: parsed.src.trim() });
  }
}
function inlineInterpreterScript(seg) {
  const p = seg.program;
  const a = seg.args;
  if (p === "python" || p === "python3") {
    const k = a.findIndex((x) => x === "-c");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  if (p === "node" || p === "nodejs") {
    const k = a.findIndex((x) => x === "-e" || x === "--eval");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  if (p === "ruby" || p === "perl") {
    const k = a.findIndex((x) => x === "-e");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  if (p === "php") {
    const k = a.findIndex((x) => x === "-r");
    return k >= 0 ? a[k + 1] ?? null : null;
  }
  return null;
}
function checkSegment(seg, pipeline, index, parsed, depth, hits) {
  if (depth > MAX_UNWRAP_DEPTH) {
    hits.push({ ...DEPTH_FINDING, matchedSegment: seg.raw });
    return;
  }
  runRules({ seg, pipeline, index, parsed }, hits);
  const script = inlineInterpreterScript(seg);
  if (script) {
    const l = legacyScan(script);
    if (l) hits.push({ id: l.rule.id, title: l.rule.title, severity: l.rule.severity, reason: l.rule.reason, matchedSegment: l.segment });
  }
  for (const sub of seg.subs) walk(sub.text, depth + 1, hits);
  for (const u of unwrap(seg)) {
    if (u.kind === "text") {
      walk(u.text, depth + 1, hits);
    } else {
      const inner = segmentFromWords(u.words, seg);
      if (inner) checkSegment(inner, [inner], 0, parsed, depth + 1, hits);
    }
  }
}
function walk(text, depth, hits) {
  if (depth > MAX_UNWRAP_DEPTH) {
    hits.push({ ...DEPTH_FINDING, matchedSegment: text.trim().slice(0, 200) });
    return;
  }
  if (!text.trim()) return;
  const parsed = parseCommand(text);
  if (!parsed.ok) {
    const l = legacyScan(text);
    if (l) hits.push({ id: l.rule.id, title: l.rule.title, severity: l.rule.severity, reason: l.rule.reason, matchedSegment: l.segment });
    return;
  }
  for (const r of SKELETON_RULES) {
    if (r.pattern.test(parsed.skeleton)) hits.push({ id: r.id, title: r.title, severity: r.severity, reason: r.reason, matchedSegment: text.trim() });
  }
  runCommandRules(parsed, hits);
  for (const pipe of parsed.pipelines) {
    pipe.segments.forEach((seg, idx) => checkSegment(seg, pipe.segments, idx, parsed, depth, hits));
    for (const payload of stdinPayloads(pipe.segments)) walk(payload, depth + 1, hits);
  }
}
function analyzeCommand(command) {
  const hits = [];
  walk(command, 0, hits);
  let best = null;
  for (const h of hits) if (!best || RANK[h.severity] > RANK[best.severity]) best = h;
  return best;
}

// src/engine/judge.ts
var JEV_THRESHOLDS = { riskConfirm: 1.5, approvalConfirm: 0.75, riskHigh: 2.5 };
function decideFromJev(answers, t = JEV_THRESHOLDS) {
  const risk = typeof answers?.risk === "number" && Number.isFinite(answers.risk) ? answers.risk : void 0;
  const approval = typeof answers?.approval === "number" && Number.isFinite(answers.approval) ? answers.approval : void 0;
  const confirm = risk !== void 0 && risk >= t.riskConfirm || approval !== void 0 && approval >= t.approvalConfirm;
  const stats = [risk !== void 0 ? `risk ${risk.toFixed(1)}/3` : null, approval !== void 0 ? `approval p=${approval.toFixed(2)}` : null].filter(Boolean).join(", ");
  return {
    confirm,
    severity: risk !== void 0 && risk >= t.riskHigh ? "high" : "moderate",
    risk,
    approval,
    reason: confirm ? `Jev flagged this command as risky (${stats}). No built-in rule matched it.` : `Jev: ok (${stats || "no answer"})`
  };
}
var REDACTED = "[REDACTED]";
var REDACTIONS = [
  // URL credentials: scheme://user:pass@host and scheme://token@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]*@/gi, `$1${REDACTED}@`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+@/gi, `$1${REDACTED}@`],
  // Authorization headers / bearer tokens
  [/\b(authorization\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s'"]+/gi, `$1${REDACTED}`],
  [/\b((?:x-api-key|x-auth-token|cookie|set-cookie|proxy-authorization)\s*[:=]\s*)[^\s'"]+/gi, `$1${REDACTED}`],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  // curl -u / --user user:pass
  [/(-u\s+|--user(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, `$1${REDACTED}`],
  // password flags: mysql -pPASS, sshpass -p PASS, docker login -p PASS
  [/\b(mysql\s+.*?-p)[^\s"']+/gi, `$1${REDACTED}`],
  [/\b(sshpass\s+-p\s+)\S+/gi, `$1${REDACTED}`],
  [/\b(docker\s+login\s+.*?(?:-p|--password)(?:=|\s+))\S+/gi, `$1${REDACTED}`],
  // aws credentials assignments: aws_secret_access_key value
  [/\b(aws_secret_access_key|aws_access_key_id)\s*[:= ]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, `$1=${REDACTED}`],
  // URL query params: ?api_key=abc&token=xyz (preserves quotes and trailing chars)
  [/([?&](?:api[_-]?key|token|access[_-]?token|secret|password)=)[^&\s"']+/gi, `$1${REDACTED}`],
  // well-known secret shapes
  [/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, REDACTED],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{35}/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, REDACTED],
  // secret-looking flags: --password=x, --token x
  [/(--?(?:password|passwd|pass|token|secret|api-?key|access-?key|auth)(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, `$1${REDACTED}`],
  // KEY=value assignments where the name looks secret
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH)[A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/gi, `$1=${REDACTED}`]
];
function redactSecrets(command) {
  let out = command;
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}
var READ_ONLY_PROGRAMS = /* @__PURE__ */ new Set([
  "ls",
  "dir",
  "pwd",
  "cd",
  "echo",
  "printf",
  "cat",
  "head",
  "tail",
  "wc",
  "cut",
  "tr",
  "diff",
  "cmp",
  "stat",
  "file",
  "which",
  "where",
  "whoami",
  "uname",
  "hostname",
  "tree",
  "du",
  "df",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "true",
  "false",
  "test",
  "[",
  "sleep",
  "jq",
  "less",
  "more",
  "nl",
  "tac",
  "id",
  "uptime",
  "ps",
  "type",
  "pushd",
  "popd",
  "wait",
  "exit"
]);
var GIT_READ_ONLY = /* @__PURE__ */ new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "blame", "describe", "shortlog", "ls-tree", "cat-file", "rev-list", "grep"]);
var PKG_MANAGERS = /* @__PURE__ */ new Set(["npm", "pnpm", "yarn", "bun"]);
var PKG_READ_ONLY = /* @__PURE__ */ new Set(["test", "t", "ls", "list", "view", "outdated", "why", "-v", "--version"]);
var PKG_RUN_ALLOWED = /^(test|lint|typecheck|type-check|check)(:[\w:-]+)?$/;
var VERSION_ONLY = /* @__PURE__ */ new Set(["node", "python", "python3", "tsc", "npm", "pnpm", "yarn", "go", "cargo", "rustc", "java", "ruby", "php", "bun", "deno", "git"]);
function segmentAllowed(seg) {
  if (!seg.program) return seg.assignments.length === 0 && seg.subs.length === 0 && seg.redirects.length === 0;
  for (const r of seg.redirects) {
    if (r.op === "<" || r.op === "<<" || r.op === "<<-" || r.op === "<<<") continue;
    if (/^(>&|<&)$/.test(r.op) && /^(\d+-?|-)$/.test(r.target)) continue;
    if (r.target === "/dev/null") continue;
    return false;
  }
  const p = seg.program;
  const a = seg.args;
  if (a.length === 1 && (a[0] === "--version" || a[0] === "-v" || a[0] === "-V") && VERSION_ONLY.has(p)) return true;
  if (p === "git") {
    let k = 0;
    while (k < a.length && a[k].startsWith("-")) k += a[k] === "-C" || a[k] === "-c" ? 2 : 1;
    const sub = a[k];
    if (!sub) return false;
    if (GIT_READ_ONLY.has(sub)) {
      if (sub === "diff" && a.some((x) => x.startsWith("--output"))) return false;
      return true;
    }
    if (sub === "branch") return a.slice(k + 1).every((x) => ["-a", "-r", "-v", "-vv", "--list", "--show-current", "--all"].includes(x));
    if (sub === "remote") return a.slice(k + 1).every((x) => x === "-v");
    return false;
  }
  if (p === "rg" || p === "grep" || p === "egrep" || p === "fgrep" || p === "ag" || p === "fd") {
    return !a.some((x) => x === "--pre" || x.startsWith("--pre="));
  }
  if (PKG_MANAGERS.has(p)) {
    const sub = a[0];
    if (!sub) return false;
    if (PKG_READ_ONLY.has(sub)) return true;
    if (sub === "run" || sub === "run-script") return PKG_RUN_ALLOWED.test(a[1] ?? "");
    return false;
  }
  if (p === "tsc") return a.includes("--noEmit");
  if (p === "vitest" || p === "jest" || p === "eslint") return true;
  if (p === "prettier") return a.includes("--check");
  if (p === "find") return !a.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(x));
  return READ_ONLY_PROGRAMS.has(p);
}
function isReadOnlyAllowlisted(command) {
  const parsed = parseCommand(command);
  if (!parsed.ok || parsed.segments.length === 0) return false;
  for (const seg of parsed.segments) {
    if (!segmentAllowed(seg)) return false;
    for (const sub of seg.subs) if (!isReadOnlyAllowlisted(sub.text)) return false;
  }
  return true;
}
function shouldJudge(command, dangerous) {
  if (dangerous) return false;
  if (!command.trim()) return false;
  return !isReadOnlyAllowlisted(command);
}

// src/jev.ts
var DEFAULT_JEV_BASE_URL = "https://api.typesafe.ai";
var JEV_TIMEOUT_MS = 1500;
var JEV_MODEL = "jev-latest";
function systemOneUrl(base) {
  let u;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  const host = u.hostname;
  const local = host === "localhost" || host === "[::1]" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  u.search = "";
  u.hash = "";
  return u.href.replace(/\/+$/, "") + "/v1/systemone";
}
function readJevConfig(env = process.env) {
  const base = { enabled: false, model: env.JEV_MODEL || JEV_MODEL, timeoutMs: JEV_TIMEOUT_MS };
  if (!/^(1|true|yes|on)$/i.test(env.JEV_GUARD_ENABLED ?? "")) return { ...base, inactiveReason: "JEV_GUARD_ENABLED not set" };
  if (env.JEV_BASE_URL) {
    const url2 = systemOneUrl(env.JEV_BASE_URL);
    if (!url2) return { ...base, inactiveReason: "JEV_BASE_URL must be https (or http on localhost/private address)" };
    return { ...base, enabled: true, url: url2, ...env.JEV_BASE_API_KEY ? { apiKey: env.JEV_BASE_API_KEY } : {} };
  }
  if (!env.JEV_API_KEY) return { ...base, inactiveReason: "JEV_API_KEY not set" };
  const url = systemOneUrl(DEFAULT_JEV_BASE_URL);
  return { ...base, enabled: true, url, apiKey: env.JEV_API_KEY };
}
var JEV_QUESTIONS = {
  risk: {
    type: "score",
    instructions: "How much harm could this tool call do if it turned out to be a mistake? Judge the exact command and arguments, not the tool's name.",
    criteria: [
      "Read-only or fully reversible inside the workspace: reading or listing files, searching, running tests or builds, git status/diff/log, fetching a web page.",
      "Changes the workspace in a way that is easy to undo: editing or creating project files, git add/commit/branch/stash, installing project dependencies, running local scripts.",
      "Hard to undo or reaches outside the workspace: deleting files or directories, git push, reset --hard, rebase or force-push, editing dotfiles or global config, installing system packages, HTTP requests with side effects, sending messages or email, running scripts fetched from the internet.",
      "Destructive or irreversible: recursive deletes of important paths, disk, partition or filesystem operations, piping a download into a shell, exposing or exfiltrating secrets and credentials, production deploys, dropping or migrating shared databases, payments, chmod/chown -R on system paths, killing arbitrary processes, sudo or privilege escalation."
    ]
  },
  approval: {
    type: "noul",
    instructions: "Would a careful senior engineer want the human to explicitly approve this exact tool call before it runs, judging from the call and the conversation context?",
    criteria: {
      true: "Yes: the call has consequences the human should confirm first.",
      false: "No: routine and safe to run unattended."
    }
  }
};
function buildRequestBody(command, model) {
  const state = { agent: "hive", tool: "bash", input: { command: redactSecrets(command) } };
  return JSON.stringify({ state, model, questions: JEV_QUESTIONS });
}
function parseAnswers(body) {
  const answers = body?.answers;
  if (!answers || typeof answers !== "object") return null;
  const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  const risk = num(answers.risk?.score);
  const approval = num(answers.approval?.noul) ?? num(answers.approval?.probability);
  if (risk === void 0 && approval === void 0) return null;
  return { risk, approval };
}
async function askJev(command, opts = {}) {
  const log = opts.log ?? (() => {
  });
  let cfg;
  try {
    cfg = readJevConfig(opts.env ?? process.env);
  } catch {
    return null;
  }
  if (!cfg.enabled || !cfg.url) return null;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    log("bash-guard: Jev skipped (no fetch available)");
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const aborted = new Promise((_, reject) => ctrl.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
  const run = async () => {
    const res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {} },
      body: buildRequestBody(command, cfg.model),
      signal: ctrl.signal
    });
    if (!res.ok) {
      log(`bash-guard: Jev HTTP ${res.status}; allowing (fail-open)`);
      return null;
    }
    const answers = parseAnswers(await res.json());
    if (!answers) log("bash-guard: Jev returned no usable answers; allowing (fail-open)");
    return answers;
  };
  try {
    return await Promise.race([run(), aborted]);
  } catch (err) {
    const timedOut = ctrl.signal.aborted;
    log(`bash-guard: Jev ${timedOut ? "timed out" : `error (${err?.message ?? "unknown"})`}; allowing (fail-open)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// src/extension/hook.ts
function bashGuard(pi) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return void 0;
    const command = event.input?.command ?? "";
    if (!command.trim()) return void 0;
    let flag = null;
    const hit = analyzeCommand(command);
    if (hit) {
      flag = { severity: hit.severity, ruleId: hit.id, ruleTitle: hit.title, reason: hit.reason, matchedSegment: hit.matchedSegment };
    } else if (readJevConfig().enabled && shouldJudge(command, false)) {
      const answers = await askJev(command, { log: (m) => console.error(m) });
      const verdict = decideFromJev(answers);
      if (verdict.confirm) {
        flag = { severity: verdict.severity, ruleId: "jev-judge", ruleTitle: "Flagged by Jev risk assessment", reason: verdict.reason, matchedSegment: command };
      }
    }
    if (!flag) return void 0;
    const payload = JSON.stringify({
      kind: "dangerous_bash_approval",
      command,
      severity: flag.severity,
      ruleId: flag.ruleId,
      ruleTitle: flag.ruleTitle,
      reason: flag.reason,
      matchedSegment: flag.matchedSegment
    });
    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Destructive bash command blocked automatically in headless mode: ${flag.reason} (${command})`
      };
    }
    const title = `⚠️ Dangerous Bash Command: ${flag.ruleTitle}`;
    const confirmed = await ctx.ui.confirm(title, payload);
    if (!confirmed) {
      return {
        block: true,
        reason: `Command execution blocked by user: ${flag.reason}`
      };
    }
    return void 0;
  });
}
export {
  bashGuard as default
};
