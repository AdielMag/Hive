/**
 * Renderer half: the compaction hint above the composer and the Settings → Jev page. Advice arrives from the
 * Pi extension as `jev_advice` bridge events; stream events tell us when it goes stale.
 */
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { isJevAdvice, MODULE_ID } from "./shared.ts";
import { JevAdviceBar } from "./ui/JevAdviceBar.tsx";
import { JevSettings } from "./ui/JevSettings.tsx";
import { jevStore } from "./ui/jev-store.ts";

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    slots: {
      "composer.above": [JevAdviceBar as never],
      "settings.accounts": [JevSettings as never],
    },
    commands: [
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
    const offBridge = host.sessions.onBridgeEvent(({ key, data }) => {
      if (isJevAdvice(data)) jevStore.setAdvice(key, data);
    });
    const offEvents = host.sessions.onEvent(({ key, event }) => {
      // A new run or a finished compaction makes the stored advice describe a conversation that no longer exists.
      if (event.type === "agent_start" || event.type === "compaction_end") jevStore.clearAdvice(key);
    });
    return () => {
      offBridge();
      offEvents();
      jevStore.reset();
    };
  },
});
