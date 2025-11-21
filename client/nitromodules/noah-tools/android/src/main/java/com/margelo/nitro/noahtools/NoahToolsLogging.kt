package com.margelo.nitro.noahtools

import android.content.Context
import android.os.Process
import android.util.Log
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.io.BufferedReader
import java.io.File
import java.io.FileWriter
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

object NoahToolsLogging {
    private const val logTag = "com.noah.app"
    private const val logDirectoryName = "noah_logs"
    private const val logFileName = "noah.log"
    private const val maxLogFileSizeBytes = 512 * 1024 // 512 KB for each segment
    private const val maxLogFiles = 4
    private const val maxLogLines = 4000
    private val fileTimestampFormatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val logLock = Any()

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

        persistLogToFile(level, tag, message)
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
            val context = NitroModules.applicationContext
                ?: throw Exception("NoahTools: Missing application context for reading logs")
            val logDir = File(context.cacheDir, logDirectoryName)
            val boundedLogs = ArrayDeque<String>(maxLogLines)

            try {
                synchronized(logLock) {
                    if (!logDir.exists()) {
                        return@async emptyArray()
                    }

                    val logFiles = logDir
                        .listFiles()
                        ?.filter { it.isFile && it.name.startsWith(logFileName) }
                        ?.sortedBy { it.lastModified() }
                        ?: emptyList()

                    logFiles.forEach { file ->
                        BufferedReader(file.reader()).useLines { lines ->
                            lines.forEach { line ->
                                if (boundedLogs.size >= maxLogLines) {
                                    boundedLogs.removeFirst()
                                }
                                boundedLogs.addLast(line)
                            }
                        }
                    }
                }

                collectLogcatEntries()?.forEach { line ->
                    if (boundedLogs.size >= maxLogLines) {
                        boundedLogs.removeFirst()
                    }
                    boundedLogs.addLast(line)
                }
            } catch (e: Exception) {
                throw Exception("Failed to load persisted logs: ${e.message}")
            }
            return@async boundedLogs.toTypedArray()
        }
    }

    private fun persistLogToFile(level: String, tag: String, message: String) {
        val context = NitroModules.applicationContext
            ?: return

        val logDir = File(context.cacheDir, logDirectoryName)
        if (!logDir.exists() && !logDir.mkdirs()) {
            Log.w(logTag, "Unable to create log directory at ${logDir.absolutePath}")
            return
        }

        val sanitizedMessage = message.trimEnd().replace("\n", "\n  ")
        val levelSymbol = mapLevelSymbol(level)
        val logLine = "${fileTimestampFormatter.format(Date())} $levelSymbol [$tag] $sanitizedMessage\n"

        synchronized(logLock) {
            try {
                rotateLogsIfNecessary(logDir)
                val logFile = File(logDir, logFileName)
                FileWriter(logFile, true).use { writer ->
                    writer.append(logLine)
                }
            } catch (e: Exception) {
                Log.w(logTag, "Failed to persist log to file: ${e.message}")
            }
        }
    }

    private fun collectLogcatEntries(): List<String>? {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-v", "threadtime"))
            val pid = Process.myPid().toString()
            val collected = mutableListOf<String>()

            BufferedReader(InputStreamReader(process.inputStream)).useLines { lines ->
                lines.forEach { line ->
                    val containsProcess = line.contains(pid)
                    val isRelevantTag = line.contains("NitroArk") || line.contains(logTag)
                    if (containsProcess && isRelevantTag) {
                        collected.add(line)
                        if (collected.size > maxLogLines) {
                            collected.removeAt(0)
                        }
                    }
                }
            }

            process.waitFor()
            collected
        } catch (e: Exception) {
            Log.w(logTag, "Failed to fetch logcat entries: ${e.message}")
            null
        }
    }

    private fun rotateLogsIfNecessary(logDir: File) {
        val logFile = File(logDir, logFileName)
        if (!logFile.exists() || logFile.length() < maxLogFileSizeBytes) {
            return
        }

        for (index in maxLogFiles downTo 1) {
            val source = File(
                logDir,
                if (index == 1) logFileName else "$logFileName.${index - 1}"
            )
            if (!source.exists()) continue

            val target = File(logDir, "$logFileName.$index")
            if (target.exists()) {
                target.delete()
            }
            source.renameTo(target)
        }

        logFile.delete()
        logFile.createNewFile()
    }

    private fun mapLevelSymbol(level: String): String {
        return when (level.lowercase()) {
            "verbose" -> "V"
            "debug" -> "D"
            "info" -> "I"
            "warn" -> "W"
            "error" -> "E"
            else -> "I"
        }
    }
}
