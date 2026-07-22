plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "dev.podcatch.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.keithkurak.watchcasts"  // MUST match the phone app
        minSdk = 30                          // Wear OS 3.0
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        // Debug signing must use the SAME keystore as the Expo-built phone app,
        // or the Wearable Data Layer API refuses to route between them.
        val debugKeystore = file("${rootProject.projectDir}/../../mobile/android/app/debug.keystore")
        if (debugKeystore.exists()) {
            getByName("debug") {
                storeFile = debugKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }

        // Release signing pulls from gradle properties / env so the same keystore
        // used by the phone app can be referenced without committing secrets.
        val keystorePath = project.findProperty("PODCATCH_KEYSTORE_PATH") as String?
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = project.findProperty("PODCATCH_KEYSTORE_PASSWORD") as String?
                keyAlias = project.findProperty("PODCATCH_KEY_ALIAS") as String?
                keyPassword = project.findProperty("PODCATCH_KEY_PASSWORD") as String?
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = "dev"
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Apply release signing only if the keystore was configured.
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Compose for Wear OS
    implementation(libs.androidx.wear.compose.material)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.wear.compose.navigation)

    // Phone <-> watch communication + background downloads
    implementation(libs.play.services.wearable)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.coil.compose)

    // Horologist media player UI + data
    implementation(libs.horologist.media.ui)
    implementation(libs.horologist.media.data)
    implementation(libs.horologist.audio.ui)
    implementation(libs.horologist.media)

    // Media3 ExoPlayer for local audio playback
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.media3.ui)
}
