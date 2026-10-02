import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/theme.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/settings.css";
import "./styles/sidebar.css";
import "./styles/question-form.css";
import "./styles/transcript.css";
import "./components/code/code.css";
import "./features/appearance/appearance.css";
import "./features/insights/insights.css";
import { initAppearance } from "./features/appearance/appearance-store.ts";
import { App } from "./App.tsx";

// Paint the persisted theme before React's first render (no flash of default colours).
initAppearance();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
