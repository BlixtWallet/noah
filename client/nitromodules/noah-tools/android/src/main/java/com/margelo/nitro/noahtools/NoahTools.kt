package com.margelo.nitro.noahtools

import com.margelo.nitro.core.Promise
import com.margelo.nitro.noahtools.audio.NoahToolsAudio

class NoahTools : HybridNoahToolsSpec() {

    override fun nativePost(
        url: String,
        body: String,
        headers: Map<String, String>,
        timeoutSeconds: Double
    ): Promise<HttpResponse> {
        return NoahToolsHttp.performNativePost(url, body, headers, timeoutSeconds)
    }

    override fun nativeGet(
        url: String,
        headers: Map<String, String>,
        timeoutSeconds: Double
    ): Promise<HttpResponse> {
        return NoahToolsHttp.performNativeGet(url, headers, timeoutSeconds)
    }

    override fun getAppVariant(): String {
        return NoahToolsLogging.performGetAppVariant()
    }

    override fun getAppLogs(): Promise<Array<String>> {
        return NoahToolsLogging.performGetAppLogs()
    }

    override fun createBackup(mnemonic: String): Promise<String> {
        return NoahToolsBackup.performCreateBackup(mnemonic)
    }

    override fun restoreBackup(encryptedData: String, mnemonic: String): Promise<Boolean> {
        return NoahToolsBackup.performRestoreBackup(encryptedData, mnemonic)
    }

    override fun nativeLog(level: String, tag: String, message: String) {
        NoahToolsLogging.performNativeLog(level, tag, message)
    }

    override fun playAudio(filePath: String): Promise<Unit> {
        return NoahToolsAudio.performPlayAudio(filePath)
    }

    override fun pauseAudio() {
        NoahToolsAudio.performPauseAudio()
    }

    override fun stopAudio() {
        NoahToolsAudio.performStopAudio()
    }

    override fun resumeAudio() {
        NoahToolsAudio.performResumeAudio()
    }

    override fun seekAudio(positionSeconds: Double) {
        NoahToolsAudio.performSeekAudio(positionSeconds)
    }

    override fun getAudioDuration(): Double {
        return NoahToolsAudio.performGetAudioDuration()
    }

    override fun getAudioPosition(): Double {
        return NoahToolsAudio.performGetAudioPosition()
    }

    override fun isAudioPlaying(): Boolean {
        return NoahToolsAudio.performIsAudioPlaying()
    }

    override fun saveBalanceForWidget(
        totalBalance: Double,
        onchainBalance: Double,
        offchainBalance: Double,
        pendingBalance: Double,
        appGroup: String
    ) {
        // No-op on Android - widgets not yet supported
    }
}
