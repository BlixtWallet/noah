package com.margelo.nitro.noahtools

import android.app.Application
import android.os.Process
import android.content.Context
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.core.Promise
import java.lang.reflect.Method
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.BufferedReader
import java.io.InputStreamReader
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit

class NoahTools : HybridNoahToolsSpec() {

  companion object {
    private const val TAG = "NoahTools"
    private const val FORMAT_VERSION: Byte = 1
    private const val SALT_LENGTH = 16
    private const val IV_LENGTH = 12
    private const val TAG_LENGTH = 16
    private const val KEY_LENGTH = 256
    private const val PBKDF2_ITERATIONS = 600_000
    private const val GCM_TAG_LENGTH = 128
    private const val BUFFER_SIZE = 8192
    
    // OkHttp client for background requests
    private val backgroundHttpClient = OkHttpClient.Builder()
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .writeTimeout(30, TimeUnit.SECONDS)
      .retryOnConnectionFailure(false)
      .build()
  }

  override fun nativePost(
    url: String,
    body: String,
    headers: Map<String, String>,
    timeoutSeconds: Double
  ): Promise<HttpResponse> {
    return Promise.async {
      try {
        Log.d(TAG, "Starting background POST request to: $url")
        
        // Create request body
        val mediaType = "application/json".toMediaType()
        val requestBody = body.toRequestBody(mediaType)
        
        // Build request with headers
        val requestBuilder = Request.Builder()
          .url(url)
          .post(requestBody)
        
        // Add headers
        headers.forEach { (key, value) ->
          requestBuilder.addHeader(key, value)
        }
        
        val request = requestBuilder.build()
        
        // Create a client with custom timeout for this specific request
        val client = backgroundHttpClient.newBuilder()
          .connectTimeout(timeoutSeconds.toLong(), TimeUnit.SECONDS)
          .readTimeout(timeoutSeconds.toLong(), TimeUnit.SECONDS)
          .writeTimeout(timeoutSeconds.toLong(), TimeUnit.SECONDS)
          .build()
        
        // Execute the request
        val response = client.newCall(request).execute()
        
        // Extract response data
        val responseBody = response.body?.string() ?: ""
        val responseHeaders = mutableMapOf<String, String>()
        
        response.headers.forEach { pair ->
          responseHeaders[pair.first] = pair.second
        }
        
        Log.d(TAG, "Background request completed with status: ${response.code}")
        
        return@async HttpResponse(
          status = response.code.toDouble(),
          body = responseBody,
          headers = responseHeaders
        )
      } catch (e: Exception) {
        Log.e(TAG, "Background request failed", e)
        throw Exception("Background request failed: ${e.message}", e)
      }
    }
  }
  
