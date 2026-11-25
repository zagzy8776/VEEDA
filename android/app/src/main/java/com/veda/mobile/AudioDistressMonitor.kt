package com.veda.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat

/**
 * Foreground-only audio distress watch (scream / crash / loud impact).
 *
 * Non-negotiable rules:
 *  - Microphone consent must already be granted.
 *  - No audio is recorded or stored by default.
 *  - Several consecutive positives are required.
 *  - A detection only starts the check-in ladder; it never dials and never
 *    triggers an automatic SOS.
 *  - This watcher is foreground-only until a validated classifier exists.
 */
class AudioDistressMonitor(private val context: Context) {

    private val sampleRate = 16_000
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private var audioRecord: AudioRecord? = null
    private var isRunning = false
    private var consecutivePositives = 0

    // Operator/classifier-configurable. No thresholds by default.
    var loudnessThresholdDb: Float? = null
    var requiredConsecutivePositives: Int = 3

    var onDistressDetected: (() -> Unit)? = null

    fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED

    fun start() {
        if (!hasMicPermission()) return
        if (!ConsentManager.hasConsent(context, ConsentManager.FEATURE_AUDIO_DISTRESS)) return
        val threshold = loudnessThresholdDb ?: return

        val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        if (bufferSize <= 0) return

        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            channelConfig,
            audioFormat,
            bufferSize
        )

        val record = audioRecord ?: return
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            audioRecord = null
            return
        }

        record.startRecording()
        isRunning = true
        consecutivePositives = 0

        Thread {
            val buffer = ShortArray(bufferSize)
            while (isRunning) {
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0) {
                    val rms = rms(buffer, read)
                    val db = 20 * kotlin.math.log10(rms.coerceAtLeast(1e-6f))
                    if (db > threshold) {
                        consecutivePositives++
                        if (consecutivePositives >= requiredConsecutivePositives) {
                            consecutivePositives = 0
                            onDistressDetected?.invoke()
                        }
                    } else {
                        consecutivePositives = 0
                    }
                }
            }
        }.start()
    }

    fun stop() {
        isRunning = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }

    private fun rms(samples: ShortArray, count: Int): Float {
        var sum = 0.0
        for (i in 0 until count) {
            val s = samples[i].toDouble()
            sum += s * s
        }
        return kotlin.math.sqrt(sum / count).toFloat()
    }
}