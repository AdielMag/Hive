import { spawn } from "node:child_process";

/**
 * Kill a process and everything it spawned (Pi runs bash/powershell tool processes as children).
 * Windows: `taskkill /T /F`. POSIX: the Pi process is spawned detached (own process group), so the
 * whole group gets SIGTERM, then SIGKILL after a grace period.
 */
export async function killProcessTree(pid: number, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pid, sig);
    } catch {
      try {
        process.kill(pid, sig);
      } catch {
        // already gone
      }
    }
  };
  signal("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  signal("SIGKILL");
}
