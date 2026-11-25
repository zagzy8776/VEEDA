package com.veda.mobile.offline

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Offline queue for measurements that need to be synced when the network
 * is restored. Uses a simple file-based store so it works even if the app
 * is killed.
 *
 * On logout, all per-user keys are wiped (see SecureStorage.clearAll).
 */
object OfflineQueue {

    private const val TAG = "OfflineQueue"
    private const val QUEUE_FILE = "veda_offline_queue.json"

    private fun queueFile(context: Context) =
        context.applicationContext.getFileStreamPath(QUEUE_FILE)

    fun enqueue(context: Context, type: String, payload: JSONObject) {
        try {
            val file = queueFile(context)
            val existing = if (file.exists()) {
                file.readText()
            } else {
                "[]"
            }
            val arr = JSONArray(existing)
            arr.put(payload.put("type", type).put("queuedAt", System.currentTimeMillis()))
            file.writeText(arr.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enqueue measurement", e)
        }
    }

    fun flush(context: Context) {
        try {
            val file = queueFile(context)
            if (!file.exists()) return
            val arr = JSONArray(file.readText())
            val remaining = JSONArray()
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                try {
                    val type = item.getString("type")
                    val success = postToBackend(context, type, item)
                    if (!success) {
                        remaining.put(item)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to sync item $i", e)
                    remaining.put(item)
                }
            }
            file.writeText(remaining.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to flush offline queue", e)
        }
    }

    private fun postToBackend(context: Context, type: String, payload: JSONObject): Boolean {
        // Use the shared API client from the web layer (via Capacitor bridge).
        // This is a placeholder until the web bridge is wired up.
        return false
    }

    fun clear(context: Context) {
        val file = queueFile(context)
        if (file.exists()) file.delete()
    }
}