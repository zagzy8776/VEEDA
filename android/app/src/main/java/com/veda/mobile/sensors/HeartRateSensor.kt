package com.veda.mobile.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Lightweight heart-rate sensor wrapper using the device's accelerometer
 * (for step counting) or other sensors. Camera rPPG is handled separately
 * by RppgAnalyzer.
 */
class HeartRateSensor(context: Context) : SensorEventListener {

    private val sensorManager = context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    var onStep: ((Int) -> Unit)? = null
    var isRunning = false
        private set

    fun start() {
        if (stepSensor == null) return
        sensorManager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_NORMAL)
        isRunning = true
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        isRunning = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_STEP_COUNTER) {
            val steps = event.values[0].toInt()
            onStep?.invoke(steps)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}