const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const NITRO_ARK_VERSION = "v0.0.27";

// --- Configuration ---
const XC_FRAMEWORK_URL = `https://github.com/BlixtWallet/react-native-nitro-ark/releases/download/${NITRO_ARK_VERSION}/Ark.xcframework.zip`;
const JNI_LIBS_ZIP_URL = `https://github.com/BlixtWallet/react-native-nitro-ark/releases/download/${NITRO_ARK_VERSION}/jniLibs.zip`;

const projectRoot = process.cwd();
const nitroArkPath = path.resolve(projectRoot, "node_modules", "react-native-nitro-ark");
const tempDir = path.resolve(projectRoot, "temp_ark_downloads");

// iOS paths
const xcFrameworkZipPath = path.join(tempDir, "Ark.xcframework.zip");
const xcFrameworkDestPath = path.join(nitroArkPath, "Ark.xcframework");
const unzippedFrameworkContainer = path.join(tempDir, "target");
const unzippedFrameworkPath = path.join(unzippedFrameworkContainer, "Ark.xcframework");

// Android paths
const jniLibsZipPath = path.join(tempDir, "jniLibs.zip");
const jniLibsDestPath = path.resolve(nitroArkPath, "android", "src", "main", "jniLibs");
const unzippedJniLibsPath = path.join(tempDir, "jniLibs");

/**
 * Downloads a file from a URL to a destination path.
 * @param {string} url The URL to download from.
 * @param {string} dest The destination file path.
 * @returns {Promise<void>}
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`Redirected to ${response.headers.location}`);
          return download(response.headers.location, dest).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download '${url}' (status: ${response.statusCode})`));
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {}); // Clean up the file
        reject(err);
      });
  });
}

async function setupIos() {
  // --- iOS Setup ---
  console.log("\n--- Starting iOS Setup ---");
  if (fs.existsSync(xcFrameworkDestPath)) {
    console.log(`Removing existing framework at ${xcFrameworkDestPath}`);
    fs.rmSync(xcFrameworkDestPath, { recursive: true, force: true });
  }
  console.log(`Downloading iOS framework from ${XC_FRAMEWORK_URL}...`);
  await download(XC_FRAMEWORK_URL, xcFrameworkZipPath);
  console.log("iOS download complete.");
  console.log(`Unzipping ${path.basename(xcFrameworkZipPath)}...`);
  execSync(`unzip -o "${xcFrameworkZipPath}" -d "${tempDir}"`);
  console.log("iOS unzip complete.");
  if (!fs.existsSync(unzippedFrameworkPath)) {
    throw new Error(`Expected framework not found at ${unzippedFrameworkPath}`);
  }
  console.log(`Moving Ark.xcframework to ${nitroArkPath}`);
  fs.renameSync(unzippedFrameworkPath, xcFrameworkDestPath);
  console.log("--- iOS Setup Complete ---\n");
}

async function setupAndroid() {
  // --- Android Setup ---
  console.log("--- Starting Android Setup ---");
  if (fs.existsSync(jniLibsDestPath)) {
    console.log(`Removing existing jniLibs at ${jniLibsDestPath}`);
    fs.rmSync(jniLibsDestPath, { recursive: true, force: true });
  }
  console.log(`Downloading Android binaries from ${JNI_LIBS_ZIP_URL}...`);
  await download(JNI_LIBS_ZIP_URL, jniLibsZipPath);
  console.log("Android download complete.");
  console.log(`Unzipping ${path.basename(jniLibsZipPath)}...`);
  execSync(`unzip -o "${jniLibsZipPath}" -d "${tempDir}"`);
  console.log("Android unzip complete.");
  if (!fs.existsSync(unzippedJniLibsPath)) {
    throw new Error(`Expected jniLibs not found at ${unzippedJniLibsPath}`);
  }
  console.log(`Moving jniLibs to ${path.dirname(jniLibsDestPath)}`);
  fs.renameSync(unzippedJniLibsPath, jniLibsDestPath);
  console.log("--- Android Setup Complete ---\n");
}

/**
 * Main function to run the postinstall steps.
 */
async function main() {
  console.log("Running postinstall script for react-native-nitro-ark...");

  // Ensure node_modules/react-native-nitro-ark exists
  if (!fs.existsSync(nitroArkPath)) {
    console.log("react-native-nitro-ark not found in node_modules, skipping script.");
    return;
  }

  // Create a temporary directory for downloads
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    await Promise.all([setupIos(), setupAndroid()]);

    console.log("Postinstall script for react-native-nitro-ark finished successfully!");
  } catch (error) {
    console.error("An error occurred during the postinstall script:");
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      console.log(`Cleaning up temporary directory: ${tempDir}`);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main();
