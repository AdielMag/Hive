import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const electronExe = resolve(__dirname, "../../node_modules/electron/dist/electron.exe");
const appPath = resolve(__dirname, "out/main/index.js");

console.log("Starting Electron smoke test...");
console.log("Exe:", electronExe);
console.log("App:", appPath);

const p = spawn(electronExe, [appPath], {
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
    PI_STUDIO_TEST_MODE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
let stdout = "";
p.stdout?.on("data", (d) => (stdout += d));
p.stderr?.on("data", (d) => (stderr += d));

setTimeout(() => {
  console.log("App ran for 3 seconds without crashing. Terminating cleanly...");
  p.kill();
  process.exit(0);
}, 3000);

p.on("exit", (code) => {
  if (code !== null && code !== 0) {
    console.error("Electron exited unexpectedly with code:", code);
    console.error("Stderr:", stderr);
    console.error("Stdout:", stdout);
    process.exit(1);
  }
});
