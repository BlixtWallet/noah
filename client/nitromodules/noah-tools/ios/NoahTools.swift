import CommonCrypto
import CryptoKit
import Foundation
import NitroModules
import OSLog
import ZIPFoundation

class NoahTools: HybridNoahToolsSpec {
    // MARK: - Public API Methods (called by Nitro)

    func nativePost(url: String, body: String, headers: [String: String], timeoutSeconds: Double)
        throws -> Promise<HttpResponse>
    {
        return try performNativePost(
            url: url, body: body, headers: headers, timeoutSeconds: timeoutSeconds)
    }

    func nativeGet(url: String, headers: [String: String], timeoutSeconds: Double) throws
        -> Promise<HttpResponse>
    {
        return try performNativeGet(url: url, headers: headers, timeoutSeconds: timeoutSeconds)
    }

    func getAppVariant() throws -> String {
        return try performGetAppVariant()
    }

    func getAppLogs() throws -> Promise<[String]> {
        return try performGetAppLogs()
    }

    func createBackup(mnemonic: String) throws -> Promise<String> {
        return try performCreateBackup(mnemonic: mnemonic)
    }

    func restoreBackup(encryptedData: String, mnemonic: String) throws -> Promise<Bool> {
        return try performRestoreBackup(encryptedData: encryptedData, mnemonic: mnemonic)
    }

    func nativeLog(level: String, tag: String, message: String) throws {
        try performNativeLog(level: level, tag: tag, message: message)
    }
}

// Include the extensions from other files
// Swift will automatically include all .swift files in the same module/target
