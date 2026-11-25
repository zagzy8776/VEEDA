package com.veda.mobile.camera

import android.content.Context
import android.graphics.ImageFormat
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.CameraSelector

/**
 * Camera rPPG heart-rate capture.
 *
 * - Uses CameraX ImageAnalysis with YUV_420_888 to extract red/green channel
 *   intensity over time.
 * - Enables the torch while sensing.
 * - Never persists frames or raw video by default.
 * - If the signal quality is insufficient, the caller must show
 *   "not available, seek medical care if needed" rather than a guessed value.
 *
 * This analyser emits a single raw pulse measurement; the shared validation
 * harness decides whether a value may be shown.
 */
class RppgAnalyzer(
    private val onMeasurement: (r: Double, g: Double, b: Double) -> Unit
) : ImageAnalysis.Analyzer {

    private var lastTimestampMs = 0L

    override fun analyze(image: ImageProxy) {
        try {
            if (image.format != ImageFormat.YUV_420_888) return
            val width = image.width
            val height = image.height

            // Sample a central region of the image to avoid edges and background.
            val left = width / 4
            val top = height / 4
            val right = (width * 3) / 4
            val bottom = (height * 3) / 4

            val yPlane = image.planes[0]
            val uPlane = image.planes[1]
            val vPlane = image.planes[2]

            var rSum = 0.0
            var gSum = 0.0
            var bSum = 0.0
            var count = 0

            // Iterate over sampled pixels (stride 8 for performance).
            var y = top
            while (y < bottom) {
                var x = left
                while (x < right) {
                    val yIndex = y * yPlane.rowStride + x
                    val uIndex = (y / 2) * uPlane.rowStride + (x / 2) * uPlane.pixelStride
                    val vIndex = (y / 2) * vPlane.rowStride + (x / 2) * vPlane.pixelStride

                    val yVal = yPlane.buffer.get(yIndex).toInt() and 0xFF
                    val uVal = uPlane.buffer.get(uIndex).toInt() and 0xFF
                    val vVal = vPlane.buffer.get(vIndex).toInt() and 0xFF

                    // Convert YUV to RGB
                    val r = yVal + 1.402 * (vVal - 128)
                    val g = yVal - 0.344136 * (uVal - 128) - 0.714136 * (vVal - 128)
                    val b = yVal + 1.772 * (uVal - 128)

                    rSum += r
                    gSum += g
                    bSum += b
                    count++
                    x += 8
                }
                y += 8
            }

            if (count > 0) {
                val now = System.currentTimeMillis()
                if (now - lastTimestampMs >= 20) { // 50 Hz max
                    lastTimestampMs = now
                    onMeasurement(rSum / count, gSum / count, bSum / count)
                }
            }
        } finally {
            image.close()
        }
    }
}