import Foundation
import NitroModules
import OSLog

extension NoahTools {
    // Logger for native logging
    internal static let logger = Logger(subsystem: "com.facebook.react.log", category: "NoahTools")

    internal func performNativeLog(level: String, tag: String, message: String) throws {
        let logMessage = "[\(tag)] \(message)"

        switch level.lowercased() {
        case "verbose":
            NoahTools.logger.debug("\(logMessage, privacy: .public)")
        case "debug":
            NoahTools.logger.debug("\(logMessage, privacy: .public)")
        case "info":
            NoahTools.logger.info("\(logMessage, privacy: .public)")
        case "warn":
            NoahTools.logger.warning("\(logMessage, privacy: .public)")
        case "error":
            NoahTools.logger.error("\(logMessage, privacy: .public)")
        default:
            NoahTools.logger.info("\(logMessage, privacy: .public)")
        }
    }

    internal func performGetAppVariant() throws -> String {
        guard let appVariant = Bundle.main.object(forInfoDictionaryKey: "APP_VARIANT") as? String
        else {
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

    internal func performGetAppLogs() throws -> Promise<[String]> {
        return Promise.async {
            do {
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

                // Sort by timestamp to ensure chronological order
                let sortedEntries = filteredEntries.sorted { $0.date < $1.date }

                // Apply log rotation - keep only the last 1000 entries to prevent memory issues
                let maxLogEntries = 1000
                let entriesToProcess = sortedEntries.suffix(maxLogEntries)

                // Format entries with better timestamp formatting (similar to Android logcat)
                let dateFormatter = DateFormatter()
                dateFormatter.dateFormat = "MM-dd HH:mm:ss.SSS"

                let formattedEntries = entriesToProcess.map { entry in
                    let timestamp = dateFormatter.string(from: entry.date)
                    let level = self.getLogLevelString(from: entry.level)
                    return "\(timestamp) \(level) \(entry.subsystem): \(entry.composedMessage)"
                }

                debugLogger.info("Returning \(formattedEntries.count) log entries")
                return Array(formattedEntries)

            } catch {
                // Better error handling
                let debugLogger = Logger(subsystem: "com.noah.logfetcher", category: "debug")
                debugLogger.error("Failed to fetch logs: \(error.localizedDescription)")
                throw NSError(
                    domain: "NoahTools",
                    code: 200,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "Failed to fetch logs: \(error.localizedDescription)"
                    ]
                )
            }
        }
    }

    // Helper function to convert OSLogEntryLog level to string
    private func getLogLevelString(from level: OSLogEntryLog.Level) -> String {
        switch level {
        case .undefined:
            return "U"
        case .debug:
            return "D"
        case .info:
            return "I"
        case .notice:
            return "N"
        case .error:
            return "E"
        case .fault:
            return "F"
        @unknown default:
            return "I"
        }
    }
}
