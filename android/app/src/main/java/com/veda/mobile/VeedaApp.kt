package com.veda.mobile

import android.app.Application
import com.veda.mobile.work.WorkManagerScheduler

/**
 * Application class for the VEEDA native wrapper.
 *
 * Initializes WorkManager with a custom configuration so that the offline
 * queue sync worker can run reliably.
 */
class VeedaApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // WorkManager initialization is automatic; we configure it here
        // to use a custom WorkerFactory if needed.
        WorkManagerScheduler.ensureInitialized(this)
    }
}