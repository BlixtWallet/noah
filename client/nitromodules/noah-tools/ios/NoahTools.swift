import CommonCrypto
import CryptoKit
import Foundation
import NitroModules
import OSLog
import ZIPFoundation

class NoahTools: HybridNoahToolsSpec {
  func nativePost(url: String, body: String, headers: [String: String], timeoutSeconds: Double) throws -> Promise<HttpResponse> {
    return Promise.async {
      guard let requestUrl = URL(string: url) else {
        throw NSError(
          domain: "NoahTools",
          code: 100,
          userInfo: [NSLocalizedDescriptionKey: "Invalid URL: \(url)"]
        )
      }
      
      // Create URLSession configuration for background-compatible requests
      let config = URLSessionConfiguration.ephemeral
      config.timeoutIntervalForRequest = timeoutSeconds
      config.timeoutIntervalForResource = timeoutSeconds
      config.waitsForConnectivity = false
      config.allowsCellularAccess = true
      config.allowsExpensiveNetworkAccess = true
      config.allowsConstrainedNetworkAccess = true
      
      let session = URLSession(configuration: config)
      
      var request = URLRequest(url: requestUrl)
      request.httpMethod = "POST"
      request.httpBody = body.data(using: .utf8)
      request.timeoutInterval = timeoutSeconds
      
      // Set headers
      for (key, value) in headers {
        request.setValue(value, forHTTPHeaderField: key)
      }
      
      // Use async/await for the network request
      do {
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
          throw NSError(
            domain: "NoahTools",
            code: 102,
            userInfo: [NSLocalizedDescriptionKey: "No HTTP response received"]
          )
        }
        
        let responseBody = String(data: data, encoding: .utf8) ?? ""
        
        // Convert headers to dictionary
        var responseHeaders: [String: String] = [:]
        if let allHeaders = httpResponse.allHeaderFields as? [String: String] {
          responseHeaders = allHeaders
        }
        
        return HttpResponse(
          status: Double(httpResponse.statusCode),
          body: responseBody,
          headers: responseHeaders
        )
      } catch {
        // Handle timeout or other errors
        if (error as NSError).code == NSURLErrorTimedOut {
          throw NSError(
            domain: "NoahTools",
            code: 101,
            userInfo: [NSLocalizedDescriptionKey: "Request timed out after \(timeoutSeconds) seconds"]
          )
        }
        throw error
      }
    }
  }
  
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
        let dataURL = documentDirectory.appendingPathComponent("noah-data-\(appVariant)")

        // 3. Copy directories to staging
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
        let dataSourceURL = unzipDirectoryURL.appendingPathComponent(
          "backup_staging/noah-data-\(appVariant)")

        let dataDestURL = documentDirectory.appendingPathComponent("noah-data-\(appVariant)")

        // 5. Clean up existing directories at destination
        if fileManager.fileExists(atPath: dataDestURL.path) {
          try fileManager.removeItem(at: dataDestURL)
        }

        // 6. Move files from unzipped backup to final destination
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
