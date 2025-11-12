#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const { promisify } = require("util");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

/**
 * Derive encryption key from mnemonic using PBKDF2
 */
function deriveKey(mnemonic, salt) {
  return crypto.pbkdf2Sync(
    mnemonic,
    salt,
    600_000, // iterations
    32, // key length
    "sha256",
  );
}

/**
 * Decrypt Noah backup data
 */
function decryptBackup(encryptedData, mnemonic) {
  // Parse the encrypted data structure
  const version = encryptedData[0];
  if (version !== 1) {
    throw new Error(`Unsupported backup version: ${version}`);
  }

  const salt = encryptedData.slice(1, 17);
  const iv = encryptedData.slice(17, 29);
  const tag = encryptedData.slice(-16);
  const ciphertext = encryptedData.slice(29, -16);

  console.log(`Version: ${version}`);
  console.log(`Salt length: ${salt.length}`);
  console.log(`IV length: ${iv.length}`);
  console.log(`Ciphertext length: ${ciphertext.length}`);
  console.log(`Tag length: ${tag.length}`);

  console.log("Deriving key from mnemonic...");
  const key = deriveKey(mnemonic, salt);

  console.log("Decrypting backup...");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted;
}

/**
 * Unzip the backup file
 */
async function unzipBackup(zipPath, outputDir) {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputDir, true);
    console.log(`✓ Backup extracted to: ${outputDir}`);
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      console.log("\n⚠️  adm-zip not installed. Install it with:");
      console.log("  npm install adm-zip");
      console.log("\nOr manually unzip the file:");
      console.log(`  unzip ${zipPath} -d ${outputDir}`);
    } else {
      throw err;
    }
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Noah Backup Decryption Tool

Usage:
  node decrypt_backup.js <input_file> <output_file> "<mnemonic>" [--unzip]

Arguments:
  input_file   Path to encrypted backup file (base64 encoded)
  output_file  Path to output decrypted zip file
  mnemonic     12 or 24 word mnemonic phrase (in quotes)

Options:
  --unzip      Automatically unzip the backup after decryption

Examples:
  # Decrypt backup
  node scripts/decrypt_backup.js backup.txt backup.zip "word1 word2 ... word12"

  # Decrypt and extract
  node scripts/decrypt_backup.js backup.txt backup.zip "word1 word2 ... word12" --unzip

Security Warning:
  This script handles sensitive wallet data. Always keep your mnemonic secure
  and delete decrypted backups after inspection.
`);
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
  }

  const inputFile = args[0];
  const outputFile = args[1];
  const mnemonic = args[2];
  const shouldUnzip = args.includes("--unzip");

  try {
    console.log(`Reading encrypted backup from: ${inputFile}`);

    // Read as binary first
    let encryptedData = await readFile(inputFile);
    console.log(`Raw file size: ${encryptedData.length} bytes`);

    // Check if it's base64 text or binary
    const firstByte = encryptedData[0];

    // If first byte is not 1 (version), it might be base64 encoded text
    if (firstByte !== 1) {
      console.log("File appears to be base64 encoded text, decoding...");
      const base64String = encryptedData.toString("utf8").trim();
      console.log(`First 100 chars: ${base64String.substring(0, 100)}`);

      try {
        encryptedData = Buffer.from(base64String, "base64");
        console.log(`Decoded from base64, size: ${encryptedData.length} bytes`);
      } catch (err) {
        throw new Error("Failed to decode base64: " + err.message);
      }
    } else {
      console.log("File is already in binary format");
    }

    console.log(`Encrypted data size: ${encryptedData.length} bytes`);
    console.log(
      `First 20 bytes (hex): ${encryptedData.slice(0, 20).toString("hex")}`,
    );
    console.log(
      `First 20 bytes (decimal): [${Array.from(encryptedData.slice(0, 20)).join(", ")}]`,
    );

    const decryptedData = decryptBackup(encryptedData, mnemonic);
    console.log(`Decrypted data size: ${decryptedData.length} bytes`);

    console.log(`Writing decrypted backup to: ${outputFile}`);
    await writeFile(outputFile, decryptedData);

    console.log("✓ Backup decrypted successfully!");

    if (shouldUnzip) {
      const outputDir = outputFile.replace(/\.[^/.]+$/, "") + "_extracted";
      console.log(`Unzipping to: ${outputDir}`);
      await unzipBackup(outputFile, outputDir);
    }
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    if (err.code === "ENOENT") {
      console.error(`  File not found: ${err.path}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { decryptBackup, deriveKey };
