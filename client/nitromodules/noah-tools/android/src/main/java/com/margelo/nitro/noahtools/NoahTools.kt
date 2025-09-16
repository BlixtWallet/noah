package com.margelo.nitro.noahtools

import android.app.Activity
import android.app.Application
import android.app.PendingIntent
import android.os.Process
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.margelo.nitro.core.Promise
import org.json.JSONObject
import java.lang.reflect.Method
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.BufferedReader
import java.io.InputStreamReader
import java.nio.ByteBuffer
import java.nio.charset.Charset
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

class NoahTools : HybridNoahToolsSpec(), NfcAdapter.ReaderCallback {

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
    private const val NFC_MIME_TYPE = "application/vnd.noah.payment"

    // OkHttp client for background requests
    private val backgroundHttpClient = OkHttpClient.Builder()
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .writeTimeout(30, TimeUnit.SECONDS)
      .retryOnConnectionFailure(false)
      .build()
  }

  private var nfcAdapter: NfcAdapter? = null
  private var currentActivity: Activity? = null
  private var nfcReceivePromise: Promise<String>? = null
  private var nfcSendData: String? = null
  private var isNfcActive = false

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

        // Execute the request and properly close the response
        client.newCall(request).execute().use { response ->
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
        }
      } catch (e: Exception) {
        Log.e(TAG, "Background request failed", e)
        throw Exception("Background request failed: ${e.message}", e)
      }
    }
  }

  override fun nativeGet(
    url: String,
    headers: Map<String, String>,
    timeoutSeconds: Double
  ): Promise<HttpResponse> {
    return Promise.async {
      try {
        Log.d(TAG, "Starting background GET request to: $url")

        // Build request with headers
        val requestBuilder = Request.Builder()
          .url(url)
          .get()

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

        // Execute the request and properly close the response
        client.newCall(request).execute().use { response ->
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
        }
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
          zipIn.closeEntry()
          entry = zipIn.nextEntry
        }
      }
    }
  }

  override fun nativeLog(level: String, tag: String, message: String) {
    val logTag = "ReactNativeJS"
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

  // NFC Methods
  override fun checkNfcStatus(): Promise<NfcStatus> {
    return Promise.async {
      try {
        val context = getApplicationContext()
        if (context == null) {
          return@async NfcStatus(isSupported = false, isEnabled = false)
        }

        val nfcAdapter = NfcAdapter.getDefaultAdapter(context)
        if (nfcAdapter == null) {
          return@async NfcStatus(isSupported = false, isEnabled = false)
        }

        this.nfcAdapter = nfcAdapter
        return@async NfcStatus(
          isSupported = true,
          isEnabled = nfcAdapter.isEnabled
        )
      } catch (e: Exception) {
        Log.e(TAG, "Failed to check NFC status", e)
        return@async NfcStatus(isSupported = false, isEnabled = false)
      }
    }
  }

  override fun startNfcSend(paymentData: String): Promise<Boolean> {
    return Promise.async {
      try {
        Log.d(TAG, "Starting NFC send with data: ${paymentData.length} bytes")
        
        val context = getApplicationContext()
        if (context == null) {
          throw Exception("No application context available")
        }

        if (nfcAdapter == null) {
          nfcAdapter = NfcAdapter.getDefaultAdapter(context)
        }

        if (nfcAdapter == null || !nfcAdapter!!.isEnabled) {
          throw Exception("NFC is not available or not enabled")
        }

        // Store the payment data to send
        nfcSendData = paymentData
        isNfcActive = true

        // Get current activity
        currentActivity = getCurrentActivity()
        if (currentActivity == null) {
          throw Exception("No current activity available")
        }

        // Enable reader mode to send data when another device taps
        Handler(Looper.getMainLooper()).post {
          nfcAdapter?.enableReaderMode(
            currentActivity,
            this,
            NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_NFC_F or
            NfcAdapter.FLAG_READER_NFC_V or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
            null
          )
        }

        Log.d(TAG, "NFC send mode activated")
        return@async true
      } catch (e: Exception) {
        Log.e(TAG, "Failed to start NFC send", e)
        throw Exception("Failed to start NFC send: ${e.message}")
      }
    }
  }

  override fun startNfcReceive(): Promise<String> {
    val promise = Promise<String>()
    
    try {
      Log.d(TAG, "Starting NFC receive mode")
      
      val context = getApplicationContext()
      if (context == null) {
        promise.reject(Exception("No application context available"))
        return promise
      }

      if (nfcAdapter == null) {
        nfcAdapter = NfcAdapter.getDefaultAdapter(context)
      }

      if (nfcAdapter == null || !nfcAdapter!!.isEnabled) {
        promise.reject(Exception("NFC is not available or not enabled"))
        return promise
      }

      isNfcActive = true
      nfcSendData = null // Clear send data

      // Get current activity
      currentActivity = getCurrentActivity()
      if (currentActivity == null) {
        promise.reject(Exception("No current activity available"))
        return promise
      }

      // Store the promise to resolve when data is received
      nfcReceivePromise = promise

      // Enable reader mode to receive data
      Handler(Looper.getMainLooper()).post {
        nfcAdapter?.enableReaderMode(
          currentActivity,
          this,
          NfcAdapter.FLAG_READER_NFC_A or
          NfcAdapter.FLAG_READER_NFC_B or
          NfcAdapter.FLAG_READER_NFC_F or
          NfcAdapter.FLAG_READER_NFC_V,
          null
        )
      }

      Log.d(TAG, "NFC receive mode activated")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start NFC receive", e)
      promise.reject(Exception("Failed to start NFC receive: ${e.message}"))
    }
    
    // Return the promise that will be resolved when data is received
    return promise
  }

  override fun stopNfc() {
    try {
      Log.d(TAG, "Stopping NFC")
      isNfcActive = false
      nfcSendData = null
      nfcReceivePromise = null

      Handler(Looper.getMainLooper()).post {
        currentActivity?.let { activity ->
          nfcAdapter?.disableReaderMode(activity)
        }
      }
      
      currentActivity = null
    } catch (e: Exception) {
      Log.e(TAG, "Failed to stop NFC", e)
    }
  }

  // NFC Reader Callback
  override fun onTagDiscovered(tag: Tag?) {
    if (!isNfcActive || tag == null) {
      return
    }

    try {
      if (nfcSendData != null) {
        // Send mode: write data to the tag
        Log.d(TAG, "NFC tag discovered in send mode")
        writeNdefMessage(tag, nfcSendData!!)
      } else if (nfcReceivePromise != null) {
        // Receive mode: read data from the tag
        Log.d(TAG, "NFC tag discovered in receive mode")
        val data = readNdefMessage(tag)
        if (data != null) {
          nfcReceivePromise?.resolve(data)
          nfcReceivePromise = null
          stopNfc()
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error handling NFC tag", e)
      nfcReceivePromise?.reject(e)
      nfcReceivePromise = null
    }
  }

  private fun writeNdefMessage(tag: Tag, data: String) {
    try {
      val ndefRecord = NdefRecord.createMime(NFC_MIME_TYPE, data.toByteArray(Charset.forName("UTF-8")))
      val ndefMessage = NdefMessage(arrayOf(ndefRecord))

      val ndef = Ndef.get(tag)
      if (ndef != null) {
        ndef.connect()
        if (!ndef.isWritable) {
          throw Exception("NFC tag is not writable")
        }
        if (ndef.maxSize < ndefMessage.toByteArray().size) {
          throw Exception("NFC tag capacity is too small")
        }
        ndef.writeNdefMessage(ndefMessage)
        ndef.close()
        Log.d(TAG, "Successfully wrote NFC message")
      } else {
        // Try to format the tag as NDEF
        val format = NdefFormatable.get(tag)
        if (format != null) {
          format.connect()
          format.format(ndefMessage)
          format.close()
          Log.d(TAG, "Successfully formatted and wrote NFC message")
        } else {
          throw Exception("NFC tag doesn't support NDEF")
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to write NFC message", e)
      throw e
    }
  }

  private fun readNdefMessage(tag: Tag): String? {
    try {
      val ndef = Ndef.get(tag)
      if (ndef == null) {
        Log.w(TAG, "Tag doesn't support NDEF")
        return null
      }

      ndef.connect()
      val ndefMessage = ndef.ndefMessage ?: ndef.cachedNdefMessage
      ndef.close()

      if (ndefMessage == null) {
        Log.w(TAG, "No NDEF message found on tag")
        return null
      }

      for (record in ndefMessage.records) {
        val mimeType = String(record.type, Charset.forName("US-ASCII"))
        if (mimeType == NFC_MIME_TYPE) {
          val payload = String(record.payload, Charset.forName("UTF-8"))
          Log.d(TAG, "Successfully read NFC message: ${payload.length} bytes")
          return payload
        }
      }

      Log.w(TAG, "No matching MIME type found in NDEF message")
      return null
    } catch (e: Exception) {
      Log.e(TAG, "Failed to read NFC message", e)
      throw e
    }
  }

  private fun getCurrentActivity(): Activity? {
    try {
      val activityThreadClass = Class.forName("android.app.ActivityThread")
      val currentActivityThread = activityThreadClass.getMethod("currentActivityThread").invoke(null)
      val activitiesField = activityThreadClass.getDeclaredField("mActivities")
      activitiesField.isAccessible = true
      
      @Suppress("UNCHECKED_CAST")
      val activities = activitiesField.get(currentActivityThread) as? Map<Any, Any>
      if (activities == null || activities.isEmpty()) {
        return null
      }

      for (activityRecord in activities.values) {
        val activityRecordClass = activityRecord.javaClass
        val pausedField = activityRecordClass.getDeclaredField("paused")
        pausedField.isAccessible = true
        if (!pausedField.getBoolean(activityRecord)) {
          val activityField = activityRecordClass.getDeclaredField("activity")
          activityField.isAccessible = true
          return activityField.get(activityRecord) as? Activity
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to get current activity", e)
    }
    return null
  }
}
