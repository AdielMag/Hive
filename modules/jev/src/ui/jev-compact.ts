import type { ModuleHost } from "@hive/module-sdk/renderer";
import { JEV_COMPACT_KIND } from "../shared.ts";
import { jevStore } from "./jev-store.ts";

/** If Pi never reports the compaction ending, stop waiting / showing the spinner. */
export const JEV_COMPACTING_TIMEOUT_MS = 120_000;
/** The extension ignores the request when it has no live context; if Pi doesn't start compacting by then, don't keep the prompt waiting. */
const START_TIMEOUT_MS = 8_000;

/**
 * Ask the session's Jev extension to compact and show the busy state. Resolves once the compaction is over
 * (Pi's `compaction_end` clears the advice, or the timeout fires); rejects if the request couldn't be sent.
 */
export function requestJevCompact(host: ModuleHost, key: string): Promise<void> {
  jevStore.requestCompact(key);
  return new Promise<void>((resolve, reject) => {
    let done = false;
    let started = false;
    let off = () => {};
    let offEvents = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (err?: unknown) => {
      if (done) return;
      done = true;
      off();
      offEvents();
      if (timer) clearTimeout(timer);
      if (startTimer) clearTimeout(startTimer);
      if (err) {
        jevStore.stopCompacting(key);
        reject(err);
      } else {
        if (!started) jevStore.stopCompacting(key);
        resolve();
      }
    };
    off = jevStore.subscribe(() => {
      if (!(key in jevStore.get().compacting)) finish();
    });
    offEvents = host.sessions.onEvent(({ key: k, event }) => {
      if (k !== key || event.type !== "compaction_start") return;
      started = true;
      if (startTimer) clearTimeout(startTimer);
    });
    startTimer = setTimeout(() => {
      if (!started) finish();
    }, START_TIMEOUT_MS);
    timer = setTimeout(() => finish(), JEV_COMPACTING_TIMEOUT_MS);
    host.sessions.emitToBridge(key, { kind: JEV_COMPACT_KIND }).catch((err: unknown) => finish(err ?? new Error("Compaction request failed")));
  });
}
