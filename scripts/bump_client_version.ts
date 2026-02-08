import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const appConfigPath = path.join(rootDir, "client", "app.config.ts");
const packageJsonPath = path.join(rootDir, "client", "package.json");

const appConfig = fs.readFileSync(appConfigPath, "utf8");
const packageJson = fs.readFileSync(packageJsonPath, "utf8");

const usage =
  "Usage: bun scripts/bump_client_version.ts [patch|minor|major|<x.y.z>]";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}

if (args.length > 1) {
  throw new Error(`Too many arguments.\n${usage}`);
}

const isSemver = (value: string) => /^\d+\.\d+\.\d+$/.test(value);

let mode: "patch" | "minor" | "major" = "patch";
let explicitVersion: string | null = null;

if (args.length > 0) {
  const first = args[0].toLowerCase();
  if (["patch", "minor", "major"].includes(first)) {
    mode = first as "patch" | "minor" | "major";
  } else if (isSemver(first)) {
    explicitVersion = first;
  } else {
    throw new Error(
      `Invalid argument "${args[0]}". Expected "patch", "minor", "major", or a version like 1.2.3.\n${usage}`
    );
  }
}

const packageVersionRegex = /^  "version"\s*:\s*"(\d+\.\d+\.\d+)"/m;
const appVersionRegex = /config\.expo\.version\s*=\s*"(\d+\.\d+\.\d+)";/;
const versionCodeRegex = /config\.expo\.android!\.versionCode\s*=\s*(\d+);/;
const buildNumberRegex = /config\.expo\.ios!\.buildNumber\s*=\s*"(\d+)";/;

const packageVersionMatch = packageJson.match(packageVersionRegex);
if (!packageVersionMatch) {
  throw new Error("Could not find a top-level version in client/package.json.");
}

const appVersionMatch = appConfig.match(appVersionRegex);
if (!appVersionMatch) {
  throw new Error("Could not find config.expo.version in client/app.config.ts.");
}

const packageVersion = packageVersionMatch[1];
const appVersion = appVersionMatch[1];

if (packageVersion !== appVersion) {
  throw new Error(
    `Version mismatch: package.json has ${packageVersion}, app.config.ts has ${appVersion}.`
  );
}

const bumpVersion = (version: string, bump: "patch" | "minor" | "major") => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  let [, major, minor, patch] = match.map(Number);

  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
};

const nextVersion = explicitVersion ?? bumpVersion(packageVersion, mode);

const versionCodeMatch = appConfig.match(versionCodeRegex);
if (!versionCodeMatch) {
  throw new Error("Could not find config.expo.android!.versionCode in client/app.config.ts.");
}

const buildNumberMatch = appConfig.match(buildNumberRegex);
if (!buildNumberMatch) {
  throw new Error("Could not find config.expo.ios!.buildNumber in client/app.config.ts.");
}

const nextVersionCode = Number(versionCodeMatch[1]) + 1;
const nextBuildNumber = Number(buildNumberMatch[1]) + 1;

const updatedAppConfig = appConfig
  .replace(appVersionRegex, `config.expo.version = "${nextVersion}";`)
  .replace(versionCodeRegex, `config.expo.android!.versionCode = ${nextVersionCode};`)
  .replace(buildNumberRegex, `config.expo.ios!.buildNumber = "${nextBuildNumber}";`);

const updatedPackageJson = packageJson.replace(
  packageVersionRegex,
  `  "version": "${nextVersion}"`
);

fs.writeFileSync(appConfigPath, updatedAppConfig, "utf8");
fs.writeFileSync(packageJsonPath, updatedPackageJson, "utf8");

console.log(
  `Bumped client version to ${nextVersion} (android versionCode ${nextVersionCode}, ios buildNumber ${nextBuildNumber}).`
);
