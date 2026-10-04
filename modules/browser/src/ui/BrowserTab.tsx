/**
 * Integrated Chromium Browser Tab View.
 * Provides web browsing inside Hive with strict RAM and background activity control.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  Home,
  Lock,
  Moon,
  RotateCw,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { ModuleTab } from "@hive/module-sdk/renderer";
import { formatUrlOrSearch, useBrowserStore } from "./browser-store.ts";
import { browserHost } from "./browser-host.ts";

export const BrowserTab: React.FC<{ tab: ModuleTab }> = ({ tab }) => {
  const currentUrl = tab.url || "https://pi.dev";
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webviewRef = useRef<any>(null);
  const host = browserHost();
  const updateBrowserTab = (id: string, patch: any) => host.tabs.update(id, patch);
  const setTabSleeping = (id: string, isSleeping: boolean) => host.tabs.update(id, { isSleeping });
  const settings = useBrowserStore((s) => s.settings);

  // Keep input in sync when tab URL changes externally
  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl]);

  // Attach event listeners to the webview guest element
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || tab.isSleeping) return;

    const handleStartLoading = () => {
      setIsLoading(true);
      setLoadError(null);
    };

    const handleStopLoading = () => {
      setIsLoading(false);
      try {
        setCanGoBack(webview.canGoBack?.() ?? false);
        setCanGoForward(webview.canGoForward?.() ?? false);
      } catch {
        // webview may be unmounting
      }
    };

    const handleDidNavigate = (e: any) => {
      if (e.url) {
        setUrlInput(e.url);
        updateBrowserTab(tab.id, { url: e.url });
      }
    };

    const handleDidNavigateInPage = (e: any) => {
      if (e.isMainFrame && e.url) {
        setUrlInput(e.url);
        updateBrowserTab(tab.id, { url: e.url });
      }
    };

    const handleTitleUpdated = (e: any) => {
      if (e.title) {
        updateBrowserTab(tab.id, { title: e.title });
      }
    };

    const handleFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        updateBrowserTab(tab.id, { favicon: e.favicons[0] });
      }
    };

    const handleFailLoad = (e: any) => {
      // Ignore ERR_ABORTED (-3) triggered by user clicking another link mid-load
      if (e.isMainFrame && e.errorCode !== -3) {
        setIsLoading(false);
        setLoadError(e.errorDescription || `Failed to load page (${e.errorCode})`);
      }
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage);
    webview.addEventListener("page-title-updated", handleTitleUpdated);
    webview.addEventListener("page-favicon-updated", handleFaviconUpdated);
    webview.addEventListener("did-fail-load", handleFailLoad);

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener("did-navigate-in-page", handleDidNavigateInPage);
      webview.removeEventListener("page-title-updated", handleTitleUpdated);
      webview.removeEventListener("page-favicon-updated", handleFaviconUpdated);
      webview.removeEventListener("did-fail-load", handleFailLoad);
    };
  }, [tab.id, tab.isSleeping, updateBrowserTab]);

  const handleNavigateSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const targetUrl = formatUrlOrSearch(urlInput, settings.searchEngine);
    updateBrowserTab(tab.id, { url: targetUrl });
    setUrlInput(targetUrl);
    setLoadError(null);

    if (tab.isSleeping) {
      setTabSleeping(tab.id, false);
      return;
    }

    if (webviewRef.current) {
      try {
        webviewRef.current.loadURL(targetUrl);
      } catch {
        // ignore
      }
    }
  };

  const handleGoBack = () => {
    if (webviewRef.current?.canGoBack?.()) {
      webviewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webviewRef.current?.canGoForward?.()) {
      webviewRef.current.goForward();
    }
  };

  const handleReloadOrStop = () => {
    if (isLoading) {
      webviewRef.current?.stop?.();
    } else {
      setLoadError(null);
      webviewRef.current?.reload?.();
    }
  };

  const handleGoHome = () => {
    const homeUrl = "https://pi.dev";
    setUrlInput(homeUrl);
    updateBrowserTab(tab.id, { url: homeUrl });
    if (tab.isSleeping) {
      setTabSleeping(tab.id, false);
    } else {
      webviewRef.current?.loadURL?.(homeUrl);
    }
  };

  const handleToggleSleep = () => {
    setTabSleeping(tab.id, !tab.isSleeping);
  };

  const handleWakeTab = () => {
    setTabSleeping(tab.id, false);
  };

  const handleCopyUrl = async () => {
    try {
      await host.clipboard.copy(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleOpenSystemBrowser = () => {
    void host.openExternal(currentUrl);
  };

  const isHttps = /^https:\/\//i.test(currentUrl);

  return (
    <div className="browser-view">
      {/* Navigation Toolbar */}
      <div className="browser-toolbar">
        <div className="browser-toolbar__nav">
          <button
            className="browser-btn"
            onClick={handleGoBack}
            disabled={!canGoBack || tab.isSleeping}
            title="Back (Alt+Left)"
            aria-label="Back"
          >
            <ArrowLeft size={15} />
          </button>
          <button
            className="browser-btn"
            onClick={handleGoForward}
            disabled={!canGoForward || tab.isSleeping}
            title="Forward (Alt+Right)"
            aria-label="Forward"
          >
            <ArrowRight size={15} />
          </button>
          <button
            className="browser-btn"
            onClick={handleReloadOrStop}
            title={isLoading ? "Stop loading" : "Reload page (Ctrl+R)"}
            aria-label={isLoading ? "Stop" : "Reload"}
          >
            {isLoading ? <X size={15} /> : <RotateCw size={14} />}
          </button>
          <button className="browser-btn" onClick={handleGoHome} title="Hive / Pi Home" aria-label="Home">
            <Home size={14} />
          </button>
        </div>

        {/* Omnibox Address Bar */}
        <form className="browser-omnibox" onSubmit={handleNavigateSubmit}>
          <span className={`browser-omnibox__lock${!isHttps ? " browser-omnibox__lock--insecure" : ""}`}>
            {isHttps ? <Lock size={12} /> : <ShieldAlert size={12} />}
          </span>
          <input
            className="browser-omnibox__input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Search or enter web address"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {tab.isSleeping ? (
            <span
              className="browser-ram-pill browser-ram-pill--sleeping"
              title="Tab is hibernated. Zero RAM used."
            >
              <Moon size={10} />
              Sleeping
            </span>
          ) : (
            <span
              className="browser-ram-pill"
              title="Tab is active in memory. Auto-sleeps after inactivity."
            >
              <span className="browser-ram-pill__dot" />
              Live
            </span>
          )}
        </form>

        {/* Toolbar Actions */}
        <div className="browser-toolbar__actions">
          <button
            className="browser-btn browser-btn--sleep"
            onClick={handleToggleSleep}
            title={tab.isSleeping ? "Wake tab up" : "Put tab to sleep to free RAM immediately"}
            aria-label="Toggle Sleep"
          >
            {tab.isSleeping ? <Zap size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="browser-btn"
            onClick={handleCopyUrl}
            title={copied ? "Copied!" : "Copy link address"}
            aria-label="Copy Link"
          >
            <Copy size={14} />
          </button>
          <button
            className="browser-btn"
            onClick={handleOpenSystemBrowser}
            title="Open in system default browser"
            aria-label="Open in external browser"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isLoading && (
        <div className="browser-progress">
          <div className="browser-progress__bar" />
        </div>
      )}

      {/* Viewport Content */}
      <div className="browser-viewport">
        {tab.isSleeping ? (
          <div className="browser-sleeping" onClick={handleWakeTab}>
            <div className="browser-sleeping__icon-wrapper">
              <Moon size={32} />
            </div>
            <div className="browser-sleeping__title">This tab is sleeping to save memory</div>
            <div className="browser-sleeping__url">{currentUrl}</div>
            <div className="browser-sleeping__desc">
              All Chromium background RAM and timers for this webpage were completely released to keep Hive fast and
              lightweight.
            </div>
            <div className="browser-sleeping__actions" onClick={(e) => e.stopPropagation()}>
              <button className="ui-btn ui-btn--primary" onClick={handleWakeTab}>
                <Sparkles size={14} style={{ marginRight: 6 }} />
                Wake Tab
              </button>
              <button className="ui-btn" onClick={handleOpenSystemBrowser}>
                <ExternalLink size={14} style={{ marginRight: 6 }} />
                Open in System Browser
              </button>
            </div>
          </div>
        ) : loadError ? (
          <div className="browser-error">
            <div className="browser-error__icon">
              <ShieldAlert size={28} />
            </div>
            <div className="browser-error__title">Failed to load webpage</div>
            <div className="browser-error__msg">{loadError}</div>
            <div className="browser-sleeping__actions">
              <button className="ui-btn ui-btn--primary" onClick={handleReloadOrStop}>
                Try Again
              </button>
              <button className="ui-btn" onClick={handleOpenSystemBrowser}>
                Open in System Browser
              </button>
            </div>
          </div>
        ) : (
          <webview
            ref={webviewRef}
            src={currentUrl}
            className="browser-webview"
            partition="persist:hive-browser"
            allowpopups={true}
          />
        )}
      </div>
    </div>
  );
};
