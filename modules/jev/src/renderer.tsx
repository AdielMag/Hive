/**
 * Renderer half: the compaction hint above the composer, the ask_jev transcript card and the Settings → Jev page. Advice arrives from the
 * Pi extension as `jev_advice` bridge events; stream events tell us when it goes stale.
 */
import { Gauge } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { INSIGHTS_TAB_ID, INSIGHTS_TAB_KIND, isJevAdvice, JevMethods, MODULE_ID } from "./shared.ts";
import { JevInsights } from "./ui/JevInsights.tsx";
import { JevAdviceBar } from "./ui/JevAdviceBar.tsx";
import { JevSettings } from "./ui/JevSettings.tsx";
import { JevToolCard } from "./ui/JevToolCard.tsx";
import { jevStore } from "./ui/jev-store.ts";

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    slots: {
      "composer.above": [JevAdviceBar as never],
      "settings.accounts": [JevSettings as never],
    },
    // ask_jev rows in the transcript: answer chips, In | Out | Raw.
    toolCards: [{ id: "ask-jev", match: ({ name }) => name === "ask_jev", component: JevToolCard }],
    // Insights dashboard: a Jev-owned tab, opened from Settings → Jev or the command palette.
    tabKinds: [{ kind: INSIGHTS_TAB_KIND, title: () => "Jev insights", icon: ({ size }) => <Gauge size={size} />, component: JevInsights }],
    commands: [
      {
        id: "jev.insights",
        title: "Open Jev insights",
        category: "View",
        keywords: "jev insights analytics savings ask_jev compaction hints",
        run: (host) => {
          host.tabs.open({ id: INSIGHTS_TAB_ID, kind: INSIGHTS_TAB_KIND, title: "Jev insights", reuse: (t) => t.kind === INSIGHTS_TAB_KIND });
        },
      },
      {
        id: "settings.jev",
        title: "Settings: Jev",
        category: "App",
        keywords: "jev typesafe compaction compact api key ask_jev",
        run: (host) => host.settings.open("accounts", { providerId: "jev" }),
      },
    ],
  },
  activate(host) {
    // Hint funnel -> events.jsonl in main (fire and forget: telemetry must never surface errors).
    jevStore.setEventSink((event) => void host.ipc.invoke(JevMethods.logEvent, event).catch(() => {}));
    const offBridge = host.sessions.onBridgeEvent(({ key, data }) => {
      if (isJevAdvice(data)) jevStore.setAdvice(key, data);
    });
    const offEvents = host.sessions.onEvent(({ key, event }) => {
      // Log first: a finished compaction is either acting on a shown hint or a manual compaction.
      if (event.type === "compaction_end") jevStore.compactionEnded(key, event);
      // A new run or a finished compaction makes the stored advice describe a conversation that no longer exists.
      if (event.type === "agent_start" || event.type === "compaction_end") jevStore.clearAdvice(key);
    });
    return () => {
      offBridge();
      offEvents();
      jevStore.reset();
      jevStore.setEventSink(null);
    };
  },
});
