pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "veeda"
include(":app")

// Capacitor Android library (from the npm package @capacitor/android).
include(":capacitor")
project(":capacitor").projectDir = file("../node_modules/@capacitor/android/capacitor")