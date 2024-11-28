import globals from "globals";
import pluginJs from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";

/** @type {import('eslint').Linter.Config[]} */
export default [
  pluginJs.configs.recommended,
  jsdoc.configs["flat/recommended"],
  {
    languageOptions: { globals: globals.node },
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/require-returns-description": "off",
      "jsdoc/valid-types": "error",
      "jsdoc/check-types": "error",
      "jsdoc/require-param-description": "off",
      "no-unused-vars": "off",
      "no-undef": "warn",
      "semi": [2, "always"],
      "quotes": [2, "double"]
    }
  },
];