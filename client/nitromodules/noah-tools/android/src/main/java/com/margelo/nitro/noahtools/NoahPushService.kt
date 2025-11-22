package com.margelo.nitro.noahtools

import android.content.Context
import android.util.Log
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
        prefs.edit().putString("endpoint", endpoint.url).apply()
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
            val instance = clazz.getField("INSTANCE").get(null)
            
            val isLoadedMethod = clazz.getMethod("isWalletLoaded")
            val isLoaded = isLoadedMethod.invoke(instance) as Boolean
            
            if (isLoaded) {
                val maintenanceMethod = clazz.getMethod("maintenance")
                maintenanceMethod.invoke(instance)
                Log.i("NoahPushService", "maintenance() called successfully")
            } else {
                Log.i("NoahPushService", "Wallet not loaded, attempting to load...")
                loadWallet(clazz, instance, context)
            }
        } catch (e: Exception) {
            Log.e("NoahPushService", "Failed to call NitroArkNative via reflection", e)
        }
    }

    private fun loadWallet(clazz: Class<*>, instance: Any, context: Context) {
        // TODO: Retrieve mnemonic from secure storage
        // This is a placeholder. Real mnemonic retrieval requires decrypting react-native-keychain storage.
        val mnemonic = "" 
        
        if (mnemonic.isEmpty()) {
            Log.e("NoahPushService", "Cannot load wallet: Mnemonic not found/decrypted.")
            return
        }

        // Infer app variant from package name
        // com.noahwallet.regtest -> regtest
        // com.noahwallet.signet -> signet
        // com.noahwallet -> mainnet
        val packageName = context.packageName
        val appVariant = when {
            packageName.endsWith(".regtest") -> "regtest"
            packageName.endsWith(".signet") -> "signet"
            else -> "mainnet"
        }

        val datadir = "${context.filesDir.path}/noah-data-$appVariant"
        
        val loadWalletMethod = clazz.getMethod(
            "loadWallet",
            String::class.java, // datadir
            String::class.java, // mnemonic
            Boolean::class.java, // regtest
            Boolean::class.java, // signet
            Boolean::class.java, // bitcoin
            Integer::class.javaObjectType, // birthdayHeight (nullable)
            Class.forName("com.margelo.nitro.nitroark.NitroArkNative\$AndroidBarkConfig") // config
        )

        val configClass = Class.forName("com.margelo.nitro.nitroark.NitroArkNative\$AndroidBarkConfig")
        val configConstructor = configClass.constructors[0]
        
        // Default values for config based on variant (Simplified)
        // Note: Real implementation needs to match constants.ts exactly
        val config = when (appVariant) {
            "regtest" -> configConstructor.newInstance(
                "http://10.0.2.2:3535", // ark
                null, // esplora
                "http://10.0.2.2:18443", // bitcoind
                null, // cookie
                "second", // user
                "ark", // pass
                24, // vtxoRefresh
                10000L, // fee
                18, // htlc
                12, // margin
                1 // confs
            )
            "signet" -> configConstructor.newInstance(
                "ark.signet.2nd.dev",
                "esplora.signet.2nd.dev",
                null, null, null, null,
                48, 10000L, 18, 12, 1
            )
            else -> configConstructor.newInstance(
                "http://192.168.4.252:3535", // mainnet ark (example)
                "https://mempool.space/api", // esplora
                null, null, null, null,
                288, 10000L, 18, 12, 2
            )
        }

        val regtest = appVariant == "regtest"
        val signet = appVariant == "signet"
        val bitcoin = appVariant == "mainnet"

        loadWalletMethod.invoke(instance, datadir, mnemonic, regtest, signet, bitcoin, null, config)
        Log.i("NoahPushService", "Wallet loaded successfully via JNI")
        
        // Retry maintenance
        val maintenanceMethod = clazz.getMethod("maintenance")
        maintenanceMethod.invoke(instance)
        Log.i("NoahPushService", "maintenance() called after load")
    }
}
