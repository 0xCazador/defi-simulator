import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import jestPlugin from "eslint-plugin-jest";
import testingLibrary from "eslint-plugin-testing-library";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "react/react-in-jsx-scope": "off",
      // Referencing components/helpers declared later in the same module is
      // idiomatic React; TypeScript still errors on genuine TDZ issues.
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Pre-existing architecture: hooks/useAaveData and pages/api/aave
      // intentionally share types/helpers in both directions.
      "import/no-cycle": "off",
      // Mutating properties of a passed-in object (e.g. a shared retry budget
      // or a reduce accumulator) is allowed; reassigning the parameter is not.
      "no-param-reassign": ["error", { props: false }],
      // Bitmask parsing (Aave E-Mode collateral bitmaps) is intentional.
      "no-bitwise": "off",
      // Sequential awaits are deliberate throughout (rate-limited RPC fetches).
      "no-await-in-loop": "off",
      "no-plusplus": ["error", { allowForLoopAfterthoughts: true }],
      "no-console": "warn",
      "jsx-a11y/anchor-is-valid": "off",
      "jsx-a11y/anchor-has-content": "off",
      // React 19 / eslint-plugin-react-hooks v7 compiler rules are new and
      // flag long-standing patterns (sync setState in effects, function
      // declarations after useEffect). Not a dependency-upgrade rewrite.
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react/display-name": "off",
    },
  },
  {
    files: ["**/?(*.)+(spec|test).[jt]s?(x)"],
    plugins: {
      jest: jestPlugin,
      "testing-library": testingLibrary,
    },
    rules: {
      ...jestPlugin.configs["flat/recommended"].rules,
      ...testingLibrary.configs["flat/react"].rules,
      // Pre-existing test style: several suites assert multiple conditions
      // in one waitFor and use guarded expects for optional shapes.
      "testing-library/no-wait-for-multiple-assertions": "off",
      "jest/no-conditional-expect": "off",
      "testing-library/no-container": "off",
      "testing-library/no-node-access": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "src/locales/**",
    "next-env.d.ts",
    "scripts/**",
    "**/*.js",
    "**/*.cjs",
  ]),
]);
