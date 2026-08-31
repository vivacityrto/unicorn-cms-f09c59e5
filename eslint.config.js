import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Nested git worktrees are routinely checked out inside this repo for
    // hotfix/review sessions (see AGENTS.md -> "Local dev server
    // troubleshooting"). Without this, ESLint re-lints every worktree's full
    // checkout too, inflating counts and wasting time on content that isn't
    // this branch.
    ignores: ["dist", ".worktrees/**", "worktrees/**", ".claude/worktrees/**"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // P0.4 bounded pilot (docs/kb/reference/codebase-optimization-plan-2026-08-28.md):
    // unused-var checking is off repo-wide; these two directories tested at
    // zero violations (after removing one genuinely-dead destructure), so
    // they're a safe place to prove the rule doesn't regress before
    // considering wider adoption.
    files: ["src/services/**/*.{ts,tsx}", "src/contexts/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
);
