package com.margelo.nitro.noahtools

import com.margelo.nitro.core.Promise

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
}
