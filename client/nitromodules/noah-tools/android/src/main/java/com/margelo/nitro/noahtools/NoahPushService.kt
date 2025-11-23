package com.margelo.nitro.noahtools

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import org.unifiedpush.android.connector.FailedReason
import org.json.JSONObject

class NoahPushService : PushService() {

    override fun onMessage(message: PushMessage, instance: String) {
        val messageString = String(message.content)
        Log.d("NoahPushService", "Received message: $messageString")

        try {
            val json = JSONObject(messageString)
            val type = json.optString("notification_type")

            if (type == "maintenance") {
                Log.i("NoahPushService", "Handling maintenance notification via JNI")
                handleMaintenance(this)
            }
        } catch (e: Exception) {
            Log.e("NoahPushService", "Failed to parse message", e)
        }
    }

    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        Log.i("NoahPushService", "New Endpoint: ${endpoint.url}")
        val prefs = getSharedPreferences("noah_unified_push", Context.MODE_PRIVATE)
        // Save per-instance to avoid collisions between app variants, and keep legacy key for older reads.
        prefs.edit()
            .putString("endpoint_${instance}", endpoint.url)
            .putString("endpoint", endpoint.url)
            .apply()
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        Log.e("NoahPushService", "Registration failed: $reason")
    }

    override fun onUnregistered(instance: String) {
        Log.i("NoahPushService", "Unregistered")
    }

    private fun handleMaintenance(context: Context) {
        try {
            val clazz = Class.forName("com.margelo.nitro.nitroark.NitroArkNative")
            val instance = clazz.getField("INSTANCE").get(null) ?: return

            val isLoadedMethod = clazz.getMethod("isWalletLoaded")
            val isLoaded = isLoadedMethod.invoke(instance) as Boolean

            if (!isLoaded) {
                Log.i("NoahPushService", "Wallet not loaded, attempting to load...")
                loadWallet(clazz, instance, context)
            }

            val maintenanceMethod = clazz.getMethod("maintenance")
            maintenanceMethod.invoke(instance)
            Log.i("NoahPushService", "maintenance() called successfully")
        } catch (e: Exception) {
            Log.e("NoahPushService", "Failed to call NitroArkNative via reflection", e)
        }
    }

    private fun loadWallet(clazz: Class<*>, instance: Any, context: Context) {
        val packageName = context.packageName
        val appVariant = when {
            packageName.endsWith(".regtest") -> "regtest"
            packageName.endsWith(".signet") -> "signet"
            else -> "mainnet"
        }

        val mnemonic = readMnemonicFromStorage(context, appVariant)

        if (mnemonic.isNullOrEmpty()) {
            Log.e("NoahPushService", "Cannot load wallet: Mnemonic not found/decrypted.")
            return
        }

        val datadir = "${context.filesDir.path}/noah-data-$appVariant"

        val loadWalletMethod = clazz.getMethod(
            "loadWallet",
            String::class.java,
            String::class.java,
            Boolean::class.java,
            Boolean::class.java,
            Boolean::class.java,
            Integer::class.javaObjectType,
            Class.forName("com.margelo.nitro.nitroark.NitroArkNative\$AndroidBarkConfig")
        )

        val configClass = Class.forName("com.margelo.nitro.nitroark.NitroArkNative\$AndroidBarkConfig")
        val configConstructor = try {
            configClass.getConstructor(
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                Integer::class.javaObjectType,
                java.lang.Long::class.java,
                Integer::class.javaObjectType,
                Integer::class.javaObjectType,
                Integer::class.javaObjectType
            )
        } catch (e: Exception) {
            Log.e("NoahPushService", "Unable to find AndroidBarkConfig constructor", e)
            return
        }

        val config = when (appVariant) {
            "regtest" -> configConstructor.newInstance(
                "http://192.168.4.72:3535",
                null,
                "http://192.168.4.72:18443",
                null,
                "second",
                "ark",
                24,
                10000L,
                18,
                12,
                1
            )

            "signet" -> configConstructor.newInstance(
                "ark.signet.2nd.dev",
                "esplora.signet.2nd.dev",
                null, null, null, null,
                48, 10000L, 18, 12, 1
            )

            else -> configConstructor.newInstance(
                "http://192.168.4.252:3535",
                "https://mempool.space/api",
                null, null, null, null,
                288, 10000L, 18, 12, 2
            )
        }

        val regtest = appVariant == "regtest"
        val signet = appVariant == "signet"
        val bitcoin = appVariant == "mainnet"

        loadWalletMethod.invoke(instance, datadir, mnemonic, regtest, signet, bitcoin, null, config)
        Log.i("NoahPushService", "Wallet loaded successfully via JNI")

        val maintenanceMethod = clazz.getMethod("maintenance")
        maintenanceMethod.invoke(instance)
        Log.i("NoahPushService", "maintenance() called after load")
    }

    private fun readMnemonicFromStorage(context: Context, appVariant: String): String? {
        return try {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)

            val prefs = EncryptedSharedPreferences.create(
                "noah_native_secrets",
                masterKeyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )

            prefs.getString("mnemonic_$appVariant", null)
        } catch (e: Exception) {
            Log.e("NoahPushService", "Error retrieving mnemonic from native storage", e)
            null
        }
    }
}
