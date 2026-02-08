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

function removeStandaloneIconFromPbxproj(project) {
  const iconFileName = `${ICON_NAME}.icon`;

  // Find the PBXFileReference UUID for the standalone noah.icon
  const fileRefSection = project.pbxFileReferenceSection();
  let iconFileRefId = null;
  for (const [id, entry] of Object.entries(fileRefSection)) {
    if (typeof entry === "string") continue;
    if (!isRecord(entry)) continue;
    const name = stripQuotes(entry.name);
    const entryPath = stripQuotes(entry.path);
    if (name === iconFileName || entryPath === iconFileName) {
      iconFileRefId = id;
      break;
    }
  }
  if (!iconFileRefId) return;

  // Remove PBXBuildFile entries that reference this file
  const buildFileSection = project.pbxBuildFileSection();
  const buildFileIdsToRemove = new Set();
  for (const [id, entry] of Object.entries(buildFileSection)) {
    if (typeof entry === "string") continue;
    if (isRecord(entry) && entry.fileRef === iconFileRefId) {
      buildFileIdsToRemove.add(id);
    }
  }
  for (const id of buildFileIdsToRemove) {
    delete buildFileSection[id];
    delete buildFileSection[`${id}_comment`];
  }

  // Remove from all PBXResourcesBuildPhase file lists
  const resourcesSection = project.hash.project.objects["PBXResourcesBuildPhase"];
  if (resourcesSection) {
    for (const [, phase] of Object.entries(resourcesSection)) {
      if (!isRecord(phase) || !Array.isArray(phase.files)) continue;
      phase.files = phase.files.filter((f) => {
        const fId = f.value || f;
        return !buildFileIdsToRemove.has(fId);
      });
    }
  }

  // Remove from PBXGroup children
  const groupSection = project.hash.project.objects["PBXGroup"];
  if (groupSection) {
    for (const [, group] of Object.entries(groupSection)) {
      if (!isRecord(group) || !Array.isArray(group.children)) continue;
      group.children = group.children.filter((child) => {
        const childId = child.value || child;
        return childId !== iconFileRefId;
      });
    }
  }

  // Remove the PBXFileReference itself
  delete fileRefSection[iconFileRefId];
  delete fileRefSection[`${iconFileRefId}_comment`];
}

function findSourceDir(iosDir) {
  for (const name of ["Noah", "noah"]) {
    const dir = path.join(iosDir, name);
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function moveIconIntoAssetCatalog(iosDir) {
  const sourceDir = findSourceDir(iosDir);
  if (!sourceDir) return;

  const standaloneIcon = path.join(sourceDir, `${ICON_NAME}.icon`);
  const assetCatalog = path.join(sourceDir, "Images.xcassets");
  const assetCatalogIcon = path.join(assetCatalog, `${ICON_NAME}.icon`);

  if (!fs.existsSync(standaloneIcon)) return;
  if (!fs.existsSync(assetCatalog)) return;

  // Ensure asset catalog has a root Contents.json
  const rootContents = path.join(assetCatalog, "Contents.json");
  if (!fs.existsSync(rootContents)) {
    fs.writeFileSync(
      rootContents,
      JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n",
    );
  }

  // Move .icon into asset catalog
  if (fs.existsSync(assetCatalogIcon)) {
    fs.rmSync(assetCatalogIcon, { recursive: true });
  }
  fs.cpSync(standaloneIcon, assetCatalogIcon, { recursive: true });
  fs.rmSync(standaloneIcon, { recursive: true });
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
    removeStandaloneIconFromPbxproj(project);
    return modConfig;
  });

  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const iosDir = modConfig.modRequest.platformProjectRoot;
      moveIconIntoAssetCatalog(iosDir);
      return modConfig;
    },
  ]);

  return config;
}

module.exports = withNoahIosPrebuildFix;
