import Foundation
import OSLog
import NitroModules
import CryptoKit
import CommonCrypto

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
     try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true, attributes: nil)
     
     // Use Foundation's built-in unzip with file name sanitization
     print("Attempting to unzip with file name sanitization...")
     
     do {
       try self.unzipWithSanitizedNames(zipURL: zipURL, outputURL: outputURL)
       print("Unzip with sanitized names completed successfully")
     } catch {
       print("Unzip with sanitized names failed: \(error)")
       throw error
     }
     
     // Check what was actually created
     print("Checking output directory contents...")
     do {
       let contents = try fileManager.contentsOfDirectory(at: outputURL, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [])
       print("Found \(contents.count) items in output directory")
       
       for item in contents {
         do {
           let resourceValues = try item.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
           let isDirectory = resourceValues.isDirectory ?? false
           let fileSize = resourceValues.fileSize ?? 0
           print("  \(item.lastPathComponent) (\(isDirectory ? "directory" : "file") - \(fileSize) bytes)")
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
 
 private func unzipWithSanitizedNames(zipURL: URL, outputURL: URL) throws {
   // Use NSFileCoordinator to create a temporary unzipped version
   let fileManager = FileManager.default
   var coordinatorError: NSError?
   var extractionError: Error?
   let coordinator = NSFileCoordinator()
   
   print("Using NSFileCoordinator to extract zip contents...")
   
   coordinator.coordinate(readingItemAt: zipURL, options: [.forUploading], error: &coordinatorError) { (tempURL) in
     do {
       print("Temporary extraction URL: \(tempURL.path)")
       
       // List what was extracted
       let extractedItems = try fileManager.contentsOfDirectory(at: tempURL, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [])
       print("Found \(extractedItems.count) items in temporary extraction")
       
       // Copy each item with sanitized names
       for item in extractedItems {
         let originalName = item.lastPathComponent
         let sanitizedName = self.sanitizeFileName(originalName)
         let destinationURL = outputURL.appendingPathComponent(sanitizedName)
         
         print("Copying: \(originalName) -> \(sanitizedName)")
         
         if item.hasDirectoryPath {
           try self.copyDirectoryWithSanitizedNames(from: item, to: destinationURL)
         } else {
           // Create parent directory if needed
           try fileManager.createDirectory(at: destinationURL.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: nil)
           try fileManager.copyItem(at: item, to: destinationURL)
         }
       }
       
     } catch let error {
       extractionError = error
     }
   }
   
   if let coordinatorError = coordinatorError {
     throw coordinatorError
   }
   
   if let extractionError = extractionError {
     throw extractionError
   }
 }
 
 private func sanitizeFileName(_ fileName: String) -> String {
   // Replace problematic file extensions and names
   var sanitized = fileName
   
   // Replace .sqlite with .db_backup
   sanitized = sanitized.replacingOccurrences(of: ".sqlite", with: ".db_backup")
   sanitized = sanitized.replacingOccurrences(of: ".sqlite-wal", with: ".db_wal_backup")
   sanitized = sanitized.replacingOccurrences(of: ".sqlite-shm", with: ".db_shm_backup")
   
   // Remove any other problematic characters
   sanitized = sanitized.replacingOccurrences(of: ":", with: "_")
   sanitized = sanitized.replacingOccurrences(of: "/", with: "_")
   
   print("Sanitized '\(fileName)' to '\(sanitized)'")
   return sanitized
 }
 
 private func copyDirectoryWithSanitizedNames(from sourceURL: URL, to destinationURL: URL) throws {
   let fileManager = FileManager.default
   
   // Create destination directory
   try fileManager.createDirectory(at: destinationURL, withIntermediateDirectories: true, attributes: nil)
   
   // Get contents of source directory
   let contents = try fileManager.contentsOfDirectory(at: sourceURL, includingPropertiesForKeys: [.isDirectoryKey], options: [])
   
   for item in contents {
     let originalName = item.lastPathComponent
     let sanitizedName = self.sanitizeFileName(originalName)
     let itemDestination = destinationURL.appendingPathComponent(sanitizedName)
     
     if item.hasDirectoryPath {
       try self.copyDirectoryWithSanitizedNames(from: item, to: itemDestination)
     } else {
       try fileManager.copyItem(at: item, to: itemDestination)
     }
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
