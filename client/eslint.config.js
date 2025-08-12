// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const reactCompilerPlugin = require("eslint-plugin-react-compiler");
const importPlugin = require("eslint-plugin-import");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    plugins: {
      "react-compiler": reactCompilerPlugin,
    },
    extends: [importPlugin.flatConfigs.recommended],
    settings: {
      "import/resolver": {
        node: true,
        typescript: true,
      },
    },
    rules: {
      "react-compiler/react-compiler": "error",
    },
  },
]);
