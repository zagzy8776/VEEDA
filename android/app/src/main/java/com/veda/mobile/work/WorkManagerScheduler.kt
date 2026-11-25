package com.veda.mobile.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.veda.mobile.offline.OfflineQueue
import java.util.concurrent.TimeUnit

/**
 * WorkManager scheduler for background tasks.
 *
 * Currently schedules the offline queue sync worker so that queued
 * measurements are flushed when the network is restored.
 */
object WorkManagerScheduler {

    private const val TAG = "WorkManagerScheduler"
    private const val SYNC_WORK_NAME = "veda_offline_sync"

    fun ensureInitialized(context: Context) {
        // WorkManager initializes automatically; this is a no-op hook for
        // custom configuration if needed.
    }

    fun scheduleOfflineSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest: PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<OfflineSyncWorker>(1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .addTag(SYNC_WORK_NAME)
                .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            SYNC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )
    }

    fun cancelOfflineSync(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(SYNC_WORK_NAME)
    }
}