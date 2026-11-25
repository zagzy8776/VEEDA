package com.veda.mobile

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log

/**
 * BLE health device intake.
 *
 * Reads standard GATT services for paired health devices:
 *  - Blood Pressure (0x1810)
 *  - Health Thermometer (0x1809)
 *  - Glucose (0x1808)
 *
 * Rules:
 *  - Only runs after explicit BLE consent.
 *  - Never auto-syncs; the user must explicitly request a reading.
 *  - No unvalidated values are shown; the caller must run the shared
 *    validation harness before rendering any reading.
 */
object BleHealthDeviceManager {

    private const val TAG = "BleHealthDeviceManager"

    private val healthServices = mapOf(
        "blood_pressure" to "00001810-0000-1000-8000-00805f9b34fb",
        "temperature" to "00001809-0000-1000-8000-00805f9b34fb",
        "glucose" to "00001808-0000-1000-8000-00805f9b34fb"
    )

    fun hasBleSupport(context: Context): Boolean {
        val pm = context.applicationContext.packageManager
        return pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    }

    fun isBleEnabled(context: Context): Boolean {
        return ConsentManager.hasConsent(context, ConsentManager.FEATURE_BLE)
    }

    fun getHealthServiceUuid(type: String): String? = healthServices[type]

    fun onReadingReceived(context: Context, type: String, value: String) {
        // The web layer's validation harness decides whether to display the value.
        Log.d(TAG, "BLE reading received: $type = $value")
    }
}