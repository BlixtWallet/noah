// @ts-check

const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactCompilerPlugin = require("eslint-plugin-react-compiler");
const importPlugin = require("eslint-plugin-import");

module.exports = tseslint.config(
  {
    ignores: ["dist/*", "node_modules/*", "**/*.js", "ios/*", "android/*"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "react-compiler": reactCompilerPlugin,
      import: importPlugin,
    },
    rules: {
      "react-compiler/react-compiler": "error",
      "no-console": ["error"],
      "no-return-await": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-unused-vars": "off", // Turn off base rule as it's handled by @typescript-eslint
    },
    settings: {
      "import/resolver": {
        node: true,
        typescript: true,
      },
    },
  },
);
