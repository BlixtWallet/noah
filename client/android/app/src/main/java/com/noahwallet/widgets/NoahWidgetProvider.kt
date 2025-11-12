package com.noahwallet.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.noahwallet.MainActivity
import com.noahwallet.R
import java.text.NumberFormat
import java.util.Locale

open class NoahWidgetProvider : AppWidgetProvider() {

    companion object {
        private val numberFormatter: NumberFormat by lazy {
            NumberFormat.getNumberInstance(Locale.US).apply {
                maximumFractionDigits = 0
                isGroupingUsed = true
            }
        }
    }

    protected open val appGroup: String = "com.noahwallet.regtest"
    protected open val variantName: String? = "REGTEST"
    protected open val layoutResId: Int = R.layout.widget_noah
    protected open val badgeBackgroundResId: Int = R.drawable.badge_background

    override fun onReceive(context: Context, intent: android.content.Intent) {
        super.onReceive(context, intent)

        // Handle generic widget update broadcast from noah-tools
        if (intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE && intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS) == null) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val componentName = android.content.ComponentName(context, javaClass)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)

            if (appWidgetIds.isNotEmpty()) {
                onUpdate(context, appWidgetManager, appWidgetIds)
            }
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val prefs = context.getSharedPreferences(appGroup, Context.MODE_PRIVATE)

        val totalBalance = prefs.getLong("totalBalance", 0L)
        val onchainBalance = prefs.getLong("onchainBalance", 0L)
        val offchainBalance = prefs.getLong("offchainBalance", 0L)
        val pendingBalance = prefs.getLong("pendingBalance", 0L)

        try {
            val views = RemoteViews(context.packageName, layoutResId)

            // Set click listener to open app
            val intent = Intent(context, MainActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            // Set balance text
            views.setTextViewText(R.id.balance_text, "${formatSats(totalBalance)} sats")

            // Set onchain/offchain balances
            views.setTextViewText(R.id.onchain_balance, formatSats(onchainBalance))
            views.setTextViewText(R.id.offchain_balance, formatSats(offchainBalance))

            // Show/hide pending balance
            if (pendingBalance > 0) {
                views.setTextViewText(R.id.pending_balance, "Pending: ${formatSats(pendingBalance)} sats")
                views.setViewVisibility(R.id.pending_balance, android.view.View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.pending_balance, android.view.View.GONE)
            }

            // Set variant badge if present
            if (variantName != null) {
                views.setTextViewText(R.id.variant_badge, variantName)
                views.setInt(R.id.variant_badge, "setBackgroundResource", badgeBackgroundResId)
                views.setViewVisibility(R.id.variant_badge, android.view.View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.variant_badge, android.view.View.GONE)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        } catch (e: Exception) {
            android.util.Log.e("NoahWidget", "Error updating widget: ${e.message}", e)
        }
    }

    private fun formatSats(value: Long): String {
        return numberFormatter.format(value)
    }

    override fun onEnabled(context: Context) {
        // Called when the first widget is created
    }

    override fun onDisabled(context: Context) {
        // Called when the last widget is removed
    }
}
