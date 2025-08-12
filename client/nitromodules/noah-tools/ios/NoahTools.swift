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
}
