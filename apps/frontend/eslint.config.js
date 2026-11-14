import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";

const transportImports = [
  "firebase",
  "firebase/**",
  "@firebase/**",
  "axios",
  "axios/**",
  "ky",
  "got",
  "superagent",
  "undici",
  "graphql-request",
  "node:http",
  "node:https",
  "http",
  "https",
  "http:*",
  "https:*",
];
const serviceImports = [
  "**/services/**",
  "!**/services/contracts",
  "!**/services/contracts.ts",
];
const importRule = (patterns) => [
  "error",
  {
    patterns: [
      {
        group: patterns,
        message:
          "Use injected services; concrete adapters belong in app/composition.ts.",
      },
    ],
  },
];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "react-refresh": refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/**"],
    rules: {
      "no-restricted-imports": importRule([
        ...transportImports,
        ...serviceImports,
      ]),
      "no-restricted-globals": [
        "error",
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name=/^(fetch|XMLHttpRequest|WebSocket|EventSource)$/]",
          message: "Transport belongs inside service adapters.",
        },
        {
          selector:
            "MemberExpression[computed=true][property.value=/^(fetch|XMLHttpRequest|WebSocket|EventSource)$/]",
          message: "Transport belongs inside service adapters.",
        },
        {
          selector: "ImportExpression",
          message: "Resolve adapters at the static composition boundary.",
        },
        {
          selector: "CallExpression[callee.name='require']",
          message: "Use static imports through the service boundary.",
        },
      ],
    },
  },
  {
    files: ["src/app/composition.ts"],
    rules: { "no-restricted-imports": importRule(transportImports) },
  },
);
