package com.veda.mobile.consent

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.veda.mobile.ConsentManager

/**
 * Capacitor plugin bridge for per-feature consent.
 *
 * The JS bridge calls this plugin to:
 *   - Check whether consent exists for a feature.
 *   - Request explicit consent (recorded in SharedPreferences).
 *   - Revoke consent on logout.
 *
 * Rules:
 *  - Consent must be explicit before any sensor activation.
 *  - Every per-feature key is cleared on logout.
 */
@CapacitorPlugin(name = "VEEDAConsent")
class ConsentPlugin : Plugin() {

    @PluginMethod
    fun hasConsent(call: PluginCall) {
        val feature = call.getString("feature") ?: run {
            call.reject("feature is required")
            return
        }
        val granted = ConsentManager.hasConsent(context, feature)
        val result = JSObject()
        result.put("granted", granted)
        call.resolve(result)
    }

    @PluginMethod
    fun requestConsent(call: PluginCall) {
        val feature = call.getString("feature") ?: run {
            call.reject("feature is required")
            return
        }
        // The UI must show a clear consent modal before calling this method.
        // After the user confirms, record consent.
        ConsentManager.setConsent(context, feature, true)
        val result = JSObject()
        result.put("granted", true)
        call.resolve(result)
    }

    @PluginMethod
    fun revokeConsent(call: PluginCall) {
        val feature = call.getString("feature") ?: run {
            call.reject("feature is required")
            return
        }
        ConsentManager.setConsent(context, feature, false)
        call.resolve()
    }

    @PluginMethod
    fun clearAllConsent(call: PluginCall) {
        ConsentManager.clearAllConsent(context)
        call.resolve()
    }

    @PluginMethod
    fun getConsentedFeatures(call: PluginCall) {
        val features = ConsentManager.getConsentedFeatures(context)
        val result = JSObject()
        result.put("features", features.toTypedArray())
        call.resolve(result)
    }
}