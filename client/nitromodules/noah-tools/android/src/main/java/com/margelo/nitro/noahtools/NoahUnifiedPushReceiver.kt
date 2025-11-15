package com.margelo.nitro.noahtools

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.unifiedpush.android.connector.MessagingReceiver
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import org.unifiedpush.android.connector.FailedReason
import org.json.JSONObject

class NoahUnifiedPushReceiver : MessagingReceiver() {
    companion object {
        private const val TAG = "NoahUnifiedPushReceiver"
        private const val CHANNEL_ID = "unified_push_channel"
        private const val CHANNEL_NAME = "UnifiedPush Notifications"
        private const val NOTIFICATION_ID_BASE = 20000
    }

    override fun onNewEndpoint(context: Context, endpoint: PushEndpoint, instance: String) {
        Log.i(TAG, "==================== onNewEndpoint CALLED ====================")
        Log.i(TAG, "New UnifiedPush endpoint received!")
        Log.i(TAG, "  Endpoint URL: ${endpoint.url}")
        Log.i(TAG, "  Instance: $instance")
        Log.i(TAG, "  Package: ${context.packageName}")

        // Save endpoint to shared preferences
        Log.d(TAG, "Saving endpoint to SharedPreferences...")
        NoahToolsUnifiedPush.saveEndpoint(context, endpoint.url)
        Log.d(TAG, "Endpoint saved successfully")

        // Send broadcast to the app to trigger server registration
        val intent = Intent("com.noahwallet.UNIFIED_PUSH_NEW_ENDPOINT")
        intent.setPackage(context.packageName)
        intent.putExtra("endpoint", endpoint.url)
        context.sendBroadcast(intent)

        Log.i(TAG, "Broadcast sent to app")
        Log.i(TAG, "==================== onNewEndpoint COMPLETE ====================")
    }

    override fun onRegistrationFailed(context: Context, reason: FailedReason, instance: String) {
        Log.e(TAG, "==================== onRegistrationFailed CALLED ====================")
        Log.e(TAG, "UnifiedPush registration FAILED!")
        Log.e(TAG, "  Reason: $reason")
        Log.e(TAG, "  Instance: $instance")
        Log.e(TAG, "  Package: ${context.packageName}")

        // Send broadcast to the app
        val intent = Intent("com.noahwallet.UNIFIED_PUSH_REGISTRATION_FAILED")
        intent.setPackage(context.packageName)
        intent.putExtra("error", "Registration failed: $reason")
        context.sendBroadcast(intent)
    }

    override fun onUnregistered(context: Context, instance: String) {
        Log.i(TAG, "==================== onUnregistered CALLED ====================")
        Log.i(TAG, "UnifiedPush unregistered")
        Log.i(TAG, "  Instance: $instance")

        // Clear the saved endpoint
        NoahToolsUnifiedPush.saveEndpoint(context, "")

        // Send broadcast to the app
        val intent = Intent("com.noahwallet.UNIFIED_PUSH_UNREGISTERED")
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
    }

    override fun onMessage(context: Context, message: PushMessage, instance: String) {
        val messageString = message.content.toString(Charsets.UTF_8)
        Log.i(TAG, "==================== onMessage CALLED ====================")
        Log.i(TAG, "UnifiedPush message received")
        Log.i(TAG, "  Instance: $instance")
        Log.d(TAG, "  Message: $messageString")

        try {
            // Parse the message as JSON to extract notification data
            val jsonMessage = JSONObject(messageString)

            // Create notification channel if needed (Android 8.0+)
            createNotificationChannel(context)

            // Build and show notification that will trigger the expo background task
            // The notification data structure should match what expo-notifications expects
            val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Noah Background Task")
                .setContentText("Processing notification...")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setExtras(android.os.Bundle().apply {
                    // Store the message body in the format expo-notifications expects
                    putString("body", messageString)
                })

            // Show the notification
            val notificationManager = NotificationManagerCompat.from(context)
            val notificationId = NOTIFICATION_ID_BASE + System.currentTimeMillis().toInt()

            try {
                notificationManager.notify(notificationId, notificationBuilder.build())
                Log.d(TAG, "Notification created with ID: $notificationId")
            } catch (e: SecurityException) {
                Log.e(TAG, "Failed to show notification - missing permission", e)
            }

            // Also send a broadcast for immediate processing if app is in foreground
            val intent = Intent("com.noahwallet.UNIFIED_PUSH_MESSAGE")
            intent.setPackage(context.packageName)
            intent.putExtra("message", messageString)
            context.sendBroadcast(intent)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to process UnifiedPush message", e)

            // Fallback: show a generic notification
            createNotificationChannel(context)
            val fallbackBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Noah")
                .setContentText("New activity")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)

            try {
                NotificationManagerCompat.from(context)
                    .notify(NOTIFICATION_ID_BASE, fallbackBuilder.build())
            } catch (secEx: SecurityException) {
                Log.e(TAG, "Failed to show fallback notification", secEx)
            }
        }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for UnifiedPush messages"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
            }

            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created: $CHANNEL_ID")
        }
    }
}
