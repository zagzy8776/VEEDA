package com.veda.mobile.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraControl
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner

/**
 * Camera rPPG heart-rate capture controller.
 *
 * - Opens CameraX ImageAnalysis for YUV frames.
 * - Enables torch for the measurement window (visible camera-in-use indicator
 *   is provided by the web UI + the persistent notification).
 * - Emits raw R/G/B pulse samples. The caller must run the shared rPPG
 *   validation before rendering any heart-rate number.
 *
 * This controller deliberately never stores pixel data.
 */
class HeartRateCameraController(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val previewView: PreviewView
) {
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var cameraControl: CameraControl? = null
    private var rppgAnalyzer: RppgAnalyzer? = null

    fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED

    fun start(onMeasurement: (r: Double, g: Double, b: Double) -> Unit) {
        if (!hasCameraPermission()) return
        if (!com.veda.mobile.ConsentManager.hasConsent(context, com.veda.mobile.ConsentManager.FEATURE_CAMERA)) return

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            val analyzer = RppgAnalyzer(onMeasurement)
            rppgAnalyzer = analyzer
            analysis.setAnalyzer(ContextCompat.getMainExecutor(context), analyzer)
            imageAnalysis = analysis

            val selector = CameraSelector.DEFAULT_BACK_CAMERA
            cameraProvider?.unbindAll()
            try {
                val camera = cameraProvider?.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
                cameraControl = camera?.cameraControl
                cameraControl?.enableTorch(true)
            } catch (exc: Exception) {
                // Camera unavailable: the caller must surface "not available".
                stop()
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun stop() {
        try {
            cameraControl?.enableTorch(false)
        } catch (_: Exception) {
        }
        imageAnalysis?.clearAnalyzer()
        cameraProvider?.unbindAll()
        imageAnalysis = null
        rppgAnalyzer = null
        cameraControl = null
    }
}