/**
 * External-link routing. Core calls `openLink(url)` for every clicked link; a module (e.g. the in-app browser)
 * may claim links via `host.links.setHandler`. With no handler the link opens in the system browser.
 */
export type LinkHandler = (url: string, title?: string) => void;

let handler: { owner: string; fn: LinkHandler } | null = null;

/** Claim link handling. Returns a disposer that releases it (only if still the owner). */
export function setLinkHandler(owner: string, fn: LinkHandler): () => void {
  const mine = { owner, fn };
  handler = mine;
  return () => {
    if (handler === mine) handler = null;
  };
}

export function openLink(url: string, title?: string): void {
  if (handler) {
    try {
      handler.fn(url, title);
      return;
    } catch (err) {
      console.error(`[modules] link handler of "${handler.owner}" failed`, err);
    }
  }
  void window.studio.openSystemBrowser(url);
}
