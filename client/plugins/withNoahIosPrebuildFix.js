const { withInfoPlist, withXcodeProject } = require("@expo/config-plugins");

const MAINNET_BUNDLE_ID = "com.noahwallet.mainnet";
const APP_SCHEME_PLACEHOLDER = "$(APP_SCHEME)";
const PRODUCT_NAME_PLACEHOLDER = "$(PRODUCT_NAME)";
const TARGET_NAME_PLACEHOLDER = '"$(TARGET_NAME)"';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function stripQuotes(value) {
  if (typeof value !== "string") return value;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function getBuildSettings(configEntry) {
  if (!isRecord(configEntry)) return undefined;
  const buildSettings = configEntry.buildSettings;
  return isRecord(buildSettings) ? buildSettings : undefined;
}

function enforceDisplayNamePlaceholders(infoPlist) {
  // Keep display/name placeholders so Xcode build settings can vary per flavor.
  infoPlist.CFBundleDisplayName = PRODUCT_NAME_PLACEHOLDER;
  infoPlist.CFBundleName = PRODUCT_NAME_PLACEHOLDER;
}

function sanitizeUrlSchemes(infoPlist, { iosScheme }) {
  // Ensure URL schemes stay variant-driven via $(APP_SCHEME), while preserving extras.
  const existingUrlTypes = Array.isArray(infoPlist.CFBundleURLTypes)
    ? infoPlist.CFBundleURLTypes
    : [];
  const extraSchemes = new Set();
  for (const entry of existingUrlTypes) {
    if (!isRecord(entry)) continue;
    const schemes = entry.CFBundleURLSchemes;
    if (!Array.isArray(schemes)) continue;
    for (const scheme of schemes) {
      if (scheme === APP_SCHEME_PLACEHOLDER) continue;
      if (iosScheme && scheme === iosScheme) continue;
      if (scheme === MAINNET_BUNDLE_ID) continue;
      extraSchemes.add(scheme);
    }
  }
  const urlTypes = [
    {
      CFBundleURLSchemes: [APP_SCHEME_PLACEHOLDER],
    },
  ];
  if (extraSchemes.size > 0) {
    urlTypes.push({
      CFBundleURLSchemes: Array.from(extraSchemes),
    });
  }
  infoPlist.CFBundleURLTypes = urlTypes;
}

function fixMainnetProductName(project, { appName }) {
  // Undo Expo's hardcoded mainnet PRODUCT_NAME in the pbxproj.
  const section = project.pbxXCBuildConfigurationSection();
  for (const [, entry] of Object.entries(section)) {
    const buildSettings = getBuildSettings(entry);
    if (!buildSettings) continue;

    const bundleId = stripQuotes(buildSettings.PRODUCT_BUNDLE_IDENTIFIER);
    const productName = stripQuotes(buildSettings.PRODUCT_NAME);

    if (appName && bundleId === MAINNET_BUNDLE_ID && productName === appName) {
      buildSettings.PRODUCT_NAME = TARGET_NAME_PLACEHOLDER;
    }
  }
}

function withNoahIosPrebuildFix(config) {
  const appName = config.name;
  const iosScheme = config.ios?.scheme;

  config = withInfoPlist(config, (modConfig) => {
    const infoPlist = modConfig.modResults;
    enforceDisplayNamePlaceholders(infoPlist);
    sanitizeUrlSchemes(infoPlist, { iosScheme });
    return modConfig;
  });

  config = withXcodeProject(config, (modConfig) => {
    fixMainnetProductName(modConfig.modResults, { appName });
    return modConfig;
  });

  return config;
}

module.exports = withNoahIosPrebuildFix;
