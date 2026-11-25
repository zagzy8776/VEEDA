package com.veda.mobile

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.veda.mobile.offline.OfflineQueue

/**
 * Background service that flushes the offline measurement queue when the
 * network is restored. Uses WorkManager for reliable scheduling.
 */
class SyncWorkerService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Triggered by WorkManagerScheduler when the network becomes available.
        OfflineQueue.flush(this)
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}