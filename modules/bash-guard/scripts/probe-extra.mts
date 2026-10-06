import { classifyBashCommand } from "../src/classifier.ts";

const cmds = [
  'echo "$(rm -rf /)"',
  "git commit -m \"$(cat <<'EOF'\nit's fine; rm -rf /\nEOF\n)\"",
  "sudo   env A=1   nohup rm -rf /",
  "ls; rm -rf /tmp/x # comment",
  "echo a | tee /etc/hosts",
  "xargs -0 -n1 rm -rf",
  "find . -exec sh -c 'rm -rf {}' \\;",
  "python3 -c 'import shutil; shutil.rmtree(\"/\")'",
  "cat x | bash",
  "git status && git log | head",
  "bash -c 'echo hi' && rm -rf",
  "rm -rf",
  "ls -la ~/.ssh/",
  "echo foo | sh -c 'cat'",
  "docker run -it ubuntu bash",
  "npm run build && npm test",
];
for (const c of cmds) {
  const r = classifyBashCommand(c);
  console.log((r.dangerous ? `${r.severity}/${r.ruleId}` : "ok").padEnd(34), JSON.stringify(c));
}