  private fun getApplicationContext(): Context? {
    return try {
      val activityThread = Class.forName("android.app.ActivityThread")
      val currentApplication = activityThread.getMethod("currentApplication")
      currentApplication.invoke(null) as? Context
    } catch (e: Exception) {
      Log.e(TAG, "Failed to get application context", e)
      null
    }
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
    throw Error("NoahTools: Can't find BuildConfig field APP_VARIANT. Is the current app variant properly set?")
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

  override fun createBackup(mnemonic: String): Promise<String> {
    return Promise.async {
      var backupStagingPath: File? = null
      var outputZipPath: File? = null
      
      try {
        Log.d(TAG, "Starting backup creation with mnemonic length: ${mnemonic.length}")
        
        if (mnemonic.isBlank()) {
          throw IllegalArgumentException("Mnemonic cannot be empty")
        }
        
        Log.d(TAG, "Mnemonic validation passed")
        val appVariant = getAppVariant()
        Log.d(TAG, "App variant: $appVariant")
        
        Log.d(TAG, "Getting directories...")
        
        // For Nitro modules, we need to get the application context
        val appContext = getApplicationContext()
        Log.d(TAG, "Application context is null: ${appContext == null}")
        
        if (appContext == null) {
          throw IllegalStateException("No application context available")
        }
        
        val documentDirectory = appContext.filesDir
        Log.d(TAG, "Document directory: ${documentDirectory?.absolutePath ?: "null"}")
        val cacheDirectory = appContext.cacheDir
        Log.d(TAG, "Cache directory: ${cacheDirectory?.absolutePath ?: "null"}")
        
        if (documentDirectory == null) {
          throw IllegalStateException("Document directory is null")
        }
        if (cacheDirectory == null) {
          throw IllegalStateException("Cache directory is null")
        }

        backupStagingPath = File(cacheDirectory, "backup_staging")
        outputZipPath = File(cacheDirectory, "noah_backup_${System.currentTimeMillis()}.zip")
        Log.d(TAG, "Staging path: ${backupStagingPath.absolutePath}")
        Log.d(TAG, "Output zip path: ${outputZipPath.absolutePath}")

        // 1. Clean up and create staging directory
        Log.d(TAG, "Cleaning and creating staging directory at ${backupStagingPath.absolutePath}")
        if (backupStagingPath.exists()) {
          backupStagingPath.deleteRecursively()
        }
        backupStagingPath.mkdirs()

        // 2. Define source paths
        val dataPath = File(documentDirectory, "noah-data-${appVariant}")
        Log.d(TAG, "Data path: ${dataPath.absolutePath}")

        // 3. Copy directories to staging
        if (dataPath.exists()) {
          Log.d(TAG, "Copying data directory")
          dataPath.copyRecursively(File(backupStagingPath, "noah-data-${appVariant}"))
        } else {
          Log.w(TAG, "Data directory not found")
        }

        // 4. Zip the staging directory
        Log.d(TAG, "Zipping the staging directory to ${outputZipPath.absolutePath}")
        ZipOutputStream(FileOutputStream(outputZipPath)).use { zipOut ->
          zipDirectory(backupStagingPath, backupStagingPath.name, zipOut)
        }

        // 5. Encrypt the zip file
        Log.d(TAG, "Encrypting the zip file")
        val backupData = outputZipPath.readBytes()
        val encryptedBackup = encrypt(backupData, mnemonic)
        Log.d(TAG, "Encryption complete, returning Base64 encoded string")

        return@async Base64.encodeToString(encryptedBackup, Base64.NO_WRAP)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to create backup", e)
        throw Exception("Failed to create backup: ${e.message}", e)
      } finally {
        // 6. Clean up staging and temporary zip
        Log.d(TAG, "Cleaning up temporary files")
        backupStagingPath?.let { if (it.exists()) it.deleteRecursively() }
        outputZipPath?.let { if (it.exists()) it.delete() }
      }
    }
  }

  override fun restoreBackup(encryptedData: String, mnemonic: String): Promise<Boolean> {
    return Promise.async {
      val appVariant = getAppVariant()
      
      val appContext = getApplicationContext()
        ?: throw IllegalStateException("No application context available")
      
      val documentDirectory = appContext.filesDir
      val cacheDirectory = appContext.cacheDir

      val tempZipPath = File(cacheDirectory, "decrypted_backup.zip")
      val unzipDirectory = File(cacheDirectory, "restored_backup")

      try {
        // 1. Decrypt the data
        val decodedData = Base64.decode(encryptedData, Base64.NO_WRAP)
        val decryptedData = decrypt(decodedData, mnemonic)

        // 2. Write decrypted data to a temporary zip file
        tempZipPath.writeBytes(decryptedData)

        // 3. Unzip the file
        unzipFile(tempZipPath.absolutePath, unzipDirectory.absolutePath)

        // 4. Define source and destination paths for restore
        val dataSourcePath = File(unzipDirectory, "backup_staging/noah-data-${appVariant}")

        val dataDestPath = File(documentDirectory, "noah-data-${appVariant}")

        // 5. Clean up existing directories at destination
        if (dataDestPath.exists()) {
          dataDestPath.deleteRecursively()
        }

        // 6. Move files from unzipped backup to final destination
        if (dataSourcePath.exists()) {
          if (!dataSourcePath.renameTo(dataDestPath)) {
            throw Exception("Failed to move noah-data directory")
          }
        }

        return@async true
      } catch (e: Exception) {
        throw Exception("Failed to restore backup: ${e.message}", e)
      } finally {
        // 7. Clean up temporary files
        if (tempZipPath.exists()) {
          tempZipPath.delete()
        }
        if (unzipDirectory.exists()) {
          unzipDirectory.deleteRecursively()
        }
      }
    }
  }

  private fun encrypt(data: ByteArray, mnemonic: String): ByteArray {
    if (mnemonic.isBlank()) {
      throw IllegalArgumentException("Mnemonic cannot be empty")
    }

    val salt = generateRandomBytes(SALT_LENGTH)
    val key = deriveKey(mnemonic, salt, PBKDF2_ITERATIONS)
    val iv = generateRandomBytes(IV_LENGTH)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    val secretKey = SecretKeySpec(key, "AES")
    val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
    cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)

    val encryptedData = cipher.doFinal(data)

    val outputSize = 1 + SALT_LENGTH + IV_LENGTH + encryptedData.size
    return ByteBuffer.allocate(outputSize).apply {
      put(FORMAT_VERSION)
      put(salt)
      put(iv)
      put(encryptedData)
    }.array()
  }

