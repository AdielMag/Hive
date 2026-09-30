import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const PI_CLI = "C:/Users/Adiel/AppData/Local/pi-node/current/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js";
const NODE = "C:/Users/Adiel/AppData/Local/pi-node/current/node.exe";
const PIPE = process.platform === "win32" ? `\\\\.\\pipe\\pi-studio-spike-${process.pid}` : `/tmp/pi-studio-spike-${process.pid}.sock`;

const bridgeMsgs = [];
const server = createServer((s) => {
  let b = "";
  s.on("data", (d) => { b += d; let i; while ((i = b.indexOf("\n")) >= 0) { bridgeMsgs.push(JSON.parse(b.slice(0, i))); b = b.slice(i + 1); } });
});
await new Promise((r) => server.listen(PIPE, r));

const t0 = Date.now();
const p = spawn(NODE, [PI_CLI, "--mode", "rpc", "--no-session", "-e", "./bridge.ts"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  env: { ...process.env, PI_STUDIO_BRIDGE: PIPE },
  stdio: ["pipe", "pipe", "pipe"],
});
let buf = ""; const pending = new Map(); let n = 0; const other = [];
p.stdout.on("data", (d) => { buf += d.toString("utf8"); let i; while ((i = buf.indexOf("\n")) >= 0) { let line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.endsWith("\r")) line = line.slice(0, -1); if (!line) continue; const rec = JSON.parse(line); if (rec.type === "response" && pending.has(rec.id)) { pending.get(rec.id)(rec); pending.delete(rec.id); } else other.push(rec); } });
let stderr = ""; p.stderr.on("data", (d) => (stderr += d));
const send = (cmd) => new Promise((res) => { const id = "r" + ++n; pending.set(id, res); p.stdin.write(JSON.stringify({ id, ...cmd }) + "\n"); });

await send({ type: "get_state" });
console.log("ready ms:", Date.now() - t0);
const cmds = await send({ type: "get_commands" });
console.log("bridge command registered:", (cmds.data?.commands || []).some((c) => c.name === "studio-ping"));
const r = await send({ type: "prompt", message: "/studio-ping hello-from-gui" });
console.log("prompt(/studio-ping) response:", JSON.stringify(r));
await new Promise((res) => setTimeout(res, 800));
console.log("bridge side-channel messages:", JSON.stringify(bridgeMsgs, null, 0));
console.log("rpc non-response records:", JSON.stringify(other.map((o) => o.type + (o.method ? ":" + o.method : "")).slice(0, 20)));
console.log("stderr:", stderr.slice(0, 500));
p.stdin.end();
await new Promise((res) => p.on("exit", res));
server.close();
