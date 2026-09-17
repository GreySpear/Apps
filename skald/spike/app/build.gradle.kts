plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.greyspear.skald.spike"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.greyspear.skald.spike"
        minSdk = 26          // AudioTrack float builder + modern APIs; fine for a personal device.
        targetSdk = 34
        versionCode = 1
        versionName = "0.0.1-spike"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }

    // The Piper .onnx model must NOT be compressed in the APK, or it may fail to load.
    androidResources {
        noCompress += listOf("onnx")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")

    // ── The load-bearing dependency ──────────────────────────────────────────
    // VERIFY the coordinate + version against the latest sherpa-onnx release
    // before building. See ../SPIKE.md §3. If no working Maven artifact exists,
    // drop the prebuilt .aar into app/libs/ and use the fileTree line below instead.
    implementation("com.k2-fsa:sherpa-onnx:1.10.28")
    // implementation(fileTree("libs") { include("*.aar") })
}
