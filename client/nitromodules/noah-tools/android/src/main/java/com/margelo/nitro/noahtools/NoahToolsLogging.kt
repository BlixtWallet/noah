package com.margelo.nitro.noahtools

import android.content.Context
import android.os.Process
import android.util.Log
import com.margelo.nitro.core.Promise
import java.io.BufferedReader
import java.io.InputStreamReader

object NoahToolsLogging {
    private const val logTag = "com.noah.app"

    fun performNativeLog(level: String, tag: String, message: String) {
        val logMessage = "[$tag] $message"

        when (level.lowercase()) {
            "verbose" -> Log.v(logTag, logMessage)
            "debug" -> Log.d(logTag, logMessage)
            "info" -> Log.i(logTag, logMessage)
            "warn" -> Log.w(logTag, logMessage)
            "error" -> Log.e(logTag, logMessage)
            else -> Log.i(logTag, logMessage)
        }
    }

    fun getApplicationContext(): Context? {
        return try {
            val activityThread = Class.forName("android.app.ActivityThread")
            val currentApplication = activityThread.getMethod("currentApplication")
            currentApplication.invoke(null) as? Context
        } catch (e: Exception) {
            Log.e(logTag, "Failed to get application context", e)
            null
        }
    }

    fun performGetAppVariant(): String {
        try {
            val buildConfigClass = Class.forName("com.noahwallet.BuildConfig")
            val field = buildConfigClass.getField("APP_VARIANT")
            val appVariant = field.get(null) as? String
            if (appVariant != null) {
                return appVariant
            }
        } catch (e: Exception) {
            // Ignore and fall through to error
        }
        throw Error("NoahTools: Can't find BuildConfig field APP_VARIANT. Is the current app variant properly set?")
    }

    fun performGetAppLogs(): Promise<Array<String>> {
        return Promise.async {
            val logcat = ArrayDeque<String>(2000)
            val pid = Process.myPid().toString()
            try {
                val process = Runtime.getRuntime().exec("logcat -d -v threadtime")
                val bufferedReader = BufferedReader(InputStreamReader(process.inputStream))

                var line: String?
                while (bufferedReader.readLine().also { line = it } != null) {
                    if (line!!.contains(pid) &&
                        (line!!.contains("NitroArk") || line!!.contains(logTag)) &&
                        !Regex("\\s+V\\s+").containsMatchIn(line!!)) {

                        // More robust continuation detection
                        // Check for typical logcat format: "MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE"
                        val isMainLogLine = line!!.matches(Regex("^\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\.\\d{3}\\s+\\d+\\s+\\d+\\s+[VDIWEF]\\s+\\w+:.*"))

                        // If it doesn't match the main format, it's likely a continuation line
                        val isContinuation = !isMainLogLine && logcat.isNotEmpty()

                        if (isContinuation) {
                            // Append to the last log entry, preserving original formatting
                            val lastEntry = logcat.removeLast()
                            // Keep the original line as-is to preserve indentation and formatting
                            logcat.addLast("$lastEntry\n$line")
                        } else {
                            // Add as new log entry
                            logcat.addLast(line!!)
                            if (logcat.size > 2000) {
                                logcat.removeFirst()
                            }
                        }
                    }
                }
                process.waitFor()
            } catch (e: Exception) {
                throw Exception("Failed to read logcat: ${e.message}")
            }
            return@async logcat.toTypedArray()
        }
    }
}
