package com.veda.mobile

import android.Manifest
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Main activity for the VEEDA native Android wrapper.
 *
 * The web (PWA) experience is served from the bundled WebView, while native
 * sensor/camera/audio/BLE modules are available as Capacitor plugins or via
 * direct Activity method calls. This activity also requests the runtime
 * permissions for each feature only after the user explicitly consents to
 * that feature.
 */
class MainActivity : ComponentActivity() {

    // Map of requested permission -> feature label (for per-feature consent)
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        // Results are handled per-feature after consent is granted.
        val grantedPermissions = results.filterValues { it }.keys
        ConsentManager.onPermissionResults(grantedPermissions)
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)

        // Do NOT request any sensor permission here. Every sensor must be
        // explicitly consented to per feature.
        setContent {
            com.veda.mobile.ui.VeedaApp()
        }

        // Example: when the web layer calls requestConsent("CAMERA"), this
        // activity requests the required runtime permission(s).
        // (The web bridge will call a method that routes to this launcher.)
    }

    /**
     * Called from the JS bridge when the user explicitly consents to a sensor
     * (CAMERA, RECORD_AUDIO, BODY_SENSORS, etc.).
     */
    fun requestRuntimePermission(permission: String) {
        val permissions = when (permission) {
            "CAMERA" -> arrayOf(Manifest.permission.CAMERA)
            "RECORD_AUDIO" -> arrayOf(Manifest.permission.RECORD_AUDIO)
            "HEALTH" -> arrayOf(Manifest.permission.BODY_SENSORS)
            "BLUETOOTH" -> arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
            else -> arrayOf()
        }
        if (permissions.isNotEmpty()) {
            permissionLauncher.launch(permissions)
        }
    }
}