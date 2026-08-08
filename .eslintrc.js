module.exports = {
  extends: [
    'mantine',
    'plugin:@next/next/recommended',
    'plugin:jest/recommended',
    // Must be last: disables stylistic rules that conflict with Prettier.
    'prettier',
  ],
  plugins: ['testing-library', 'jest'],
  overrides: [
    {
      files: ['**/?(*.)+(spec|test).[jt]s?(x)'],
      extends: ['plugin:testing-library/react'],
      rules: {
        // Pre-existing test style: several suites assert multiple conditions
        // in one waitFor and use guarded expects for optional shapes.
        'testing-library/no-wait-for-multiple-assertions': 'off',
        'jest/no-conditional-expect': 'off',
      },
    },
  ],
  parserOptions: {
    project: './tsconfig.json',
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    // Referencing components/helpers declared later in the same module is
    // idiomatic React; TypeScript still errors on genuine TDZ issues.
    '@typescript-eslint/no-use-before-define': 'off',
    // Pre-existing architecture: hooks/useAaveData and pages/api/aave
    // intentionally share types/helpers in both directions.
    'import/no-cycle': 'off',
    // Mutating properties of a passed-in object (e.g. a shared retry budget
    // or a reduce accumulator) is allowed; reassigning the parameter is not.
    'no-param-reassign': ['error', { props: false }],
    // Bitmask parsing (Aave E-Mode collateral bitmaps) is intentional.
    'no-bitwise': 'off',
    // Sequential awaits are deliberate throughout (rate-limited RPC fetches).
    'no-await-in-loop': 'off',
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
  },
};
