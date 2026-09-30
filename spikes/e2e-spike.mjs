import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const PI_CLI = "C:/Users/Adiel/AppData/Local/pi-node/current/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js";
const NODE = "C:/Users/Adiel/AppData/Local/pi-node/current/node.exe";
const PIPE = process.platform === "win32" ? `\\\\.\\pipe\\pi-studio-e2e-${process.pid}` : `/tmp/pis-e2e-${process.pid}.sock`;
const bridgeMsgs = [];
const server = createServer((s) => { let b = ""; s.on("data", (d) => { b += d; let i; while ((i = b.indexOf("\n")) >= 0) { bridgeMsgs.push(JSON.parse(b.slice(0, i))); b = b.slice(i + 1); } }); });
await new Promise((r) => server.listen(PIPE, r));

const p = spawn(NODE, [PI_CLI, "--mode", "rpc", "--no-session", "-e", "./test-provider.ts", "-e", "./bridge.ts", "--model", "studio-test/scripted-1"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)), env: { ...process.env, PI_STUDIO_BRIDGE: PIPE }, stdio: ["pipe", "pipe", "pipe"],
});
let buf = ""; const pending = new Map(); let n = 0; const events = [];
let settled; const settledP = new Promise((r) => (settled = r));
p.stdout.on("data", (d) => { buf += d.toString("utf8"); let i; while ((i = buf.indexOf("\n")) >= 0) { let line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.endsWith("\r")) line = line.slice(0, -1); if (!line) continue; const rec = JSON.parse(line); if (rec.type === "response" && pending.has(rec.id)) { pending.get(rec.id)(rec); pending.delete(rec.id); } else { events.push(rec); if (rec.type === "agent_settled") settled(); } } });
let stderr = ""; p.stderr.on("data", (d) => (stderr += d));
const send = (cmd) => new Promise((res) => { const id = "r" + ++n; pending.set(id, res); p.stdin.write(JSON.stringify({ id, ...cmd }) + "\n"); });

const st = await send({ type: "get_state" });
console.log("model:", st.data?.model?.provider + "/" + st.data?.model?.id);
await send({ type: "prompt", message: "/studio-ping x" });
const afterCmd = await send({ type: "get_entries" });
console.log("entries after extension command (should be 0 message entries):", afterCmd.data?.entries?.filter((e) => e.type === "message").length);
const t0 = Date.now();
const pr = await send({ type: "prompt", message: "Hello, which sections do you see?" });
console.log("prompt accepted:", pr.success);
await Promise.race([settledP, new Promise((r) => setTimeout(r, 20000))]);
console.log("settled in ms:", Date.now() - t0);
const types = {}; for (const e of events) { const k = e.type === "message_update" ? "message_update:" + e.assistantMessageEvent?.type : e.type; types[k] = (types[k] || 0) + 1; }
console.log("event types:", JSON.stringify(types));
const msgs = (await send({ type: "get_messages" })).data.messages;
const sys = msgs.find((m) => m.role === "system");
console.log("persisted system sections:", sys ? Object.keys(sys.sections || {}).join(", ") : "none");
console.log("linked_projects section:", sys?.sections?.linked_projects);
const last = msgs.filter((m) => m.role === "assistant").pop();
console.log("assistant reply:", JSON.stringify(last?.content?.map((c) => c.type === "text" ? c.text : "[" + c.type + "]")));
const stats = await send({ type: "get_session_stats" });
console.log("stats.contextUsage:", JSON.stringify(stats.data.contextUsage), "tokens:", JSON.stringify(stats.data.tokens));
console.log("bridge msgs:", bridgeMsgs.map((m) => m.type).join(","));
console.log("stderr:", stderr.slice(0, 600));
p.stdin.end(); await new Promise((r) => p.on("exit", r)); server.close();
