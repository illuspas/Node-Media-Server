const eslint = require("eslint");
const globals = require("globals");
const pluginJs = require("@eslint/js");
const jsdoc = require("eslint-plugin-jsdoc");

/** @type {eslint.Linter.Config[]} */
module.exports = [
  pluginJs.configs.recommended,
  jsdoc.configs["flat/recommended"],
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  {
    languageOptions: { globals: globals.node },
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/valid-types": "error",
      "jsdoc/check-types": "error",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-param-description": "off",
      "no-unused-vars": "off",
      "no-undef": "error",
      "semi": [2, "always"],
      "quotes": [2, "double"],
      "indent": ["error", 2]
    }
  },
];