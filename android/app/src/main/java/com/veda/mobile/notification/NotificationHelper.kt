package com.veda.mobile.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat

/**
 * Notification helper for the VEEDA native wrapper.
 *
 * Provides the persistent foreground notification for Guardian Mode and the
 * plain "sensor not available" style notifications used elsewhere.
 */
object NotificationHelper {

    const val GUARDIAN_NOTIFICATION_ID = 1001
    const val FALL_CHECKIN_NOTIFICATION_ID = 1002
    const val SOS_PREPARING_NOTIFICATION_ID = 1003

    private const val CHANNEL_ID = "veda_guardian_channel"

    fun buildGuardianNotification(context: Context, features: List<String>): Notification {
        val title = "VEEDA Guardian Mode"
        val text = when {
            features.contains(com.veda.mobile.ConsentManager.FEATURE_FALL_DETECTION) ->
                "Fall monitoring is active. Guardian mode is watching."
            features.contains(com.veda.mobile.ConsentManager.FEATURE_AUDIO_DISTRESS) ->
                "Audio distress watch is active."
            features.contains(com.veda.mobile.ConsentManager.FEATURE_GUARDIAN_MODE) ->
                "Guardian mode is active."
            else -> "Guardian mode is active."
        }

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
    }

    fun createDefaultChannel(context: Context) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VEEDA Guardian Mode",
                NotificationManager.IMPORTANCE_HIGH
            )
            channel.setShowBadge(false)
            val manager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}