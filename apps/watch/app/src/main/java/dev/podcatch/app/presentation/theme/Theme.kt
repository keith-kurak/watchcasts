package dev.podcatch.app.presentation.theme

import androidx.compose.runtime.Composable
import androidx.wear.compose.material.MaterialTheme

@Composable
fun PodcatchTheme(content: @Composable () -> Unit) {
    // Wear OS Material (not the phone's material3). Customize colors/typography here.
    MaterialTheme(content = content)
}
