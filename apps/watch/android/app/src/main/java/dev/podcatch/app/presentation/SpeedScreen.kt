package dev.podcatch.app.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text

private val SPEED_OPTIONS = listOf(0.5f, 0.7f, 0.8f, 0.9f, 1.0f, 1.2f, 1.5f, 1.7f, 2.0f)

@Composable
fun SpeedScreen(
    currentSpeed: Float,
    onSpeedSelected: (Float) -> Unit,
    onBack: () -> Unit,
) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 32.dp, start = 8.dp, end = 8.dp),
    ) {
        items(SPEED_OPTIONS) { speed ->
            val label = if (speed == speed.toInt().toFloat()) {
                "${speed.toInt()}.0x"
            } else {
                "${speed}x"
            }
            Chip(
                onClick = {
                    onSpeedSelected(speed)
                    onBack()
                },
                label = { Text(label) },
                icon = if (speed == currentSpeed) {
                    {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = "Selected",
                        )
                    }
                } else {
                    null
                },
                colors = ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
