module.exports = {
  testEnvironment: "node",
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "utils/**/*.js",
    "!utils/**/*.test.js",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: [
    "**/__tests__/**/*.test.js",
  ],
  testTimeout: 30000, // 30 second timeout
  verbose: true,
};

