import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A real dependency tree sitting beside the symlinked `node_modules`.
    // ESLint's built-in ignore only knows the conventional name, so without
    // this it lints the whole of npm -- twelve thousand errors from other
    // people's code, and slow enough that the lint gate stops being run at
    // all. .gitignore already treats this directory as build output.
    // Scratch space: throwaway probes, and browser profiles left behind by
    // headless-Chrome UI tests. Linting a bundled Chrome extension is slow and
    // tells us nothing about this codebase.
    ".scratch/**",
  ]),
]);

export default eslintConfig;
