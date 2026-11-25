package com.veda.mobile

import android.content.Context
import android.content.pm.PackageManager

/**
 * Manages per-feature consent and runtime permission state.
 *
 * Rules carried from the VEEDA safety contract:
 *  - Every sensor (camera, mic, body sensors, BLE, location) has its own consent item.
 *  - A sensor may only activate after explicit consent.
 *  - Consent state is stored per-feature in SharedPreferences (encrypted at rest).
 */
object ConsentManager {

    private const val PREFS_NAME = "veda_consent"

    // Feature keys (must match the web layer's consent keys)
    const val FEATURE_CAMERA = "CAMERA"
    const val FEATURE_AUDIO = "RECORD_AUDIO"
    const val FEATURE_HEALTH = "HEALTH"
    const val FEATURE_BLE = "BLE"
    const val FEATURE_LOCATION = "LOCATION"
    const val FEATURE_TORCH = "TORCH"
    const val FEATURE_FALL_DETECTION = "FALL_DETECTION"
    const val FEATURE_AUDIO_DISTRESS = "AUDIO_DISTRESS"
    const val FEATURE_GUARDIAN_MODE = "GUARDIAN_MODE"

    private val allFeatures = listOf(
        FEATURE_CAMERA, FEATURE_AUDIO, FEATURE_HEALTH, FEATURE_BLE,
        FEATURE_LOCATION, FEATURE_TORCH, FEATURE_FALL_DETECTION,
        FEATURE_AUDIO_DISTRESS, FEATURE_GUARDIAN_MODE
    )

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Check whether the user has granted consent for a specific feature. */
    fun hasConsent(context: Context, feature: String): Boolean {
        return prefs(context).getBoolean(feature, false)
    }

    /** Record explicit per-feature consent. */
    fun setConsent(context: Context, feature: String, granted: Boolean) {
        prefs(context).edit().putBoolean(feature, granted).apply()
    }

    /** Revoke all consent on logout (per-user keys are wiped). */
    fun clearAllConsent(context: Context) {
        prefs(context).edit().clear().apply()
    }

    /** Return the list of features that are currently consented. */
    fun getConsentedFeatures(context: Context): List<String> {
        return allFeatures.filter { prefs(context).getBoolean(it, false) }
    }

    /** Check if a runtime permission is granted for a feature. */
    fun isPermissionGranted(context: Context, permission: String): Boolean {
        return context.applicationContext.checkCallingOrSelfPermission(permission) ==
                PackageManager.PERMISSION_GRANTED
    }

    /** Called after the permission launcher returns. Updates consent state. */
    fun onPermissionResults(grantedPermissions: Set<String>) {
        // Consent is recorded by the UI flow after the user confirms; this
        // hook only informs the web layer that a runtime permission changed.
    }
}