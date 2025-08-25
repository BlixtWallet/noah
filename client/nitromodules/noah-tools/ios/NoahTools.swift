import CommonCrypto
import CryptoKit
import Foundation
import NitroModules
import OSLog
import ZIPFoundation

class NoahTools: HybridNoahToolsSpec {
  func getAppVariant() throws -> String {
    guard
      let appVariant = Bundle.main.object(
        forInfoDictionaryKey: "APP_VARIANT"
      ) as? String
    else {
      throw NSError(
        domain: "NoahTools",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "NoahTools: Can't find Info.plist key APP_VARIANT. "
            + "Is the xcconfig file for the current schema properly set?"
        ]
      )
    }
    return appVariant
  }

  func getAppLogs() throws -> Promise<[String]> {
    return Promise.async {
      let store = try OSLogStore(scope: .currentProcessIdentifier)

      // Start from 24 hours ago (adjust as needed, e.g., -3600 for 1 hour or Date.distantPast for all)
      let position = store.position(date: Date().addingTimeInterval(-3600 * 24))

      // Subsystems to include in the logs
      let rustSubsystem = "com.nitro.ark"
      let jsSubsystem = "com.facebook.react.log"

      // Debug logging
      let debugLogger = Logger(subsystem: "com.noah.logfetcher", category: "debug")
      debugLogger.info("Filtering for subsystems: \(rustSubsystem), \(jsSubsystem)")

      // Predicate: Filter for entries from either the Rust subsystem or the JavaScript subsystem
      let predicate = NSPredicate(
        format: "subsystem == %@ OR subsystem == %@", rustSubsystem, jsSubsystem)

      // Fetch entries with the predicate (efficient filtering)
      let rawEntries = try store.getEntries(at: position, matching: predicate)
      let filteredEntries = rawEntries.compactMap { $0 as? OSLogEntryLog }

      let formattedEntries = filteredEntries.map {
        "[\($0.date.formatted())] \($0.composedMessage)"
      }

      return formattedEntries
    }
  }

  func zipDirectory(sourceDirectory: String, outputZipPath: String) throws -> Promise<String> {
    return Promise.async {
      let sourceURL = URL(fileURLWithPath: sourceDirectory)
      let outputURL = URL(fileURLWithPath: outputZipPath)

      guard FileManager.default.fileExists(atPath: sourceDirectory) else {
        throw NSError(
          domain: "NoahTools",
          code: 2,
          userInfo: [
            NSLocalizedDescriptionKey: "Source directory does not exist: \(sourceDirectory)"
          ]
        )
      }

      // Create output directory if it doesn't exist
      try FileManager.default.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true,
        attributes: nil
      )

      // Use ZIPFoundation's FileManager extension to zip the directory
      try FileManager.default.zipItem(
        at: sourceURL, to: outputURL, shouldKeepParent: false, compressionMethod: .deflate)

      return outputZipPath
    }
  }

  func unzipFile(zipPath: String, outputDirectory: String) throws -> Promise<String> {
    return Promise.async {
      let zipURL = URL(fileURLWithPath: zipPath)
      let outputURL = URL(fileURLWithPath: outputDirectory)

      guard FileManager.default.fileExists(atPath: zipPath) else {
        throw NSError(
          domain: "NoahTools",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "Zip file does not exist: \(zipPath)"]
        )
      }

      let fileManager = FileManager.default

      print("Starting unzip process...")
      print("Zip file path: \(zipPath)")
      print("Output directory: \(outputDirectory)")

      // Check if zip file exists and get its size
      let zipFileExists = fileManager.fileExists(atPath: zipPath)
      print("Zip file exists: \(zipFileExists)")

      if zipFileExists {
        do {
          let zipFileAttributes = try fileManager.attributesOfItem(atPath: zipPath)
          let zipFileSize = zipFileAttributes[.size] as? Int64 ?? 0
          print("Zip file size: \(zipFileSize) bytes")
        } catch {
          print("Error getting zip file attributes: \(error)")
        }
      }

      // Clear the output directory first if it exists
      if fileManager.fileExists(atPath: outputDirectory) {
        print("Removing existing output directory...")
        try fileManager.removeItem(at: outputURL)
      }

      // Create the output directory
      print("Creating output directory...")
      try fileManager.createDirectory(
        at: outputURL, withIntermediateDirectories: true, attributes: nil)

      // Use ZIPFoundation Archive for manual extraction
      print("Using ZIPFoundation Archive to unzip file...")

      let archive = try Archive(url: zipURL, accessMode: .read)

      for entry in archive {
        let entryURL = outputURL.appendingPathComponent(entry.path)

        if entry.type == .directory {
          try fileManager.createDirectory(
            at: entryURL, withIntermediateDirectories: true, attributes: nil)
          print("Created directory: \(entry.path)")
        } else {
          // Create parent directories if needed
          try fileManager.createDirectory(
            at: entryURL.deletingLastPathComponent(), withIntermediateDirectories: true,
            attributes: nil)

          // Extract the file
          _ = try archive.extract(entry, to: entryURL)
          print("Extracted file: \(entry.path)")
        }
      }
      print("ZIPFoundation extraction completed successfully")

      // Check what was actually created
      print("Checking output directory contents...")
      do {
        let contents = try fileManager.contentsOfDirectory(
          at: outputURL, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [])
        print("Found \(contents.count) items in output directory")

        for item in contents {
          do {
            let resourceValues = try item.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
            let isDirectory = resourceValues.isDirectory ?? false
            let fileSize = resourceValues.fileSize ?? 0
            print(
              "  \(item.lastPathComponent) (\(isDirectory ? "directory" : "file") - \(fileSize) bytes)"
            )
          } catch {
            print("  \(item.lastPathComponent) (error reading properties: \(error))")
          }
        }
      } catch {
        print("Error reading output directory: \(error)")
      }

      return outputDirectory
    }
  }

  func encryptBackup(backupPath: String, mnemonic: String) throws -> Promise<String> {
    return Promise.async {
      // Read the backup file
      let backupData = try Data(contentsOf: URL(fileURLWithPath: backupPath))

      // Generate a RANDOM salt (different every time!)
      let salt = self.generateRandomBytes(count: 16)

      // Derive encryption key using mnemonic + random salt
      let key = try self.deriveKey(from: mnemonic, salt: salt)

      // Generate random IV
      let iv = self.generateRandomBytes(count: 12)

      // Encrypt the data
      let sealedBox = try AES.GCM.seal(backupData, using: key, nonce: AES.GCM.Nonce(data: iv))

      // HERE'S THE KEY PART: Package everything into ONE file
      // The encrypted file contains: [version][salt][iv][ciphertext][tag]
      let version: [UInt8] = [1]  // Format version
      var encryptedData = Data(version)
      encryptedData.append(salt)  // 16 bytes - STORED IN FILE
      encryptedData.append(iv)  // 12 bytes - STORED IN FILE
      encryptedData.append(sealedBox.ciphertext)  // encrypted data
      encryptedData.append(sealedBox.tag)  // 16 bytes - auth tag

      // Return as base64 string (this is the complete encrypted backup)
      // This single string contains EVERYTHING needed for decryption
      return encryptedData.base64EncodedString()
    }
  }

  func decryptBackup(encryptedData: String, mnemonic: String, outputPath: String) throws
    -> Promise<String>
  {
    return Promise.async {
      // Decode the encrypted file
      guard let data = Data(base64Encoded: encryptedData) else {
        throw NSError(
          domain: "DecryptionError", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid base64 data"])
      }

      // HERE'S THE KEY PART: Extract the salt FROM the encrypted file
      // The user didn't provide the salt - it's already in the file!
      let version = data.prefix(1)
      guard version.first == 1 else {
        throw NSError(
          domain: "DecryptionError", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Unsupported backup version"])
      }
      let salt = data.dropFirst(1).prefix(16)  // Read salt from file
      let iv = data.dropFirst(17).prefix(12)  // Read IV from file
      let ciphertext = data.dropFirst(29).dropLast(16)  // Read ciphertext
      let tag = data.suffix(16)  // Read auth tag

      // Derive the SAME key using the mnemonic + the salt we read from the file
      let key = try self.deriveKey(from: mnemonic, salt: salt)

      // Decrypt
      let sealedBox = try AES.GCM.SealedBox(
        nonce: AES.GCM.Nonce(data: iv),
        ciphertext: ciphertext,
        tag: tag
      )
      let decryptedData = try AES.GCM.open(sealedBox, using: key)

      // Write decrypted data to output
      try decryptedData.write(to: URL(fileURLWithPath: outputPath))

      return outputPath
    }
  }

  // Updated helper function with better security
  private func deriveKey(from mnemonic: String, salt: Data) throws -> SymmetricKey {
    let seedData = mnemonic.data(using: .utf8)!
    let derivedKey = try self.pbkdf2(
      password: seedData,
      salt: salt,
      iterations: 600_000,
      keyLength: 32
    )
    return SymmetricKey(data: derivedKey)
  }

  private func generateRandomBytes(count: Int) -> Data {
    var bytes = Data(count: count)
    let result = bytes.withUnsafeMutableBytes {
      SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!)
    }
    guard result == errSecSuccess else {
      fatalError("Failed to generate random bytes")
    }
    return bytes
  }

  private func pbkdf2(password: Data, salt: Data, iterations: Int, keyLength: Int) throws -> Data {
    var derivedKey = Data(count: keyLength)
    let result = derivedKey.withUnsafeMutableBytes { derivedKeyBytes in
      salt.withUnsafeBytes { saltBytes in
        password.withUnsafeBytes { passwordBytes in
          CCKeyDerivationPBKDF(
            CCPBKDFAlgorithm(kCCPBKDF2),
            passwordBytes.baseAddress, password.count,
            saltBytes.baseAddress, salt.count,
            CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
            UInt32(iterations),
            derivedKeyBytes.baseAddress, keyLength
          )
        }
      }
    }

    guard result == kCCSuccess else {
      throw NSError(
        domain: "CryptoError", code: Int(result),
        userInfo: [NSLocalizedDescriptionKey: "Key derivation failed"])
    }

    return derivedKey
  }

}
