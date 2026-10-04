import { lazy } from "react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID } from "./shared.ts";

const ArcThemeEditor = lazy(() => import("./ui/ArcThemeEditor.tsx").then((m) => ({ default: m.ArcThemeEditor })));

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    slots: {
      "settings.appearance": [ArcThemeEditor],
    },
  },
});
