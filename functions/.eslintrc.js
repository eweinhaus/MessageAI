module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
    jest: true, // Add Jest globals
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "quotes": ["error", "double"],
    "max-len": ["error", {code: 80}],
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
};
