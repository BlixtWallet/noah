import Foundation
import OSLog
import NitroModules
import CryptoKit
import CommonCrypto
import ZIPFoundation

class NoahTools: HybridNoahToolsSpec {
  func getAppVariant() throws -> String {
    guard let appVariant = Bundle.main.object(
      forInfoDictionaryKey: "APP_VARIANT"
    ) as? String else {
      throw NSError(
        domain: "NoahTools",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "NoahTools: Can't find Info.plist key APP_VARIANT. " +
            "Is the xcconfig file for the current schema properly set?"
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
      let predicate = NSPredicate(format: "subsystem == %@ OR subsystem == %@", rustSubsystem, jsSubsystem)
      
      // Fetch entries with the predicate (efficient filtering)
      let rawEntries = try store.getEntries(at: position, matching: predicate)
      let filteredEntries = rawEntries.compactMap { $0 as? OSLogEntryLog }
      
      let formattedEntries = filteredEntries.map { "[\($0.date.formatted())] \($0.composedMessage)" }
      
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
          userInfo: [NSLocalizedDescriptionKey: "Source directory does not exist: \(sourceDirectory)"]
        )
      }
      
      // Create output directory if it doesn't exist
      try FileManager.default.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true,
        attributes: nil
      )
      
      let fileManager = FileManager.default
      var archiveUrl: URL?
      var coordinatorError: NSError?
      var moveError: Error?
      
      let coordinator = NSFileCoordinator()
      
      // Use NSFileCoordinator with .forUploading option to create a zip file
      // This is iOS's built-in way to create zip files without external dependencies
      coordinator.coordinate(readingItemAt: sourceURL, options: [.forUploading], error: &coordinatorError) { (zipUrl) in
        do {
          // zipUrl points to the zip file created by the coordinator
          // zipUrl is valid only until the end of this block, so we move the file to our desired location
          try fileManager.moveItem(at: zipUrl, to: outputURL)
          archiveUrl = outputURL
        } catch {
          moveError = error
        }
      }
      
      if let error = coordinatorError {
        throw error
      }
      
      if let error = moveError {
        throw error
      }
      
      guard archiveUrl != nil else {
        throw NSError(
          domain: "NoahTools",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "Failed to create zip archive"]
        )
      }
      
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
     
     // Create output directory if it doesn't exist
     try FileManager.default.createDirectory(
       at: outputURL,
       withIntermediateDirectories: true,
       attributes: nil
     )
     
     // Use ZipFoundation to properly unzip the file
     let fileManager = FileManager.default
     
     // Clear the output directory first if it exists
     if fileManager.fileExists(atPath: outputDirectory) {
       try fileManager.removeItem(at: outputURL)
     }
     
     // Create the output directory
     try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true, attributes: nil)
     
     // Unzip the file using ZipFoundation
     try fileManager.unzipItem(at: zipURL, to: outputURL)
     
     // Log the contents of the unzipped directory
     let unzippedContents = try fileManager.contentsOfDirectory(at: outputURL, includingPropertiesForKeys: [.isDirectoryKey], options: [])
     print("Unzipped contents:")
     for item in unzippedContents {
       let resourceValues = try item.resourceValues(forKeys: [.isDirectoryKey])
       let isDirectory = resourceValues.isDirectory ?? false
       print("  \(item.lastPathComponent) (\(isDirectory ? "directory" : "file"))")
     }
     
     return outputDirectory
   }
 }
 
 func encryptBackup(backupPath: String, seedphrase: String) throws -> Promise<String> {
       return Promise.async {
           // Read backup file
           let backupData = try Data(contentsOf: URL(fileURLWithPath: backupPath))
           
           // Derive key from seedphrase using PBKDF2
           let salt = self.deriveSalt(from: seedphrase)
           let key = try self.deriveKey(from: seedphrase, salt: salt)
           
           // Generate random IV
           let iv = self.generateRandomBytes(count: 12)
           
           // Encrypt using AES-256-GCM
           let sealedBox = try AES.GCM.seal(backupData, using: key, nonce: AES.GCM.Nonce(data: iv))
           
           // Combine IV + encrypted data + auth tag
           var encryptedData = Data()
           encryptedData.append(iv)
           encryptedData.append(sealedBox.ciphertext)
           encryptedData.append(sealedBox.tag)
           
           // Return base64 encoded
           return encryptedData.base64EncodedString()
       }
   }
   
   func decryptBackup(encryptedData: String, seedphrase: String, outputPath: String) throws -> Promise<String> {
       return Promise.async {
           // Decode base64
           guard let data = Data(base64Encoded: encryptedData) else {
               throw NSError(domain: "DecryptionError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 data"])
           }
           
           // Extract IV, ciphertext, and auth tag
           let iv = data.prefix(12)
           let ciphertext = data.dropFirst(12).dropLast(16)
           let tag = data.suffix(16)
           
           // Derive key from seedphrase
           let salt = self.deriveSalt(from: seedphrase)
           let key = try self.deriveKey(from: seedphrase, salt: salt)
           
           // Decrypt using AES-256-GCM
           let sealedBox = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: ciphertext, tag: tag)
           let decryptedData = try AES.GCM.open(sealedBox, using: key)
           
           // Write to output path
           try decryptedData.write(to: URL(fileURLWithPath: outputPath))
           
           return outputPath
       }
   }
   
   private func deriveKey(from seedphrase: String, salt: Data) throws -> SymmetricKey {
       let seedData = seedphrase.data(using: .utf8)!
       let derivedKey = try self.pbkdf2(password: seedData, salt: salt, iterations: 10000, keyLength: 32)
       return SymmetricKey(data: derivedKey)
   }
   
   private func deriveSalt(from seedphrase: String) -> Data {
       // Use first 16 bytes of SHA256 hash of seedphrase as deterministic salt
       let seedData = seedphrase.data(using: .utf8)!
       let hash = SHA256.hash(data: seedData)
       return Data(hash.prefix(16))
   }
   
   private func generateRandomBytes(count: Int) -> Data {
       var bytes = Data(count: count)
       let result = bytes.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
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
           throw NSError(domain: "CryptoError", code: Int(result), userInfo: [NSLocalizedDescriptionKey: "Key derivation failed"])
       }
       
       return derivedKey
   }
}
