package com.veda.mobile

import android.content.Context

/**
 * Secure storage wrapper using EncryptedSharedPreferences (via DataStore).
 *
 * Per-user keys are cleared on logout per the VEEDA safety contract.
 */
object SecureStorage {

    private const val PREFS_NAME = "veda_secure"
    private const val KEY_JWT = "jwt_token"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_EMERGENCY_NUMBER = "emergency_number"
    private const val KEY_CONSENT_VERSION = "consent_version"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveJwt(context: Context, token: String) {
        prefs(context).edit().putString(KEY_JWT, token).apply()
    }

    fun getJwt(context: Context): String? =
        prefs(context).getString(KEY_JWT, null)

    fun saveUserId(context: Context, userId: String) {
        prefs(context).edit().putString(KEY_USER_ID, userId).apply()
    }

    fun getUserId(context: Context): String? =
        prefs(context).getString(KEY_USER_ID, null)

    fun saveEmergencyNumber(context: Context, number: String) {
        prefs(context).edit().putString(KEY_EMERGENCY_NUMBER, number).apply()
    }

    fun getEmergencyNumber(context: Context): String? =
        prefs(context).getString(KEY_EMERGENCY_NUMBER, null)

    fun saveConsentVersion(context: Context, version: Int) {
        prefs(context).edit().putInt(KEY_CONSENT_VERSION, version).apply()
    }

    fun getConsentVersion(context: Context): Int =
        prefs(context).getInt(KEY_CONSENT_VERSION, 0)

    /** Clear all per-user data on logout. */
    fun clearAll(context: Context) {
        prefs(context).edit().clear().apply()
        ConsentManager.clearAllConsent(context)
        OfflineQueue.clear(context)
    }
}