package dev.podcatch.app.presentation

import android.app.Application
import android.os.Vibrator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.exoplayer.ExoPlayer
import com.google.android.horologist.annotations.ExperimentalHorologistApi
import com.google.android.horologist.audio.SystemAudioRepository
import com.google.android.horologist.audio.ui.VolumeViewModel
import com.google.android.horologist.audio.ui.components.actions.SetVolumeButton
import com.google.android.horologist.media.data.repository.PlayerRepositoryImpl
import com.google.android.horologist.media.model.Media
import com.google.android.horologist.media.ui.components.PodcastControlButtons
import com.google.android.horologist.media.ui.screens.player.DefaultMediaInfoDisplay
import com.google.android.horologist.media.ui.screens.player.PlayerScreen
import com.google.android.horologist.media.ui.state.PlayerViewModel
import dev.podcatch.app.data.SyncedWatchEpisodes
import dev.podcatch.app.data.WatchEpisode
import kotlinx.coroutines.launch

@OptIn(ExperimentalHorologistApi::class)
@Composable
fun EpisodePlayerScreen(guid: String, onVolumeClick: () -> Unit) {
    val episodes by SyncedWatchEpisodes.episodes.collectAsState()
    val episode = episodes.find { it.guid == guid }
    if (episode == null || episode.localPath == null) return

    val context = LocalContext.current
    val application = context.applicationContext as Application

    val playerViewModel: EpisodePlayerViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return EpisodePlayerViewModel(application, episode) as T
            }
        },
    )

    val volumeViewModel: VolumeViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val audioRepository = SystemAudioRepository.fromContext(application)
                val vibrator = application.getSystemService(Vibrator::class.java)
                return VolumeViewModel(
                    audioRepository,
                    audioRepository,
                    onCleared = { audioRepository.close() },
                    vibrator,
                ) as T
            }
        },
    )

    val volumeUiState by volumeViewModel.volumeUiState.collectAsState()

    PlayerScreen(
        playerViewModel = playerViewModel,
        volumeViewModel = volumeViewModel,
        mediaDisplay = { playerUiState ->
            DefaultMediaInfoDisplay(playerUiState)
        },
        controlButtons = { playerUiController, playerUiState ->
            PodcastControlButtons(
                playerController = playerUiController,
                playerUiState = playerUiState,
            )
        },
        buttons = { _ ->
            SetVolumeButton(
                onVolumeClick = onVolumeClick,
                volumeUiState = volumeUiState,
            )
        },
    )
}

@OptIn(ExperimentalHorologistApi::class)
class EpisodePlayerViewModel(
    application: Application,
    episode: WatchEpisode,
    private val repository: PlayerRepositoryImpl = PlayerRepositoryImpl(),
) : PlayerViewModel(repository) {

    private val exoPlayer: ExoPlayer = ExoPlayer.Builder(application)
        .setSeekForwardIncrementMs(10_000L)
        .setSeekBackIncrementMs(10_000L)
        .build()

    init {
        viewModelScope.launch {
            repository.connect(exoPlayer) {}
            repository.setMedia(
                Media(
                    id = episode.guid,
                    uri = episode.localPath ?: "",
                    title = episode.title,
                    artist = episode.podcastTitle,
                ),
            )
        }
    }

    override fun onCleared() {
        super.onCleared()
        exoPlayer.release()
    }
}
