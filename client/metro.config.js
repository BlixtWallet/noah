const path = require("path");
const { withNativeWind } = require("nativewind/metro");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getSentryExpoConfig(__dirname);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.extraNodeModules = {
  "~": projectRoot,
};

// Prevent "Nitro linked twice" error in monorepo by excluding duplicate copies
config.resolver.blockList = [/node_modules\/.*\/node_modules\/react-native-nitro-modules\/.*/];

module.exports = withNativeWind(config, { input: "./global.css" });
