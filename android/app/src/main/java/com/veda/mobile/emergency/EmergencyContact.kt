package com.veda.mobile.emergency

import android.content.Context
import com.veda.mobile.SecureStorage

/**
 * Emergency contact and SOS number manager.
 *
 * Non-negotiable rules:
 *  - The verified emergency number (from the backend) is cached on-device so SOS
 *    still works offline.
 *  - If no number is set, the UI shows "call your local emergency number"
 *    and never auto-dials.
 *  - Every detection only starts the check-in ladder; auto-SOS is never triggered
 *    by a sensor alone.
 */
object EmergencyContact {

    private const val PREFS_NAME = "veda_emergency"
    private const val KEY_EMERGENCY_NUMBER = "emergency_number"
    private const val KEY_EMERGENCY_VERIFIED = "emergency_number_verified"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveEmergencyNumber(context: Context, number: String, verified: Boolean) {
        prefs(context).edit()
            .putString(KEY_EMERGENCY_NUMBER, number)
            .putBoolean(KEY_EMERGENCY_VERIFIED, verified)
            .apply()
        SecureStorage.saveEmergencyNumber(context, number)
    }

    fun getEmergencyNumber(context: Context): String? =
        prefs(context).getString(KEY_EMERGENCY_NUMBER, null) ?: SecureStorage.getEmergencyNumber(context)

    fun isEmergencyNumberVerified(context: Context): Boolean =
        prefs(context).getBoolean(KEY_EMERGENCY_VERIFIED, false)

    /**
     * Prepare SOS action (e.g., show a confirm dialog). Never auto-dials.
     */
    fun prepareSos(context: Context): Boolean {
        val number = getEmergencyNumber(context) ?: return false
        if (!isEmergencyNumberVerified(context)) return false
        // Return the number for the UI to show a confirmation dialog.
        return true
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
        SecureStorage.clearAll(context)
    }
}