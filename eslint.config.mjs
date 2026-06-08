import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Flat config using eslint-config-next's native flat entries (compatible with
// ESLint 9/10). Avoids the @eslint/eslintrc FlatCompat path, which crashes
// under ESLint 10 with "Converting circular structure to JSON".
const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Pin the React version so eslint-plugin-react skips its version auto-detection
  // (that path uses APIs removed in ESLint 10 and otherwise throws).
  { settings: { react: { version: "19.2.0" } } },
  {
    rules: {
      // Experimental React-Compiler-era react-hooks rules (enabled by a recent
      // plugin bump) that flag the project's idiomatic fetch-on-mount effects.
      // rules-of-hooks and exhaustive-deps stay on.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
  },
];

export default eslintConfig;
