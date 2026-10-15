// typescript-eslint "recommended" (syntax-only, no type info: fast) + React hooks.
// TypeScript already enforces unused locals/params (tsconfig noUnused*), so that rule stays off here.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/out/**", "**/release/**", "**/*.generated.ts", "spikes/**"] },
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "modules/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      // Best-effort cleanup (`try { rm } catch {}`) is idiomatic here; empty non-catch blocks still error.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Ambient `.d.ts` shims (culori) are wired with path references.
      "@typescript-eslint/triple-slash-reference": ["error", { path: "always", types: "prefer-import", lib: "always" }],
      // Ratchet: ~200 legacy `any`s remain (tracked in docs/planning/production-hardening.md). Warn until burned down.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
