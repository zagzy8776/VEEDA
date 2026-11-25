package com.veda.mobile

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Accelerometer-based fall / collapse detector.
 *
 * NOTE: The trigger thresholds are NOT clinical constants. They are
 * operator-configurable values. Until an operator sets them, the detector
 * reports "not available / needs calibration" and does not raise a detection.
 * A detection only starts the check-in ladder; it never dials and never
 * auto-SOS.
 */
class FallDetector(private val context: Context) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    // Operator-configurable thresholds (must be set before use).
    var freeFallThresholdG: Float? = null
    var impactThresholdG: Float? = null

    private var lastSampleTime = 0L
    private var lastG = 1.0f
    private var isInFreeFall = false
    private var lastImpactTime = 0L

    // Detection callback is intentionally only a check-in trigger.
    var onFallDetected: (() -> Unit)? = null

    var isRunning: Boolean = false
        private set

    fun start() {
        if (accelerometer == null) {
            // No accelerometer: the UI must show "fall detection unavailable".
            return
        }
        if (freeFallThresholdG == null || impactThresholdG == null) {
            // Thresholds are not configured yet; do not start.
            return
        }
        sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME)
        isRunning = true
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        isRunning = false
        isInFreeFall = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        val freeFall = freeFallThresholdG ?: return
        val impact = impactThresholdG ?: return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val magnitude = kotlin.math.sqrt(x * x + y * y + z * z)
        val now = System.currentTimeMillis()

        if (magnitude < freeFall) {
            isInFreeFall = true
            lastSampleTime = now
        } else if (isInFreeFall && magnitude > impact) {
            val elapsed = now - lastSampleTime
            // Require a plausible fall window (< 2 seconds) and avoid repeats.
            if (elapsed in 100L..2000L && (now - lastImpactTime) > 10_000L) {
                lastImpactTime = now
                isInFreeFall = false
                // Start the check-in ladder; never dial or auto-SOS.
                onFallDetected?.invoke()
            }
        }

        lastG = magnitude
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}