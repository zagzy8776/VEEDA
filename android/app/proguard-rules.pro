# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in the Android SDK tools.

# VEEDA native wrapper: keep Capacitor plugin classes and consent/secure storage.
-keep class com.veda.mobile.** { *; }
-keep class com.getcapacitor.** { *; }
-keepattributes *Annotation*
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}