  private fun decrypt(data: ByteArray, mnemonic: String): ByteArray {
    if (mnemonic.isBlank()) {
      throw IllegalArgumentException("Mnemonic cannot be empty")
    }
    if (data.size < 1 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw Exception("Invalid encrypted data format: too short")
    }

    val buffer = ByteBuffer.wrap(data)
    val version = buffer.get()
    if (version != FORMAT_VERSION) {
      throw Exception("Unsupported encryption format version: $version")
    }

    val salt = ByteArray(SALT_LENGTH)
    buffer.get(salt)
    val iv = ByteArray(IV_LENGTH)
    buffer.get(iv)
    val ciphertext = ByteArray(buffer.remaining())
    buffer.get(ciphertext)

    val key = deriveKey(mnemonic, salt, PBKDF2_ITERATIONS)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    val secretKey = SecretKeySpec(key, "AES")
    val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
    cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)

    return try {
      cipher.doFinal(ciphertext)
    } catch (e: Exception) {
      key.fill(0)
      throw Exception("Decryption failed: Invalid mnemonic or corrupted data", e)
    }
  }

  private fun deriveKey(mnemonic: String, salt: ByteArray, iterations: Int): ByteArray {
    val spec = PBEKeySpec(mnemonic.toCharArray(), salt, iterations, KEY_LENGTH)
    return try {
      val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
      factory.generateSecret(spec).encoded
    } finally {
      spec.clearPassword()
    }
  }

  private fun generateRandomBytes(length: Int): ByteArray {
    val bytes = ByteArray(length)
    SecureRandom().nextBytes(bytes)
    return bytes
  }

  private fun validateZipEntryName(name: String): String {
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

  private fun unzipFile(zipPath: String, outputDirectory: String) {
    val zipFile = File(zipPath)
    if (!zipFile.exists()) {
      throw Exception("Zip file does not exist: $zipPath")
    }

    val outputDir = File(outputDirectory)
    if (outputDir.exists()) {
      outputDir.deleteRecursively()
    }
    outputDir.mkdirs()

    ZipInputStream(FileInputStream(zipFile)).use { zipIn ->
      var entry: ZipEntry? = zipIn.nextEntry
      while (entry != null) {
        val entryName = validateZipEntryName(entry.name)
        val entryFile = File(outputDir, entryName)

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
  }
}
