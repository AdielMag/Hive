/**
 * Pi CLI Extension: Destructive Bash Command Guard
 *
 * Intercepts tool_call events for `bash`. If a command matches destructive patterns
 * (recursive deletion, git reset --hard, disk operations, elevated privileges, etc.),
 * it pauses execution and requests user approval.
 *
 * In Hive Studio: The approval is displayed as an inline card above the message composer.
 * In Pi CLI terminal: The approval is displayed as a curses/readline confirmation prompt.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface DangerRule {
  id: string;
  title: string;
  severity: "critical" | "high" | "moderate";
  reason: string;
  pattern: RegExp;
}

const RULES: readonly DangerRule[] = [
  // Filesystem Deletions
  {
    id: "fs-recursive-delete",
    title: "Recursive Directory Deletion",
    severity: "critical",
    reason: "Recursively removes directories and files (`rm -rf`) without confirmation.",
    pattern: /\brm\s+.*(-[a-zA-Z0-9]*r[a-zA-Z0-9]*f|-[a-zA-Z0-9]*f[a-zA-Z0-9]*r|--recursive|(-r\b.*-f\b|-f\b.*-r\b))/i,
  },
  {
    id: "fs-find-delete",
    title: "Find and Delete Operation",
    severity: "critical",
    reason: "Executes mass file deletion via find command (`find ... -delete` / `-exec rm`).",
    pattern: /\bfind\b.*(-delete|-exec\s+rm)/i,
  },
  {
    id: "fs-truncate-zero",
    title: "File Truncation",
    severity: "high",
    reason: "Instantly truncates file contents to zero bytes (`truncate -s 0`).",
    pattern: /\btruncate\s+(-s\s*0|--size(=|\s+)0)/i,
  },
  {
    id: "win-recurse-delete",
    title: "Windows Recursive Deletion",
    severity: "critical",
    reason: "Recursively deletes directory trees on Windows (`del /s` or `rmdir /s`).",
    pattern: /\b(del|erase)\s+.*(\/s|\-s)|\b(rmdir|rd)\s+.*(\/s|\-s)/i,
  },
  {
    id: "ps-recurse-delete",
    title: "PowerShell Recursive Removal",
    severity: "critical",
    reason: "Recursively forces deletion of items in PowerShell (`Remove-Item -Recurse -Force`).",
    pattern: /\b(Remove-Item|ri|rmdir)\b.*(-Recurse|-r\b).*(-Force|-f\b)|\b(Remove-Item|ri|rmdir)\b.*(-Force|-f\b).*(-Recurse|-r\b)/i,
  },

  // Destructive Git
  {
    id: "git-reset-hard",
    title: "Hard Git Reset",
    severity: "high",
    reason: "Discards all uncommitted changes and resets git working tree (`git reset --hard`).",
    pattern: /\bgit\s+.*reset\s+.*--hard/i,
  },
  {
    id: "git-clean-force",
    title: "Force Git Clean",
    severity: "high",
    reason: "Permanently deletes untracked files from the repository (`git clean -f`).",
    pattern: /\bgit\s+.*clean\s+.*-[a-zA-Z]*f/i,
  },
  {
    id: "git-push-force",
    title: "Force Git Push",
    severity: "high",
    reason: "Overwrites remote repository history (`git push --force`).",
    pattern: /\bgit\s+.*push\s+.*(--force|-f\b|--force-with-lease)/i,
  },
  {
    id: "git-restore-all",
    title: "Discard Working Tree Changes",
    severity: "high",
    reason: "Overwrites all modified files in the working directory (`git checkout .` or `git restore .`).",
    pattern: /\bgit\s+.*(restore\s+\.|checkout\s+(--\s+)?\.)/i,
  },
  {
    id: "git-branch-force-del",
    title: "Force Delete Git Branch",
    severity: "moderate",
    reason: "Force-deletes a git branch regardless of merge status (`git branch -D`).",
    pattern: /\bgit\s+.*branch\s+.*-D\b/i,
  },

  // Privilege & Permissions
  {
    id: "priv-escalation",
    title: "Elevated Privileges Execution",
    severity: "critical",
    reason: "Executes commands with superuser or administrative privileges (`sudo` or `su -`).",
    pattern: /\b(sudo|doas)\b|\bsu(\s+-|\s+root|\s*$)/i,
  },
  {
    id: "perm-wide-open",
    title: "Unrestricted File Permissions",
    severity: "critical",
    reason: "Grants unrestricted read/write/execute permissions to all users (`chmod 777`).",
    pattern: /\bchmod\b.*(-R\s+)?777|\bchown\b.*-R/i,
  },

  // Raw Disk
  {
    id: "disk-raw-format",
    title: "Raw Filesystem Format",
    severity: "critical",
    reason: "Formats or creates a raw filesystem (`mkfs` or Windows `format`).",
    pattern: /\bmkfs(\.[a-z0-9]+)?\b|\bformat\s+[a-zA-Z]:/i,
  },
  {
    id: "disk-raw-dd",
    title: "Direct Disk Write (dd)",
    severity: "critical",
    reason: "Writes raw blocks directly to a drive (`dd of=/dev/sd*`).",
    pattern: /\bdd\s+.*of=\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|loop[0-9]|hd[a-z])/i,
  },
  {
    id: "disk-redirect",
    title: "Block Device Redirection",
    severity: "critical",
    reason: "Redirects output directly into a raw storage block device.",
    pattern: />\s*\/dev\/(sd[a-z]|nvme[0-9]n[0-9]|vd[a-z]|hd[a-z])/i,
  },
  {
    id: "disk-partition",
    title: "Disk Partitioning Utility",
    severity: "critical",
    reason: "Invokes low-level disk partitioning utilities (`fdisk`, `parted`, `diskpart`).",
    pattern: /\b(fdisk|parted|sfdisk|diskpart)\b/i,
  },

  // Remote Pipes
  {
    id: "remote-pipe-exec",
    title: "Remote Script Piped to Shell",
    severity: "high",
    reason: "Downloads remote untrusted script and pipes directly into a shell interpreter.",
    pattern: /\b(curl|wget)\b.*\|\s*(ba)?sh/i,
  },
  {
    id: "ps-web-exec",
    title: "PowerShell Remote Web Execution",
    severity: "high",
    reason: "Executes unverified remote web script directly in PowerShell (`iex ...`).",
    pattern: /\b(iex|Invoke-Expression)\b.*(New-Object|irm|Invoke-RestMethod|DownloadString)|\b(irm|Invoke-RestMethod)\b.*\|\s*(iex|Invoke-Expression)\b/i,
  },

  // Database
  {
    id: "db-drop-table",
    title: "Database Drop or Truncate",
    severity: "critical",
    reason: "Drops or truncates database tables and schemas without rollback.",
    pattern: /\b(drop\s+(database|table)|truncate\s+table)\b/i,
  },

  // Mass Process Termination
  {
    id: "proc-mass-kill",
    title: "Mass Process Termination",
    severity: "moderate",
    reason: "Forcefully terminates all matching or system processes (`killall -9` or `kill -9 -1`).",
    pattern: /\b(killall\s+-9|kill\s+-9\s+-1|pkill\s+-9)\b/i,
  },
];

function splitSegments(cmd: string): string[] {
  const segments: string[] = [];
  const normalized = cmd.trim();
  if (!normalized) return [];

  const subshellRe = /\$\(([^)]+)\)|`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = subshellRe.exec(normalized)) !== null) {
    const sub = match[1] || match[2];
    if (sub && sub.trim()) segments.push(sub.trim());
  }

  const chainParts = normalized.split(/&&|\|\||;|\||&|\n/);
  for (const part of chainParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    segments.push(trimmed);
    const inner = trimmed.match(/(?:bash|sh|zsh|cmd\.exe|powershell|pwsh)\s+(?:-c|\/c|-Command)\s+["']([^"']+)["']/i);
    if (inner?.[1]) segments.push(inner[1].trim());
  }
  return segments;
}

function matchDanger(cmd: string): { dangerous: boolean; rule?: DangerRule; matchedSegment?: string } {
  const full = cmd.trim();
  if (!full) return { dangerous: false };

  const segments = splitSegments(full);
  for (const seg of segments) {
    for (const rule of RULES) {
      if (rule.pattern.test(seg)) {
        return { dangerous: true, rule, matchedSegment: seg };
      }
    }
  }

  for (const rule of RULES) {
    if (rule.pattern.test(full)) {
      return { dangerous: true, rule, matchedSegment: full };
    }
  }

  return { dangerous: false };
}

export default function bashGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = (event.input as { command?: string })?.command ?? "";
    const match = matchDanger(command);
    if (!match.dangerous || !match.rule) return undefined;

    const rule = match.rule;
    const payload = JSON.stringify({
      kind: "dangerous_bash_approval",
      command,
      severity: rule.severity,
      ruleId: rule.id,
      ruleTitle: rule.title,
      reason: rule.reason,
      matchedSegment: match.matchedSegment,
    });

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Destructive bash command blocked automatically in headless mode: ${rule.reason} (${command})`,
      };
    }

    const title = `⚠️ Dangerous Bash Command: ${rule.title}`;
    const confirmed = await ctx.ui.confirm(title, payload);

    if (!confirmed) {
      return {
        block: true,
        reason: `Command execution blocked by user: ${rule.reason}`,
      };
    }

    return undefined;
  });
}
