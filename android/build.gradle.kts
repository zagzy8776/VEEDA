// Top-level build file. The Android wrapper is the Capacitor native shell for
// VEEDA; all clinical/safety logic stays in the shared TypeScript modules and
// every native feature must obey the same consent, in-use-indicator and
// "not validated -> say unavailable" rules.
plugins {
    id("com.android.application") version "8.6.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("org.jetbrains.kotlin.kapt") version "2.0.21" apply false
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}