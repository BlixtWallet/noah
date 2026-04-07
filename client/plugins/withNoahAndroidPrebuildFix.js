const { withAppBuildGradle, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Expo prebuild tries to treat the mainnet app ID as the base Android package,
// which moves generated sources into com/noahwallet/mainnet and rewrites flavor
// application IDs. This plugin restores the repo's intended layout:
// - shared source package stays com.noahwallet
// - flavor IDs remain mainnet/signet/regtest
// - widget/provider files stay in the stable checked-in paths
const BASE_PACKAGE = "com.noahwallet";
const MAINNET_APPLICATION_ID = "com.noahwallet.mainnet";
const SIGNET_APPLICATION_ID = "com.noahwallet.signet";
const REGTEST_APPLICATION_ID = "com.noahwallet.regtest";

const SOURCE_FILES = [
  {
    name: "MainActivity.kt",
    targetSegments: ["com", "noahwallet", "MainActivity.kt"],
    replacements: [
      ["package com.noahwallet.mainnet", "package com.noahwallet"],
    ],
  },
  {
    name: "MainApplication.kt",
    targetSegments: ["com", "noahwallet", "MainApplication.kt"],
    replacements: [
      ["package com.noahwallet.mainnet", "package com.noahwallet"],
    ],
  },
  {
    name: "NoahWidgetProvider.kt",
    targetSegments: ["com", "noahwallet", "widgets", "NoahWidgetProvider.kt"],
    replacements: [
      ["package com.noahwallet.mainnet.widgets", "package com.noahwallet.widgets"],
      ["import com.noahwallet.mainnet.MainActivity", "import com.noahwallet.MainActivity"],
      ["import com.noahwallet.mainnet.R", "import com.noahwallet.R"],
    ],
  },
  {
    name: "NoahWidgetMainnetProvider.kt",
    targetSegments: ["com", "noahwallet", "widgets", "NoahWidgetMainnetProvider.kt"],
    replacements: [
      ["package com.noahwallet.mainnet.widgets", "package com.noahwallet.widgets"],
      ["import com.noahwallet.mainnet.R", "import com.noahwallet.R"],
    ],
  },
  {
    name: "NoahWidgetSignetProvider.kt",
    targetSegments: ["com", "noahwallet", "widgets", "NoahWidgetSignetProvider.kt"],
    replacements: [
      ["package com.noahwallet.mainnet.widgets", "package com.noahwallet.widgets"],
      ["import com.noahwallet.mainnet.R", "import com.noahwallet.R"],
    ],
  },
  {
    name: "NoahWidgetRegtestProvider.kt",
    targetSegments: ["com", "noahwallet", "widgets", "NoahWidgetRegtestProvider.kt"],
    replacements: [
      ["package com.noahwallet.mainnet.widgets", "package com.noahwallet.widgets"],
      ["import com.noahwallet.mainnet.R", "import com.noahwallet.R"],
    ],
  },
];

function rewriteBuildGradle(contents) {
  let updated = contents;

  updated = updated.replace(/namespace ['"][^'"]+['"]/, `namespace '${BASE_PACKAGE}'`);

  updated = updated.replace(
    /(defaultConfig\s*\{[\s\S]*?applicationId\s+)['"][^'"]+['"]/,
    `$1'${BASE_PACKAGE}'`
  );

  updated = updated.replace(
    /(signet\s*\{[\s\S]*?)(applicationIdSuffix\s+['"][^'"]+['"]|applicationId\s+['"][^'"]+['"])/,
    `$1applicationId '${SIGNET_APPLICATION_ID}'`
  );

  updated = updated.replace(
    /(regtest\s*\{[\s\S]*?)(applicationIdSuffix\s+['"][^'"]+['"]|applicationId\s+['"][^'"]+['"])/,
    `$1applicationId '${REGTEST_APPLICATION_ID}'`
  );

  updated = updated.replace(
    /(mainnet\s*\{[\s\S]*?applicationId\s+)['"][^'"]+['"]/,
    `$1'${MAINNET_APPLICATION_ID}'`
  );

  return updated;
}

function findFirstFile(rootDir, targetName) {
  if (!fs.existsSync(rootDir)) return null;

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === targetName) {
        return fullPath;
      }
    }
  }

  return null;
}

function rewriteSourceFileContents(contents, replacements) {
  return replacements.reduce(
    (currentContents, [searchValue, replaceValue]) =>
      currentContents.replaceAll(searchValue, replaceValue),
    contents
  );
}

function normalizeSourceTree(androidRoot) {
  const javaRoot = path.join(androidRoot, "app", "src", "main", "java");
  if (!fs.existsSync(javaRoot)) return;

  for (const file of SOURCE_FILES) {
    const sourcePath = findFirstFile(javaRoot, file.name);
    if (!sourcePath) continue;

    const targetPath = path.join(javaRoot, ...file.targetSegments);
    const targetDir = path.dirname(targetPath);
    fs.mkdirSync(targetDir, { recursive: true });

    const sourceContents = fs.readFileSync(sourcePath, "utf8");
    const rewrittenContents = rewriteSourceFileContents(sourceContents, file.replacements);
    fs.writeFileSync(targetPath, rewrittenContents, "utf8");

    if (sourcePath !== targetPath && fs.existsSync(sourcePath)) {
      fs.rmSync(sourcePath);
    }
  }

  const staleMainnetDir = path.join(javaRoot, "com", "noahwallet", "mainnet");
  if (fs.existsSync(staleMainnetDir)) {
    fs.rmSync(staleMainnetDir, { recursive: true, force: true });
  }
}

function withNoahAndroidPrebuildFix(config) {
  config = withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = rewriteBuildGradle(modConfig.modResults.contents);
    return modConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const androidRoot = modConfig.modRequest.platformProjectRoot;
      normalizeSourceTree(androidRoot);
      return modConfig;
    },
  ]);
}

module.exports = withNoahAndroidPrebuildFix;
