// @ts-check

const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const expoConfig = require("eslint-config-expo/flat");
const reactCompilerPlugin = require("eslint-plugin-react-compiler");
const importPlugin = require("eslint-plugin-import");

module.exports = tseslint.config(
  {
    ignores: ["dist/*", "node_modules/*", "**/*.js", "ios/*", "android/*"],
  },
  ...expoConfig,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-compiler": reactCompilerPlugin,
    },
    rules: {
      "react-compiler/react-compiler": "error",
      "no-return-await": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
    settings: {
      "import/resolver": {
        node: true,
        typescript: true,
      },
    },
  },
);
