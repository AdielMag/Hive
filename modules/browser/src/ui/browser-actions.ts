/** Browser behaviors expressed against the module host (kept free of React so they are unit-testable). */
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { BROWSER_TAB_KIND, evaluateTabsForMemory, formatUrlOrSearch, type BrowserSettings } from "../shared.ts";

function titleFor(url: string): string {
  try {
    return new URL(url).hostname || "Browser";
  } catch {
    return "Browser";
  }
}

/** Open (or focus) a browser tab for `rawUrl`, honoring the search-engine setting. */
export function openBrowserUrl(host: ModuleHost, settings: BrowserSettings, rawUrl: string, title?: string): string {
  const url = formatUrlOrSearch(rawUrl || "https://pi.dev", settings.searchEngine);
  return host.tabs.open({
    kind: BROWSER_TAB_KIND,
    title: title || titleFor(url),
    url,
    reuse: (t) => t.url === url,
  });
}

/** Handler for clicked links: in-app browser, or the system browser when the user opted out. */
export function handleLink(host: ModuleHost, settings: BrowserSettings, url: string, title?: string): void {
  if (settings.openExternalInHive) openBrowserUrl(host, settings, url, title);
  else void host.openSystemBrowser(url);
}

/**
 * Apply the RAM-saver policy: wake the active tab, hibernate stale / excess background tabs.
 * `wakeActive: false` skips auto-wake — used when the active tab didn't change, so a tab the
 * user just put to sleep manually isn't immediately woken back up.
 */
export function runMemoryCheck(
  host: ModuleHost,
  settings: BrowserSettings,
  now = Date.now(),
  opts: { wakeActive?: boolean } = {},
): void {
  const active = host.tabs.active();
  const { tabsToSleep, tabsToWake } = evaluateTabsForMemory(host.tabs.list(), active?.id ?? null, settings, now);
  for (const id of tabsToSleep) host.tabs.update(id, { isSleeping: true });
  if (opts.wakeActive === false) return;
  for (const id of tabsToWake) host.tabs.update(id, { isSleeping: false, lastActiveAt: now });
}

/** Hibernate every background browser tab right now. */
export function hibernateBackground(host: ModuleHost): number {
  const activeId = host.tabs.active()?.id;
  let n = 0;
  for (const t of host.tabs.list()) {
    if (t.kind === BROWSER_TAB_KIND && t.id !== activeId && !t.isSleeping) {
      host.tabs.update(t.id, { isSleeping: true });
      n++;
    }
  }
  return n;
}
