package com.veda.mobile.work

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.veda.mobile.offline.OfflineQueue

/**
 * Coroutine-based WorkManager worker that flushes the offline queue when
 * the network becomes available.
 */
class OfflineSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            OfflineQueue.flush(applicationContext)
            Result.success()
        } catch (e: Exception) {
            Log.e("OfflineSyncWorker", "Sync failed", e)
            Result.retry()
        }
    }
}