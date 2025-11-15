package com.margelo.nitro.noahtools

import android.content.Context
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import org.unifiedpush.android.connector.UnifiedPush
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

object NoahToolsUnifiedPush {
    private const val TAG = "NoahToolsUnifiedPush"
    private const val PREFS_NAME = "noah_unified_push_prefs"
    private const val KEY_ENDPOINT = "unified_push_endpoint"

    fun performHasGooglePlayServices(): Boolean {
        val context = NitroModules.applicationContext ?: run {
            Log.w(TAG, "Context is null when checking Google Play Services")
            return false
        }
        val googleApiAvailability = GoogleApiAvailability.getInstance()
        val resultCode = googleApiAvailability.isGooglePlayServicesAvailable(context)
        val hasPlayServices = resultCode == ConnectionResult.SUCCESS
        Log.d(TAG, "Google Play Services available: $hasPlayServices (result code: $resultCode)")
        return hasPlayServices
    }

    fun performRegisterUnifiedPush(topic: String) {
        val context = NitroModules.applicationContext ?: run {
            Log.e(TAG, "Application context is null, cannot register UnifiedPush")
            return
        }

        try {
            // Get list of available distributors
            val distributors = UnifiedPush.getDistributors(context)
            Log.d(TAG, "Available UnifiedPush distributors: ${distributors.joinToString(", ")}")

            if (distributors.isEmpty()) {
                Log.e(TAG, "No UnifiedPush distributors installed!")
                Log.e(TAG, "User needs to install a distributor app like ntfy")
                throw Exception("No UnifiedPush distributor available. Please install ntfy or another UnifiedPush app.")
            }

            // Check if a distributor is already saved
            val savedDistributor = UnifiedPush.getSavedDistributor(context)
            Log.d(TAG, "Saved distributor: ${savedDistributor ?: "NONE"}")

            // If no distributor is saved, save the first available one (prefer ntfy if available)
            if (savedDistributor.isNullOrEmpty()) {
                val distributorToSave = distributors.find { it.contains("ntfy") } ?: distributors.first()
                Log.d(TAG, "Saving distributor: $distributorToSave")
                UnifiedPush.saveDistributor(context, distributorToSave)
            }

            Log.d(TAG, "Registering UnifiedPush...")
            Log.d(TAG, "User should subscribe to topic: $topic in their UnifiedPush app")

            // Register with the saved distributor
            UnifiedPush.register(context)
            Log.d(TAG, "UnifiedPush registerApp() called successfully")
            Log.d(TAG, "Waiting for distributor to call onNewEndpoint()...")

            // Check if already have a saved endpoint
            val existingEndpoint = getStoredEndpoint(context)
            Log.d(
                TAG,
                "Existing endpoint after registration: ${if (existingEndpoint.isEmpty()) "none" else existingEndpoint}"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register UnifiedPush", e)
            throw e
        }
    }

    fun performUnregisterUnifiedPush() {
        val context = NitroModules.applicationContext ?: run {
            Log.e(TAG, "Application context is null, cannot unregister UnifiedPush")
            return
        }

        try {
            Log.d(TAG, "Attempting to unregister UnifiedPush")
            UnifiedPush.unregisterApp(context)
            clearEndpoint(context)
            Log.d(TAG, "UnifiedPush unregistered successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister UnifiedPush", e)
            throw e
        }
    }

    fun performGetUnifiedPushEndpoint(): Promise<String> {
        return Promise.async {
            suspendCoroutine { continuation ->
                Log.d(TAG, "performGetUnifiedPushEndpoint called")
                val context = NitroModules.applicationContext
                if (context == null) {
                    Log.e(TAG, "Application context is null, cannot get endpoint")
                    continuation.resume("")
                    return@suspendCoroutine
                }

                try {
                    Log.d(TAG, "Attempting to retrieve stored endpoint from SharedPreferences")
                    val endpoint = getStoredEndpoint(context)
                    if (endpoint.isEmpty()) {
                        Log.w(TAG, "Retrieved UnifiedPush endpoint is EMPTY")
                    } else {
                        Log.d(TAG, "Retrieved UnifiedPush endpoint: $endpoint")
                    }
                    continuation.resume(endpoint)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to get UnifiedPush endpoint", e)
                    continuation.resume("")
                }
            }
        }
    }

    fun saveEndpoint(context: Context, endpoint: String) {
        try {
            Log.d(TAG, "Attempting to save endpoint: $endpoint")
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val success = prefs.edit().putString(KEY_ENDPOINT, endpoint).commit()
            Log.d(TAG, "UnifiedPush endpoint save result: $success, endpoint: $endpoint")

            // Verify it was saved
            val saved = prefs.getString(KEY_ENDPOINT, "")
            Log.d(TAG, "Verification - endpoint after save: ${if (saved.isNullOrEmpty()) "empty" else saved}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save UnifiedPush endpoint: $endpoint", e)
        }
    }

    private fun getStoredEndpoint(context: Context): String {
        Log.d(TAG, "Getting stored endpoint from SharedPreferences: $PREFS_NAME")
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val endpoint = prefs.getString(KEY_ENDPOINT, "") ?: ""
        Log.d(TAG, "Retrieved from prefs - endpoint: ${if (endpoint.isEmpty()) "empty" else endpoint}")
        return endpoint
    }

    private fun clearEndpoint(context: Context) {
        Log.d(TAG, "Clearing stored endpoint")
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(KEY_ENDPOINT).apply()
        Log.d(TAG, "Endpoint cleared from SharedPreferences")
    }
}
