const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  automock: false,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/components/(.*)$": "<rootDir>/components/$1",
    "^@/pages/(.*)$": "<rootDir>/pages/$1",
  },
  testEnvironment: "jest-environment-jsdom",
};

module.exports = async () => {
  const jestConfig = await createJestConfig(customJestConfig)();
  // Lingui 6 is ESM-only; Jest must transform it rather than skipping node_modules.
  jestConfig.transformIgnorePatterns = [
    "/node_modules/(?!(\\.pnpm|@lingui|@messageformat)/)",
    "^.+\\.module\\.(css|sass|scss)$",
  ];
  return jestConfig;
};
