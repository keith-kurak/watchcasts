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
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text

/** 0.5x to 2.0x in 0.1 steps. Generated so the values match saved speeds exactly. */
private val SPEED_OPTIONS = (5..20).map { it / 10f }

@Composable
fun SpeedScreen(
    currentSpeed: Float,
    onSpeedSelected: (Float) -> Unit,
    onBack: () -> Unit,
) {
    // Open centred on the speed in use, so it needs no scrolling to confirm.
    val selectedIndex = SPEED_OPTIONS.indexOf(currentSpeed)
        .takeIf { it >= 0 }
        ?: SPEED_OPTIONS.indexOf(1.0f)
    val listState = rememberScalingLazyListState(initialCenterItemIndex = selectedIndex)

    ScalingLazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 32.dp, start = 8.dp, end = 8.dp),
    ) {
        items(SPEED_OPTIONS) { speed ->
            val label = "%.1fx".format(speed)
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
