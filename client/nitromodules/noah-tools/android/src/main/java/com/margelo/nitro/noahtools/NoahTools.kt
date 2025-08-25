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
import java.util.zip.ZipInputStream
import android.util.Base64
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.SecretKeyFactory
import java.nio.ByteBuffer
import java.nio.ByteOrder

class NoahTools(private val context: ReactApplicationContext) : HybridNoahToolsSpec() {

  companion object {
    // Encryption format version for future compatibility
    private const val FORMAT_VERSION: Byte = 1
    
    // Security parameters
    private const val SALT_LENGTH = 16
    private const val IV_LENGTH = 12
    private const val TAG_LENGTH = 16
    private const val KEY_LENGTH = 256
    private const val PBKDF2_ITERATIONS = 600_000  // Increased from 10,000
    private const val GCM_TAG_LENGTH = 128
    
    // Buffer sizes
    private const val BUFFER_SIZE = 8192  // Increased from 4096 for better performance
  }

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
      val logcat = ArrayDeque<String>(2000)
      val pid = Process.myPid().toString()
      try {
        val process = Runtime.getRuntime().exec("logcat -d -v threadtime")
        val bufferedReader = BufferedReader(InputStreamReader(process.inputStream))

        var line: String?
        while (bufferedReader.readLine().also { line = it } != null) {
          if (line!!.contains(pid) &&
              (line!!.contains("NitroArk") || line!!.contains("ReactNativeJS")) &&
              !Regex("\\s+V\\s+").containsMatchIn(line!!)) {
            logcat.addLast(line!!)
            if (logcat.size > 2000) {
              logcat.removeFirst()
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

  override fun unzipFile(zipPath: String, outputDirectory: String): Promise<String> {
    return Promise.async {
      try {
        val zipFile = File(zipPath)
        if (!zipFile.exists()) {
          throw Exception("Zip file does not exist: $zipPath")
        }

        val outputDir = File(outputDirectory)
        
        // Security: Clear output directory first to prevent path traversal attacks
        if (outputDir.exists()) {
          outputDir.deleteRecursively()
        }
        outputDir.mkdirs()

        ZipInputStream(FileInputStream(zipFile)).use { zipIn ->
          var entry: ZipEntry? = zipIn.nextEntry
          while (entry != null) {
            // Security: Validate entry name to prevent path traversal
            val entryName = validateZipEntryName(entry.name)
            val entryFile = File(outputDir, entryName)
            
            // Ensure the file is within the output directory
            if (!entryFile.canonicalPath.startsWith(outputDir.canonicalPath)) {
              throw SecurityException("Zip entry is outside of target directory: ${entry.name}")
            }
            
            if (entry.isDirectory) {
              entryFile.mkdirs()
            } else {
              entryFile.parentFile?.mkdirs()
              FileOutputStream(entryFile).use { output ->
                val buffer = ByteArray(BUFFER_SIZE)
                var length: Int
                while (zipIn.read(buffer).also { length = it } > 0) {
                  output.write(buffer, 0, length)
                }
              }
            }
            zipIn.closeEntry()
            entry = zipIn.nextEntry
          }
        }

        return@async outputDirectory
      } catch (e: Exception) {
        throw Exception("Failed to unzip file: ${e.message}")
      }
    }
  }
  
  override fun encryptBackup(backupPath: String, mnemonic: String): Promise<String> {
    return Promise.async {
      try {
        // Validate input
        if (mnemonic.isBlank()) {
          throw IllegalArgumentException("mnemonic cannot be empty")
        }
        
        // Read backup file
        val backupFile = File(backupPath)
        if (!backupFile.exists()) {
          throw Exception("Backup file does not exist: $backupPath")
        }
        
        val backupData = backupFile.readBytes()
        
        // Generate RANDOM salt (not deterministic!)
        val salt = generateRandomBytes(SALT_LENGTH)
        
        // Derive key from mnemonic using PBKDF2 with high iterations
        val key = deriveKey(mnemonic, salt, PBKDF2_ITERATIONS)
        
        // Generate random IV
        val iv = generateRandomBytes(IV_LENGTH)
        
        // Encrypt using AES-256-GCM
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)
        
        val encryptedData = cipher.doFinal(backupData)
        
        // Build output format: version | salt | iv | ciphertext (includes auth tag)
        val outputSize = 1 + SALT_LENGTH + IV_LENGTH + encryptedData.size
        val output = ByteBuffer.allocate(outputSize).apply {
          put(FORMAT_VERSION)      // 1 byte version
          put(salt)                // 16 bytes salt
          put(iv)                  // 12 bytes IV
          put(encryptedData)       // encrypted data + 16 bytes auth tag
        }.array()
        
        // Clear sensitive data from memory
        backupData.fill(0)
        key.fill(0)
        
        // Return base64 encoded
        return@async Base64.encodeToString(output, Base64.NO_WRAP)
        
      } catch (e: Exception) {
        throw Exception("Failed to encrypt backup: ${e.message}", e)
      }
    }
  }
  
  override fun decryptBackup(encryptedData: String, mnemonic: String, outputPath: String): Promise<String> {
    return Promise.async {
      try {
        // Validate input
        if (mnemonic.isBlank()) {
          throw IllegalArgumentException("mnemonic cannot be empty")
        }
        
        // Decode base64
        val data = Base64.decode(encryptedData, Base64.NO_WRAP)
        
        // Check minimum size (version + salt + iv + min ciphertext + tag)
        if (data.size < 1 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
          throw Exception("Invalid encrypted data format: too short")
        }
        
        // Parse the encrypted data format
        val buffer = ByteBuffer.wrap(data)
        
        // Check version
        val version = buffer.get()
        if (version != FORMAT_VERSION) {
          throw Exception("Unsupported encryption format version: $version")
        }
        
        // Extract components
        val salt = ByteArray(SALT_LENGTH)
        buffer.get(salt)
        
        val iv = ByteArray(IV_LENGTH)
        buffer.get(iv)
        
        val ciphertext = ByteArray(buffer.remaining())
        buffer.get(ciphertext)
        
        // Derive key from mnemonic using the stored salt
        val key = deriveKey(mnemonic, salt, PBKDF2_ITERATIONS)
        
        // Decrypt using AES-256-GCM
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
        
        val decryptedData = try {
          cipher.doFinal(ciphertext)
        } catch (e: Exception) {
          // Clear sensitive data before throwing
          key.fill(0)
          throw Exception("Decryption failed: Invalid mnemonic or corrupted data", e)
        }
        
        // Write to output path
        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        outputFile.writeBytes(decryptedData)
        
        // Clear sensitive data from memory
        key.fill(0)
        decryptedData.fill(0)
        
        return@async outputPath
        
      } catch (e: Exception) {
        throw Exception("Failed to decrypt backup: ${e.message}", e)
      }
    }
  }
  
  private fun deriveKey(mnemonic: String, salt: ByteArray, iterations: Int): ByteArray {
    val spec = PBEKeySpec(mnemonic.toCharArray(), salt, iterations, KEY_LENGTH)
    return try {
      val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
      factory.generateSecret(spec).encoded
    } finally {
      // Clear the password from the spec
      spec.clearPassword()
    }
  }
  
  private fun generateRandomBytes(length: Int): ByteArray {
    val bytes = ByteArray(length)
    SecureRandom().nextBytes(bytes)
    return bytes
  }
  
  private fun validateZipEntryName(name: String): String {
    // Remove any path traversal attempts
    return name.replace("../", "").replace("..\\", "")
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
          val buffer = ByteArray(BUFFER_SIZE)
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
