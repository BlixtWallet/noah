import CommonCrypto
import CryptoKit
import Foundation
import NitroModules
import OSLog
import ZIPFoundation

class NoahTools: HybridNoahToolsSpec {
    // MARK: - Public API Methods (called by Nitro)

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

    func playAudio(filePath: String) throws -> Promise<Void> {
        return try performPlayAudio(filePath: filePath)
    }

    func pauseAudio() throws {
        try performPauseAudio()
    }

    func stopAudio() throws {
        try performStopAudio()
    }

    func resumeAudio() throws {
        try performResumeAudio()
    }

    func seekAudio(positionSeconds: Double) throws {
        try performSeekAudio(positionSeconds: positionSeconds)
    }

    func getAudioDuration() throws -> Double {
        return try performGetAudioDuration()
    }

    func getAudioPosition() throws -> Double {
        return try performGetAudioPosition()
    }

    func isAudioPlaying() throws -> Bool {
        return try performIsAudioPlaying()
    }
}

// Include the extensions from other files
// Swift will automatically include all .swift files in the same module/target
