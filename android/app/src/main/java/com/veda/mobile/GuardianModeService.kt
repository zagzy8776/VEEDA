package com.veda.mobile

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.veda.mobile.notification.NotificationHelper

/**
 * Guardian Mode foreground service.
 *
 * Runs while the app is backgrounded (or closed) and performs:
 *  - Fall detection via accelerometer
 *  - Audio distress watch (scream/crash) — foreground-only, needs mic consent
 *  - Missing check-in escalation
 *
 * Non-negotiable rules:
 *  - Only starts after explicit per-feature consent.
 *  - Shows a persistent notification (visible indicator).
 *  - Never auto-dials or auto-SOS; a detection only starts the check-in ladder.
 */
class GuardianModeService : Service() {

    companion object {
        const val ACTION_START = "veda.mobile.GUARDIAN_START"
        const val ACTION_STOP = "veda.mobile.GUARDIAN_STOP"
        const val EXTRA_FEATURES = "extra_features"
    }

    private var fallDetector: FallDetector? = null
    private var audioDistressMonitor: AudioDistressMonitor? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val features = intent.getStringArrayListExtra(EXTRA_FEATURES) ?: emptyList()
                startGuardianMode(features)
            }
            ACTION_STOP -> {
                stopGuardianMode()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelfResult(startId)
            }
        }
        return START_NOT_STICKY
    }

    private fun startGuardianMode(features: List<String>) {
        // Start the foreground service with a persistent notification.
        NotificationHelper.createDefaultChannel(this)
        val notification = NotificationHelper.buildGuardianNotification(this, features)
        startForeground(NotificationHelper.GUARDIAN_NOTIFICATION_ID, notification)

        if (features.contains(ConsentManager.FEATURE_FALL_DETECTION)) {
            fallDetector = FallDetector(this).apply { start() }
        }
        if (features.contains(ConsentManager.FEATURE_AUDIO_DISTRESS)) {
            audioDistressMonitor = AudioDistressMonitor(this).apply { start() }
        }
    }

    private fun stopGuardianMode() {
        fallDetector?.stop()
        audioDistressMonitor?.stop()
        fallDetector = null
        audioDistressMonitor = null
    }

    override fun onDestroy() {
        stopGuardianMode()
        super.onDestroy()
    }
}