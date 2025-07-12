package com.margelo.nitro.noahtools

import android.os.Process
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.ArrayDeque

class NoahTools(private val context: ReactApplicationContext) : HybridNoahToolsSpec() {

  override fun getAppVariant(): String {
    try {
      val buildConfigClass = Class.forName("com.anonymous.noah.BuildConfig")
      val field = buildConfigClass.getField("APP_VARIANT")
      val appVariant = field.get(null) as? String
      if (appVariant != null) {
        return appVariant
      }
    } catch (e: Exception) {
      // Ignore and fall through to error
    }
    throw Error(
      "NoahTools: Can't find BuildConfig field APP_VARIANT. Is the current app variant properly set?"
    )
  }

  override fun getAppLogs(): Promise<Array<String>> {
    return Promise.async {
      val logcat = ArrayDeque<String>(1000)  // Deque for efficient last-N lines
      val pid = Process.myPid().toString()  // Current process PID for filtering
      try {
        // Exec logcat to dump all logs with timestamps (-d = dump and exit, -v threadtime = format with time/thread)
        val process = Runtime.getRuntime().exec("logcat -d -v threadtime")
        val bufferedReader = BufferedReader(InputStreamReader(process.inputStream))

        var line: String?
        while (bufferedReader.readLine().also { line = it } != null) {
          if (line!!.contains(pid) &&
              (line!!.contains("NitroArk") || line!!.contains("ReactNativeJS")) &&
              !Regex("\\s+V\\s+").containsMatchIn(line!!)) {
            logcat.addLast(line!!)
            if (logcat.size > 1000) {
              logcat.removeFirst()  // Keep only last 1000
            }
          }
        }
        process.waitFor()  // Ensure process completes
      } catch (e: Exception) {
        throw Exception("Failed to read logcat: ${e.message}")
      }
      return@async logcat.toTypedArray()
    }
  }

}
