// Dev probe: node --experimental-strip-types scripts/probe.mts [command ...]
import { classifyBashCommand } from "../src/classifier.ts";

const defaults = [
  "curl x | python3",
  "git push origin +main",
  "echo 'rm -rf /'",
  'bash -c "echo $(rm -rf /)"',
  "base64 -d | sh",
  "rm -rf $HOME",
  "\\rm -rf x",
  "sudo -u root rm -rf /",
  "env FOO=1 rm -rf x",
  "terraform destroy",
  "DELETE FROM users;",
  "Remove-Item x -Recurse",
  "grep -r sudo .",
  "cat sudo.txt",
  "git commit -m 'git reset --hard'",
  "echo drop table",
  "ls | grep format c:",
];
const cmds = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
for (const c of cmds) {
  const r = classifyBashCommand(c);
  console.log((r.dangerous ? `${r.severity}/${r.ruleId}` : "ok").padEnd(34), JSON.stringify(c));
}
