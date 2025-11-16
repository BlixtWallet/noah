package com.margelo.nitro.noahtools

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.margelo.nitro.core.Promise
import com.margelo.nitro.noahtools.audio.NoahToolsAudio
import com.margelo.nitro.NitroModules

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

    override fun updateWidgetData(
        totalBalance: Double,
        onchainBalance: Double,
        offchainBalance: Double,
        pendingBalance: Double,
        closestExpiryBlocks: Double,
        expiryThreshold: Double,
        appGroup: String
    ) {
        val context = NitroModules.applicationContext ?: return
        val prefs = context.getSharedPreferences(appGroup, Context.MODE_PRIVATE)

        prefs.edit().apply {
            putLong("totalBalance", totalBalance.toLong())
            putLong("onchainBalance", onchainBalance.toLong())
            putLong("offchainBalance", offchainBalance.toLong())
            putLong("pendingBalance", pendingBalance.toLong())
            putLong("closestExpiryBlocks", closestExpiryBlocks.toLong())
            putLong("expiryThreshold", expiryThreshold.toLong())
            putLong("lastUpdated", System.currentTimeMillis())
            apply()
        }

        // Trigger widget update by sending a custom broadcast
        // Using custom action to prevent other apps from triggering updates
        val intent = Intent("com.noahwallet.action.WIDGET_DATA_CHANGED")
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
    }
}
