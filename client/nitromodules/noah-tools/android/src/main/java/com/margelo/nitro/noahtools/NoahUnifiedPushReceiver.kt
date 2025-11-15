package com.margelo.nitro.noahtools

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.Data
import org.unifiedpush.android.connector.MessagingReceiver
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import org.unifiedpush.android.connector.FailedReason
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.TimeUnit

class NoahUnifiedPushReceiver : MessagingReceiver() {
    companion object {
        private const val TAG = "NoahUnifiedPushReceiver"
        private const val CHANNEL_ID = "noah_background_sync"
        private const val CHANNEL_NAME = "Background Sync"
        const val KEY_MESSAGE = "unified_push_message"
    }

    override fun onNewEndpoint(context: Context, endpoint: PushEndpoint, instance: String) {
        Log.i(TAG, "==================== onNewEndpoint CALLED ====================")
        Log.i(TAG, "New UnifiedPush endpoint received!")
        Log.i(TAG, "  Endpoint URL: ${endpoint.url}")
        Log.i(TAG, "  Instance: $instance")

        NoahToolsUnifiedPush.saveEndpoint(context, endpoint.url)
        Log.d(TAG, "Endpoint saved successfully")
        Log.i(TAG, "==================== onNewEndpoint COMPLETE ====================")
    }

    override fun onRegistrationFailed(context: Context, reason: FailedReason, instance: String) {
        Log.e(TAG, "==================== onRegistrationFailed CALLED ====================")
        Log.e(TAG, "UnifiedPush registration FAILED!")
        Log.e(TAG, "  Reason: $reason")
        Log.e(TAG, "  Instance: $instance")
    }

    override fun onUnregistered(context: Context, instance: String) {
        Log.i(TAG, "==================== onUnregistered CALLED ====================")
        Log.i(TAG, "UnifiedPush unregistered")
        Log.i(TAG, "  Instance: $instance")

        NoahToolsUnifiedPush.saveEndpoint(context, "")
    }

    override fun onMessage(context: Context, message: PushMessage, instance: String) {
        val messageString = message.content.toString(Charsets.UTF_8)
        Log.i(TAG, "==================== onMessage CALLED ====================")
        Log.i(TAG, "UnifiedPush message received")
        Log.i(TAG, "  Instance: $instance")
        Log.d(TAG, "  Message: $messageString")

        try {
            // Strategy 1: If React Native is running, emit directly for immediate execution
            if (tryEmitToReactNative(context, messageString)) {
                Log.i(TAG, "✓ Message delivered to active React Native instance - task will execute immediately")
                return
            }

            // Strategy 2: React Native not active - use WorkManager for immediate background execution
            Log.i(TAG, "React Native not active, scheduling immediate background task via WorkManager")
            scheduleImmediateBackgroundTask(context, messageString)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to handle UnifiedPush message", e)
        }
    }

    private fun tryEmitToReactNative(context: Context, messageString: String): Boolean {
        return try {
            val app = context.applicationContext as? ReactApplication
            val reactInstanceManager = app?.reactNativeHost?.reactInstanceManager
            val reactContext = reactInstanceManager?.currentReactContext

            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                val params = Arguments.createMap().apply {
                    putString("message", messageString)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("UNIFIED_PUSH_MESSAGE", params)
                Log.d(TAG, "Emitted to React Native DeviceEventEmitter")
                true
            } else {
                Log.d(TAG, "React Native context not active")
                false
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not emit to React Native", e)
            false
        }
    }

    private fun scheduleImmediateBackgroundTask(context: Context, messageString: String) {
        // Use WorkManager to execute the task immediately, even if app is killed
        val workData = Data.Builder()
            .putString(KEY_MESSAGE, messageString)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<UnifiedPushBackgroundWorker>()
            .setInputData(workData)
            .setInitialDelay(0, TimeUnit.SECONDS) // Execute immediately
            .build()

        WorkManager.getInstance(context).enqueue(workRequest)
        Log.i(TAG, "✓ WorkManager task scheduled for immediate execution (Work ID: ${workRequest.id})")
        Log.d(TAG, "Task will execute in background even if app is killed")
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Silent notifications for background sync tasks"
                enableVibration(false)
                setShowBadge(false)
                setSound(null, null)
                lockscreenVisibility = android.app.Notification.VISIBILITY_SECRET
            }

            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}

/**
 * WorkManager Worker for executing UnifiedPush tasks in the background
 * This runs even when the app is completely killed, ensuring critical tasks execute immediately
 */
class UnifiedPushBackgroundWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    companion object {
        private const val TAG = "UnifiedPushWorker"
        private const val CHANNEL_ID = "noah_background_sync"
        private const val NOTIFICATION_ID = 999
    }

    override fun doWork(): Result {
        Log.i(TAG, "==================== Worker STARTED ====================")
        val messageString = inputData.getString(NoahUnifiedPushReceiver.KEY_MESSAGE)

        if (messageString == null) {
            Log.e(TAG, "No message data received")
            return Result.failure()
        }

        Log.d(TAG, "Processing message: $messageString")

        return try {
            // Show a temporary notification while processing (required for foreground service constraints)
            showProcessingNotification()

            // Try to emit to React Native to trigger the background task handler
            val emitted = tryEmitToReactNative(messageString)

            if (emitted) {
                Log.i(TAG, "✓ Message delivered to React Native - background task executing")
                // Give React Native some time to process
                Thread.sleep(2000)
                dismissProcessingNotification()
                Result.success()
            } else {
                Log.w(TAG, "Could not deliver to React Native - app may need to be started")
                // Keep the notification so user can tap to open app and process
                updateNotificationToRequireUserAction()
                Result.success() // Don't retry, just wait for user to open app
            }

        } catch (e: Exception) {
            Log.e(TAG, "Worker failed", e)
            dismissProcessingNotification()
            Result.failure()
        } finally {
            Log.i(TAG, "==================== Worker COMPLETED ====================")
        }
    }

    private fun tryEmitToReactNative(messageString: String): Boolean {
        return try {
            val app = applicationContext as? ReactApplication
            val reactInstanceManager = app?.reactNativeHost?.reactInstanceManager
            val reactContext = reactInstanceManager?.currentReactContext

            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                val params = Arguments.createMap().apply {
                    putString("message", messageString)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("UNIFIED_PUSH_MESSAGE", params)
                Log.d(TAG, "Emitted to React Native from Worker")
                true
            } else {
                Log.d(TAG, "React Native not available in Worker context")
                false
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not emit to React Native from Worker", e)
            false
        }
    }

    private fun showProcessingNotification() {
        createNotificationChannel()

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Noah")
            .setContentText("Processing sync...")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setSilent(true)
            .build()

        NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, notification)
        Log.d(TAG, "Processing notification shown")
    }

    private fun dismissProcessingNotification() {
        try {
            NotificationManagerCompat.from(applicationContext).cancel(NOTIFICATION_ID)
            Log.d(TAG, "Processing notification dismissed")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dismiss notification", e)
        }
    }

    private fun updateNotificationToRequireUserAction() {
        createNotificationChannel()

        val launchIntent =
            applicationContext.packageManager.getLaunchIntentForPackage(applicationContext.packageName)?.apply {
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
            }

        val pendingIntent = android.app.PendingIntent.getActivity(
            applicationContext,
            0,
            launchIntent,
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Noah")
            .setContentText("Tap to sync")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, notification)
        Log.d(TAG, "Updated notification to require user action")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Background Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background sync notifications"
                enableVibration(false)
                setShowBadge(false)
                setSound(null, null)
            }

            val notificationManager =
                applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
