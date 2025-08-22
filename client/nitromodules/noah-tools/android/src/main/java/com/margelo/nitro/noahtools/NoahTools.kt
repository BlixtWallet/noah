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
import android.util.Base64
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.SecretKeyFactory
import java.security.MessageDigest

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
  
   override fun encryptBackup(backupPath: String, seedphrase: String): Promise<String> {
     return Promise.async {
       try {
         // Read backup file
         val backupData = File(backupPath).readBytes()
         // Derive key from seedphrase using PBKDF2
         val salt = deriveSalt(seedphrase)
         val key = deriveKey(seedphrase, salt)
         // Generate random IV
         val iv = ByteArray(12)
         SecureRandom().nextBytes(iv)
         // Encrypt using AES-256-GCM
         val cipher = Cipher.getInstance("AES/GCM/NoPadding")
         val secretKey = SecretKeySpec(key, "AES")
         val gcmSpec = GCMParameterSpec(128, iv)
         cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)
         val encryptedData = cipher.doFinal(backupData)
         // Combine IV + encrypted data (GCM includes auth tag)
         val result = iv + encryptedData
         // Return base64 encoded
         return@async Base64.encodeToString(result, Base64.NO_WRAP)
       } catch (e: Exception) {
         throw Exception("Failed to encrypt backup: ${e.message}", e)
       }
     }
   }
  
   override fun decryptBackup(encryptedData: String, seedphrase: String, outputPath: String): Promise<String> {
     return Promise.async {
       try {
         // Decode base64
         val data = Base64.decode(encryptedData, Base64.NO_WRAP)
         // Extract IV and ciphertext
         val iv = data.sliceArray(0..11)
         val ciphertext = data.sliceArray(12 until data.size)
         // Derive key from seedphrase
         val salt = deriveSalt(seedphrase)
         val key = deriveKey(seedphrase, salt)
         // Decrypt using AES-256-GCM
         val cipher = Cipher.getInstance("AES/GCM/NoPadding")
         val secretKey = SecretKeySpec(key, "AES")
         val gcmSpec = GCMParameterSpec(128, iv)
         cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
         val decryptedData = cipher.doFinal(ciphertext)
         // Write to output path
         File(outputPath).writeBytes(decryptedData)
         return@async outputPath
       } catch (e: Exception) {
         throw Exception("Failed to decrypt backup: ${e.message}", e)
       }
     }
   }
  
   private fun deriveKey(seedphrase: String, salt: ByteArray): ByteArray {
     val spec = PBEKeySpec(seedphrase.toCharArray(), salt, 10000, 256)
     val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
     return factory.generateSecret(spec).encoded
   }
  
   private fun deriveSalt(seedphrase: String): ByteArray {
     // Use first 16 bytes of SHA256 hash of seedphrase as deterministic salt
     val digest = MessageDigest.getInstance("SHA-256")
     val hash = digest.digest(seedphrase.toByteArray())
     return hash.sliceArray(0..15)
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
          val buffer = ByteArray(4096)
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
