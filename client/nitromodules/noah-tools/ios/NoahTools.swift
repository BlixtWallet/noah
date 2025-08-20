import Foundation
import OSLog
import NitroModules

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
      
      // Create a simple archive by copying all files to a temporary directory and then creating a tar file
      try self.createSimpleArchive(sourceURL: sourceURL, outputURL: outputURL)
      
      return outputZipPath
    }
  }
  
  private func createSimpleArchive(sourceURL: URL, outputURL: URL) throws {
    let fileManager = FileManager.default
    
    // Get all files recursively
    let enumerator = fileManager.enumerator(at: sourceURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
    
    var allData = Data()
    let baseName = sourceURL.lastPathComponent
    
    // Create a simple concatenated file format with file headers
    while let fileURL = enumerator?.nextObject() as? URL {
      let resourceValues = try fileURL.resourceValues(forKeys: [.isDirectoryKey])
      
      if resourceValues.isDirectory != true {
        let relativePath = String(fileURL.path.dropFirst(sourceURL.path.count + 1))
        let fullPath = "\(baseName)/\(relativePath)"
        
        // Read file data
        let fileData = try Data(contentsOf: fileURL)
        
        // Create a simple header: path length (4 bytes) + path + data length (4 bytes) + data
        let pathData = fullPath.data(using: .utf8) ?? Data()
        var pathLength = UInt32(pathData.count).bigEndian
        var dataLength = UInt32(fileData.count).bigEndian
        
        allData.append(Data(bytes: &pathLength, count: 4))
        allData.append(pathData)
        allData.append(Data(bytes: &dataLength, count: 4))
        allData.append(fileData)
      }
    }
    
    // Write the archive
    try allData.write(to: outputURL)
  }
}
