package com.margelo.nitro.noahtools

import android.os.Process
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.ArrayDeque
import java.util.regex.Pattern

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
          if (line!!.contains(pid) && (line!!.contains("NitroArk") || line!!.contains("ReactNativeJS"))) {
            val formatted = formatLogLine(line!!)  // Optional: Format like iOS
            logcat.addLast(formatted)
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

  // Optional: Parse and format logcat line to match iOS style (e.g., "[timestamp] [tag] message")
  private fun formatLogLine(line: String): String {
    // Simple regex to extract parts (adjust based on your log format)
    val pattern = Pattern.compile("(\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\s+\\d+\\s+(\\d+)\\s+(\\w)\\s+(\\w+)\\s+:\\s+(.*)")
    val matcher = pattern.matcher(line)
    if (matcher.find()) {
      val timestamp = matcher.group(1)
      // val pid = matcher.group(2)  // Unused
      val level = matcher.group(3)  // e.g., I for Info, D for Debug
      val tag = matcher.group(4)    // e.g., category/tag like "bark_cpp"
      val message = matcher.group(5)
      return "[$timestamp] [$tag/$level] $message"
    }
    return line  // Fallback to raw line if parsing fails
  }
}
