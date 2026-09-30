import { spawn, execSync } from "node:child_process";
const PI_CLI = "C:/Users/Adiel/AppData/Local/pi-node/current/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js";
const NODE = "C:/Users/Adiel/AppData/Local/pi-node/current/node.exe";
const t0 = Date.now();
const p = spawn(NODE, [PI_CLI, "--mode", "rpc", "--no-session"], { cwd: "C:/Users/Adiel/Blog", stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
let n = 0;
const other = [];
p.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    let line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) continue;
    const rec = JSON.parse(line);
    if (rec.type === "response" && pending.has(rec.id)) { pending.get(rec.id)(rec); pending.delete(rec.id); }
    else other.push(rec);
  }
});
let stderr = "";
p.stderr.on("data", (d) => (stderr += d));
const send = (cmd) => new Promise((res) => { const id = "r" + ++n; pending.set(id, res); p.stdin.write(JSON.stringify({ id, ...cmd }) + "\n"); });

const st = await send({ type: "get_state" });
const tReady = Date.now() - t0;
const models = await send({ type: "get_available_models" });
const cmds = await send({ type: "get_commands" });
const stats = await send({ type: "get_session_stats" });
const levels = await send({ type: "get_available_thinking_levels" });
const msgs = await send({ type: "get_messages" });
let mem = "?";
try { mem = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${p.pid}).WorkingSet64/1MB"`).toString().trim(); } catch (e) { mem = "err " + e.message; }
console.log("first get_state response ms:", tReady);
const m0 = st.data?.model;
console.log("state:", JSON.stringify({ ...st.data, model: m0 && { provider: m0.provider, id: m0.id, contextWindow: m0.contextWindow, input: m0.input } }));
const ms = models.data?.models || [];
const byProv = {};
for (const m of ms) byProv[m.provider] = (byProv[m.provider] || 0) + 1;
console.log("available models:", ms.length, JSON.stringify(byProv));
console.log("model object keys:", ms[0] && Object.keys(ms[0]).join(","));
console.log("sample:", JSON.stringify(ms.filter((m) => m.provider === "antigravity").slice(0, 2).map((m) => ({ id: m.id, name: m.name, reasoning: m.reasoning, input: m.input, contextWindow: m.contextWindow }))));
console.log("commands:", (cmds.data?.commands || []).length, (cmds.data?.commands || []).slice(0, 40).map((c) => c.source[0] + ":" + c.name).join(" "));
console.log("stats:", JSON.stringify(stats.data));
console.log("thinking levels:", JSON.stringify(levels.data));
console.log("messages:", JSON.stringify((msgs.data?.messages || []).map((m) => m.role)));
console.log("other records:", other.length, JSON.stringify(other.slice(0, 12).map((r) => r.type + (r.method ? ":" + r.method : "") + (r.statusKey ? ":" + r.statusKey : ""))));
console.log("working set MB:", mem);
console.log("stderr head:", stderr.slice(0, 400));
p.stdin.end();
await new Promise((r) => p.on("exit", r));
console.log("exit after stdin close ms:", Date.now() - t0);
