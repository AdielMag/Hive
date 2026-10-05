// Lint is intentionally narrow: only the Rules of Hooks, which TypeScript can't catch
// (a conditional hook crashes at runtime with React error #310).
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/out/**", "**/release/**", "**/*.generated.ts", "spikes/**"] },
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "modules/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
];
