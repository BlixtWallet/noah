const { withInfoPlist, withXcodeProject, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MAINNET_BUNDLE_ID = "com.noahwallet.mainnet";
const APP_SCHEME_PLACEHOLDER = "$(APP_SCHEME)";
const PRODUCT_NAME_PLACEHOLDER = "$(PRODUCT_NAME)";
const TARGET_NAME_PLACEHOLDER = '"$(TARGET_NAME)"';
const ICON_NAME = "noah";

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
  infoPlist.CFBundleDisplayName = PRODUCT_NAME_PLACEHOLDER;
  infoPlist.CFBundleName = PRODUCT_NAME_PLACEHOLDER;
}

function sanitizeUrlSchemes(infoPlist, { iosScheme }) {
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

function fixAppIconName(project) {
  const section = project.pbxXCBuildConfigurationSection();
  for (const [, entry] of Object.entries(section)) {
    const buildSettings = getBuildSettings(entry);
    if (!buildSettings) continue;
    if (buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME !== undefined) {
      buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = ICON_NAME;
    }
  }
}

function addIconToAllTargets(project) {
  const iconFileName = `${ICON_NAME}.icon`;

  // Find the noah.icon PBXFileReference UUID
  const fileRefSection = project.pbxFileReferenceSection();
  let iconFileRefId = null;
  for (const [id, entry] of Object.entries(fileRefSection)) {
    if (typeof entry === "string") continue;
    if (!isRecord(entry)) continue;
    const name = stripQuotes(entry.name);
    if (name === iconFileName) {
      iconFileRefId = id;
      break;
    }
  }
  if (!iconFileRefId) return;

  // Collect existing PBXBuildFile UUIDs that reference noah.icon
  const buildFileSection = project.pbxBuildFileSection();
  const existingBuildFileIds = new Set();
  for (const [id, entry] of Object.entries(buildFileSection)) {
    if (typeof entry === "string") continue;
    if (isRecord(entry) && entry.fileRef === iconFileRefId) {
      existingBuildFileIds.add(id);
    }
  }

  // Find all Resources build phase IDs used by app targets
  const nativeTargets = project.pbxNativeTargetSection();
  const appResourcesPhaseIds = new Set();
  for (const [, target] of Object.entries(nativeTargets)) {
    if (typeof target === "string") continue;
    if (!isRecord(target)) continue;
    if (stripQuotes(target.productType) !== "com.apple.product-type.application") continue;
    for (const phase of target.buildPhases || []) {
      const phaseId = phase.value || phase;
      appResourcesPhaseIds.add(phaseId);
    }
  }

  // Add noah.icon to each app target's Resources phase that doesn't have it
  const resourcesSection = project.hash.project.objects["PBXResourcesBuildPhase"];
  if (!resourcesSection) return;

  for (const [phaseId, phase] of Object.entries(resourcesSection)) {
    if (typeof phase === "string") continue;
    if (!isRecord(phase)) continue;
    if (!appResourcesPhaseIds.has(phaseId)) continue;

    const files = phase.files || [];
    const alreadyHasIcon = files.some((f) => existingBuildFileIds.has(f.value || f));
    if (alreadyHasIcon) continue;

    const newId = project.generateUuid();
    buildFileSection[newId] = {
      isa: "PBXBuildFile",
      fileRef: iconFileRefId,
      fileRef_comment: iconFileName,
    };
    buildFileSection[`${newId}_comment`] = `${iconFileName} in Resources`;
    existingBuildFileIds.add(newId);

    phase.files.push({
      value: newId,
      comment: `${iconFileName} in Resources`,
    });
  }
}

function findSourceDir(iosDir) {
  for (const name of ["Noah", "noah"]) {
    const dir = path.join(iosDir, name);
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function ensureAppiconset(iosDir) {
  const sourceDir = findSourceDir(iosDir);
  if (!sourceDir) return;

  const assetCatalog = path.join(sourceDir, "Images.xcassets");
  if (!fs.existsSync(assetCatalog)) return;

  // Ensure root Contents.json
  const rootContents = path.join(assetCatalog, "Contents.json");
  if (!fs.existsSync(rootContents)) {
    fs.writeFileSync(
      rootContents,
      JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n",
    );
  }

  // Remove .icon from asset catalog if a previous plugin version put it there
  const staleIcon = path.join(assetCatalog, `${ICON_NAME}.icon`);
  if (fs.existsSync(staleIcon)) {
    fs.rmSync(staleIcon, { recursive: true });
  }

  // Rename AppIcon.appiconset → noah.appiconset so it matches ASSETCATALOG_COMPILER_APPICON_NAME
  const defaultAppiconset = path.join(assetCatalog, "AppIcon.appiconset");
  const targetAppiconset = path.join(assetCatalog, `${ICON_NAME}.appiconset`);

  if (fs.existsSync(defaultAppiconset) && !fs.existsSync(targetAppiconset)) {
    fs.renameSync(defaultAppiconset, targetAppiconset);
  }

  // Ensure the appiconset directory exists with a valid Contents.json
  if (!fs.existsSync(targetAppiconset)) {
    fs.mkdirSync(targetAppiconset, { recursive: true });
  }

  const contentsPath = path.join(targetAppiconset, "Contents.json");
  if (!fs.existsSync(contentsPath)) {
    fs.writeFileSync(
      contentsPath,
      JSON.stringify(
        {
          images: [{ idiom: "universal", platform: "ios", size: "1024x1024" }],
          info: { author: "xcode", version: 1 },
        },
        null,
        2,
      ) + "\n",
    );
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
    const project = modConfig.modResults;
    fixMainnetProductName(project, { appName });
    fixAppIconName(project);
    addIconToAllTargets(project);
    return modConfig;
  });

  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const iosDir = modConfig.modRequest.platformProjectRoot;
      ensureAppiconset(iosDir);
      return modConfig;
    },
  ]);

  return config;
}

module.exports = withNoahIosPrebuildFix;
