import { ipcMain } from "electron";

/** ipcMain.handle with a uniform error log; the rejection still propagates to the renderer. */
export function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...(args as A));
    } catch (err) {
      console.error(`[ipc] ${channel} failed:`, err instanceof Error ? err.message : err);
      throw err;
    }
  });
}
