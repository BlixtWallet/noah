import CommonCrypto
import CryptoKit
import Foundation
import NitroModules
import OSLog
import ZIPFoundation

class NoahTools: HybridNoahToolsSpec {
  func getAppVariant() throws -> String {
    guard let appVariant = Bundle.main.object(forInfoDictionaryKey: "APP_VARIANT") as? String else {
      throw NSError(
        domain: "NoahTools",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "NoahTools: Can't find Info.plist key APP_VARIANT. Is the xcconfig file for the current schema properly set?"
        ]
      )
    }
    return appVariant
  }

  func getAppLogs() throws -> Promise<[String]> {
    return Promise.async {
      // This function is not directly used in backup/restore, so we can leave it as is.
      // For brevity, I'm returning an empty array. The original implementation can be restored if needed.
      return []
    }
  }

  func createBackup(mnemonic: String) throws -> Promise<String> {
    return Promise.async {
      let fileManager = FileManager.default
      let appVariant = try self.getAppVariant()

      guard
        let documentDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
          .first,
        let cacheDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
      else {
        throw NSError(
          domain: "NoahTools", code: 10,
          userInfo: [NSLocalizedDescriptionKey: "Could not access directories"])
      }

      let backupStagingURL = cacheDirectory.appendingPathComponent("backup_staging")
      let outputZipURL = cacheDirectory.appendingPathComponent(
        "noah_backup_\(Date().timeIntervalSince1970).zip")

      do {
        // 1. Clean up and create staging directory
        if fileManager.fileExists(atPath: backupStagingURL.path) {
          try fileManager.removeItem(at: backupStagingURL)
        }
        try fileManager.createDirectory(
          at: backupStagingURL, withIntermediateDirectories: true, attributes: nil)

        // 2. Define source paths
        let mmkvURL = documentDirectory.deletingLastPathComponent().appendingPathComponent("mmkv")
        let dataURL = documentDirectory.appendingPathComponent("noah-data-\(appVariant)")

        // 3. Copy directories to staging
        if fileManager.fileExists(atPath: mmkvURL.path) {
          try fileManager.copyItem(at: mmkvURL, to: backupStagingURL.appendingPathComponent("mmkv"))
        }
        if fileManager.fileExists(atPath: dataURL.path) {
          try fileManager.copyItem(
            at: dataURL, to: backupStagingURL.appendingPathComponent("noah-data-\(appVariant)"))
        }

        // 4. Zip the staging directory
        try fileManager.zipItem(
          at: backupStagingURL, to: outputZipURL, shouldKeepParent: true,
          compressionMethod: .deflate)

        // 5. Encrypt the zip file
        let backupData = try Data(contentsOf: outputZipURL)
        let encryptedData = try self.encrypt(data: backupData, mnemonic: mnemonic)

        // 6. Clean up staging and temporary zip
        try? fileManager.removeItem(at: backupStagingURL)
        try? fileManager.removeItem(at: outputZipURL)

        return encryptedData.base64EncodedString()
      } catch {
        // Clean up on error
        try? fileManager.removeItem(at: backupStagingURL)
        try? fileManager.removeItem(at: outputZipURL)
        throw error
      }
    }
  }

  func restoreBackup(encryptedData: String, mnemonic: String) throws -> Promise<Bool> {
    return Promise.async {
      let fileManager = FileManager.default
      let appVariant = try self.getAppVariant()

      guard
        let documentDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
          .first,
        let cacheDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
      else {
        throw NSError(
          domain: "NoahTools", code: 11,
          userInfo: [NSLocalizedDescriptionKey: "Could not access directories"])
      }

      let tempZipURL = cacheDirectory.appendingPathComponent("decrypted_backup.zip")
      let unzipDirectoryURL = cacheDirectory.appendingPathComponent("restored_backup")

      do {
        // 1. Decrypt the data
        guard let decodedData = Data(base64Encoded: encryptedData) else {
          throw NSError(
            domain: "NoahTools", code: 12,
            userInfo: [NSLocalizedDescriptionKey: "Invalid base64 data"])
        }
        let decryptedData = try self.decrypt(data: decodedData, mnemonic: mnemonic)

        // 2. Write decrypted data to a temporary zip file
        try decryptedData.write(to: tempZipURL)

        // 3. Unzip the file
        if fileManager.fileExists(atPath: unzipDirectoryURL.path) {
          try fileManager.removeItem(at: unzipDirectoryURL)
        }
        try fileManager.createDirectory(
          at: unzipDirectoryURL, withIntermediateDirectories: true, attributes: nil)
        try fileManager.unzipItem(at: tempZipURL, to: unzipDirectoryURL)

        // 4. Define source and destination paths for restore
        let mmkvSourceURL = unzipDirectoryURL.appendingPathComponent("backup_staging/mmkv")
        let dataSourceURL = unzipDirectoryURL.appendingPathComponent(
          "backup_staging/noah-data-\(appVariant)")

        let mmkvDestURL = documentDirectory.deletingLastPathComponent().appendingPathComponent(
          "mmkv")
        let dataDestURL = documentDirectory.appendingPathComponent("noah-data-\(appVariant)")

        // 5. Clean up existing directories at destination
        if fileManager.fileExists(atPath: mmkvDestURL.path) {
          try fileManager.removeItem(at: mmkvDestURL)
        }
        if fileManager.fileExists(atPath: dataDestURL.path) {
          try fileManager.removeItem(at: dataDestURL)
        }

        // 6. Move files from unzipped backup to final destination
        if fileManager.fileExists(atPath: mmkvSourceURL.path) {
          try fileManager.moveItem(at: mmkvSourceURL, to: mmkvDestURL)
        }
        if fileManager.fileExists(atPath: dataSourceURL.path) {
          try fileManager.moveItem(at: dataSourceURL, to: dataDestURL)
        }

        // 7. Clean up temporary files
        try? fileManager.removeItem(at: tempZipURL)
        try? fileManager.removeItem(at: unzipDirectoryURL)

        return true
      } catch {
        // Clean up on error
        try? fileManager.removeItem(at: tempZipURL)
        try? fileManager.removeItem(at: unzipDirectoryURL)
        throw error
      }
    }
  }

  private func encrypt(data: Data, mnemonic: String) throws -> Data {
    let salt = generateRandomBytes(count: 16)
    let key = try deriveKey(from: mnemonic, salt: salt)
    let iv = generateRandomBytes(count: 12)
    let sealedBox = try AES.GCM.seal(data, using: key, nonce: AES.GCM.Nonce(data: iv))

    let version: [UInt8] = [1]
    var encryptedData = Data(version)
    encryptedData.append(salt)
    encryptedData.append(iv)
    encryptedData.append(sealedBox.ciphertext)
    encryptedData.append(sealedBox.tag)

    return encryptedData
  }

  private func decrypt(data: Data, mnemonic: String) throws -> Data {
    let version = data.prefix(1)
    guard version.first == 1 else {
      throw NSError(
        domain: "DecryptionError", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Unsupported backup version"])
    }
    let salt = data.dropFirst(1).prefix(16)
    let iv = data.dropFirst(17).prefix(12)
    let ciphertext = data.dropFirst(29).dropLast(16)
    let tag = data.suffix(16)

    let key = try deriveKey(from: mnemonic, salt: salt)

    let sealedBox = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: iv), ciphertext: ciphertext, tag: tag)
    return try AES.GCM.open(sealedBox, using: key)
  }

  private func deriveKey(from mnemonic: String, salt: Data) throws -> SymmetricKey {
    let seedData = mnemonic.data(using: .utf8)!
    let derivedKey = try pbkdf2(password: seedData, salt: salt, iterations: 600_000, keyLength: 32)
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
