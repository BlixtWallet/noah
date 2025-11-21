import Foundation
import NitroModules
import OSLog
import os

extension NoahTools {
    // Logger for native logging
    internal static let logger = Logger(subsystem: "com.noah.app", category: "NoahTools")
    private static let logQueue = DispatchQueue(label: "com.noah.app.noah-log-file")

    private enum LogFileConfig {
        static let directoryName = "noah_logs"
        static let fileName = "noah.log"
        static let maxFileSizeBytes: Int = 512 * 1024  // 512 KB
        static let maxFiles = 4
        static let maxLines = 4000

        static let timestampFormatter: DateFormatter = {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
            return formatter
        }()
    }

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

        NoahTools.logQueue.async {
            do {
                try self.persistLogToFile(level: level, tag: tag, message: message)
            } catch {
                NoahTools.logger.error(
                    "Failed to persist log to file: \(error.localizedDescription, privacy: .public)"
                )
            }
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
            return try NoahTools.logQueue.sync {
                let directory = try self.ensureLogDirectory()
                let fileManager = FileManager.default

                let logFiles =
                    try fileManager
                    .contentsOfDirectory(
                        at: directory,
                        includingPropertiesForKeys: [.contentModificationDateKey],
                        options: .skipsHiddenFiles
                    )
                    .filter { $0.lastPathComponent.hasPrefix(LogFileConfig.fileName) }
                    .sorted {
                        let lhsDate =
                            (try? $0.resourceValues(
                                forKeys: [.contentModificationDateKey]
                            ).contentModificationDate) ?? Date.distantPast
                        let rhsDate =
                            (try? $1.resourceValues(
                                forKeys: [.contentModificationDateKey]
                            ).contentModificationDate) ?? Date.distantPast
                        return lhsDate < rhsDate
                    }

                var lines: [String] = []

                for fileURL in logFiles {
                    guard let fileContents = try? String(contentsOf: fileURL, encoding: .utf8)
                    else {
                        continue
                    }

                    fileContents.split(whereSeparator: \.isNewline).forEach { line in
                        lines.append(String(line))
                        if lines.count > LogFileConfig.maxLines {
                            lines.removeFirst(lines.count - LogFileConfig.maxLines)
                        }
                    }
                }

                if let systemLogs = try? self.collectSystemLogs() {
                    systemLogs.forEach { line in
                        lines.append(line)
                        if lines.count > LogFileConfig.maxLines {
                            lines.removeFirst(lines.count - LogFileConfig.maxLines)
                        }
                    }
                }

                return lines
            }
        }
    }

    private func persistLogToFile(level: String, tag: String, message: String) throws {
        let directory = try ensureLogDirectory()
        let fileManager = FileManager.default
        let fileURL = directory.appendingPathComponent(LogFileConfig.fileName)

        if !fileManager.fileExists(atPath: fileURL.path) {
            fileManager.createFile(atPath: fileURL.path, contents: nil)
        }

        try rotateLogsIfNeeded(activeLogURL: fileURL, fileManager: fileManager)

        let logLine = formattedLogLine(level: level, tag: tag, message: message)
        guard let data = logLine.data(using: .utf8) else { return }

        let handle = try FileHandle(forWritingTo: fileURL)
        defer { try? handle.close() }

        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }

    private func ensureLogDirectory() throws -> URL {
        let cacheDirectory = try FileManager.default.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let logDirectory = cacheDirectory.appendingPathComponent(
            LogFileConfig.directoryName, isDirectory: true)

        if !FileManager.default.fileExists(atPath: logDirectory.path) {
            try FileManager.default.createDirectory(
                at: logDirectory, withIntermediateDirectories: true, attributes: nil)
        }

        return logDirectory
    }

    private func rotateLogsIfNeeded(activeLogURL: URL, fileManager: FileManager) throws {
        let attributes = try? fileManager.attributesOfItem(atPath: activeLogURL.path)
        let fileSize = (attributes?[.size] as? NSNumber)?.intValue ?? 0

        if fileSize < LogFileConfig.maxFileSizeBytes {
            return
        }

        for index in stride(from: LogFileConfig.maxFiles, through: 1, by: -1) {
            let sourceName =
                index == 1
                ? LogFileConfig.fileName : "\(LogFileConfig.fileName).\(index - 1)"
            let sourceURL = activeLogURL.deletingLastPathComponent().appendingPathComponent(
                sourceName)
            if !fileManager.fileExists(atPath: sourceURL.path) {
                continue
            }

            let destinationURL = activeLogURL.deletingLastPathComponent().appendingPathComponent(
                "\(LogFileConfig.fileName).\(index)")
            if fileManager.fileExists(atPath: destinationURL.path) {
                try? fileManager.removeItem(at: destinationURL)
            }

            try fileManager.moveItem(at: sourceURL, to: destinationURL)
        }

        if fileManager.fileExists(atPath: activeLogURL.path) {
            try? fileManager.removeItem(at: activeLogURL)
        }

        fileManager.createFile(atPath: activeLogURL.path, contents: nil)
    }

    private func formattedLogLine(level: String, tag: String, message: String) -> String {
        let levelSymbol = mapLevelSymbol(from: level)
        let timestamp = LogFileConfig.timestampFormatter.string(from: Date())
        let cleanedMessage = sanitizeMessage(message)
        return "\(timestamp) \(levelSymbol) [\(tag)] \(cleanedMessage)\n"
    }

    private func sanitizeMessage(_ message: String) -> String {
        return message.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(
            of: "\n", with: "\n  ")
    }

    private func mapLevelSymbol(from level: String) -> String {
        switch level.lowercased() {
        case "verbose":
            return "V"
        case "debug":
            return "D"
        case "info":
            return "I"
        case "warn":
            return "W"
        case "error":
            return "E"
        default:
            return "I"
        }
    }

    private func collectSystemLogs() throws -> [String] {
        let store = try OSLogStore(scope: .currentProcessIdentifier)
        let position = store.position(date: Date().addingTimeInterval(-3600 * 24))
        let predicate = NSPredicate(format: "subsystem == %@", "com.nitro.ark")
        let entries = try store.getEntries(at: position, matching: predicate)
            .compactMap { $0 as? OSLogEntryLog }
            .sorted { $0.date < $1.date }

        let formatter = LogFileConfig.timestampFormatter
        var lines: [String] = []

        for entry in entries {
            let symbol: String
            switch entry.level {
            case .debug: symbol = "D"
            case .info: symbol = "I"
            case .notice: symbol = "N"
            case .error: symbol = "E"
            case .fault: symbol = "F"
            default: symbol = "I"
            }

            let formatted =
                "\(formatter.string(from: entry.date)) \(symbol) [NitroArk] \(entry.composedMessage)"
            lines.append(formatted)
            if lines.count > LogFileConfig.maxLines {
                lines.removeFirst(lines.count - LogFileConfig.maxLines)
            }
        }

        return lines
    }
}
