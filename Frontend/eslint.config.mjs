import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/page.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='fetch']", message: "Components must call a typed service instead of fetch()." },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/app/api/**", "openai", "firebase-admin", "replicate"], message: "Server and provider modules cannot enter the UI bundle." }] },
      ],
    },
  },
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/app/api/**", "openai", "firebase-admin"], message: "Client services may only use HTTP contracts." }] }],
    },
  },
  globalIgnores([".next/**", ".next-e2e/**", "dev/**", "coverage/**", "playwright-report/**", "test-results/**", "artifacts/**"]),
]);
