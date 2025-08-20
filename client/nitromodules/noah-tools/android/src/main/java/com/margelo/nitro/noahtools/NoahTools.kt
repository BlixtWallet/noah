package com.margelo.nitro.noahtools

import android.os.Process
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.ArrayDeque
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

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
      val logcat = ArrayDeque<String>(2000)  // Deque for efficient last-N lines
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
            if (logcat.size > 2000) {
              logcat.removeFirst()  // Keep only last 2000
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

  override fun zipDirectory(sourceDirectory: String, outputZipPath: String): Promise<String> {
    return Promise.async {
      try {
        val sourceDir = File(sourceDirectory)
        if (!sourceDir.exists() || !sourceDir.isDirectory) {
          throw Exception("Source directory does not exist or is not a directory: $sourceDirectory")
        }

        val outputFile = File(outputZipPath)
        outputFile.parentFile?.mkdirs()

        ZipOutputStream(FileOutputStream(outputFile)).use { zipOut ->
          zipDirectory(sourceDir, sourceDir.name, zipOut)
        }

        return@async outputZipPath
      } catch (e: Exception) {
        throw Exception("Failed to zip directory: ${e.message}")
      }
    }
  }

  private fun zipDirectory(sourceDir: File, baseName: String, zipOut: ZipOutputStream) {
    val files = sourceDir.listFiles() ?: return

    for (file in files) {
      if (file.isDirectory) {
        zipDirectory(file, "$baseName/${file.name}", zipOut)
      } else {
        val entryName = "$baseName/${file.name}"
        val zipEntry = ZipEntry(entryName)
        zipOut.putNextEntry(zipEntry)

        FileInputStream(file).use { fis ->
          val buffer = ByteArray(1024)
          var length: Int
          while (fis.read(buffer).also { length = it } > 0) {
            zipOut.write(buffer, 0, length)
          }
        }
        zipOut.closeEntry()
      }
    }
  }

}
