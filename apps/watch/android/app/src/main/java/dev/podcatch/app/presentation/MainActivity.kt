package dev.podcatch.app.presentation

import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.MarqueeAnimationMode
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.google.android.horologist.annotations.ExperimentalHorologistApi
import com.google.android.horologist.audio.ui.VolumeScreen
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import coil.compose.AsyncImage
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import dev.podcatch.app.data.DataLayerContract
import dev.podcatch.app.data.EpisodeDownloadWorker
import dev.podcatch.app.data.WatchEpisode
import dev.podcatch.app.data.SyncedSubscriptions
import dev.podcatch.app.data.SyncedWatchEpisodes
import dev.podcatch.app.data.WatchDownloadStatusReporter
import dev.podcatch.app.playback.EpisodeProgress
import dev.podcatch.app.playback.EpisodeStatus
import dev.podcatch.app.playback.PlaybackState
import dev.podcatch.app.playback.statusOf
import java.io.File
import dev.podcatch.app.presentation.theme.PodcatchTheme

class MainActivity : ComponentActivity(), DataClient.OnDataChangedListener {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        SyncedWatchEpisodes.episodesDir = File(filesDir, "episodes")
        SyncedWatchEpisodes.artworkDir?.mkdirs()
        PlaybackState.init(this)
        setContent { PodcatchApp() }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(this)
        // Read any data that was replicated before we started listening
        Wearable.getDataClient(this)
            .getDataItems()
            .addOnSuccessListener { items ->
                for (item in items) {
                    val dataMap = DataMapItem.fromDataItem(item).dataMap
                    val json = dataMap.getString(DataLayerContract.KEY_ITEMS)
                    when (item.uri.path) {
                        DataLayerContract.PATH_SUBSCRIPTIONS -> {
                            Log.d(TAG, "Read existing subscriptions from Data Layer")
                            SyncedSubscriptions.update(json)
                        }
                        DataLayerContract.PATH_WATCH_EPISODES -> {
                            Log.d(TAG, "Read existing watch episodes from Data Layer")
                            SyncedWatchEpisodes.update(json)
                            WatchDownloadStatusReporter.reportStatus(this@MainActivity)
                            enqueueDownloads()
                        }
                    }
                }
                items.release()
            }
    }

    override fun onPause() {
        Wearable.getDataClient(this).removeListener(this)
        super.onPause()
    }

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
            val json = dataMap.getString(DataLayerContract.KEY_ITEMS)
            when (event.dataItem.uri.path) {
                DataLayerContract.PATH_SUBSCRIPTIONS -> {
                    Log.d(TAG, "Live data change: subscriptions updated")
                    SyncedSubscriptions.update(json)
                }
                DataLayerContract.PATH_WATCH_EPISODES -> {
                    Log.d(TAG, "Live data change: watch episodes updated")
                    SyncedWatchEpisodes.update(json)
                    WatchDownloadStatusReporter.reportStatus(this@MainActivity)
                    enqueueDownloads()
                }
            }
        }
    }

    private fun enqueueDownloads() {
        val hasWork = SyncedWatchEpisodes.episodes.value.any { episode ->
            (episode.localPath == null && episode.audioUrl.isNotBlank()) ||
                (episode.artworkPath == null && episode.artworkUrl.isNotBlank())
        }
        if (!hasWork) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
            .setConstraints(constraints)
            .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()

        WorkManager.getInstance(this).enqueueUniqueWork(
            EpisodeDownloadWorker.UNIQUE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request,
        )
        Log.d(TAG, "Enqueued episode download worker")
    }

    companion object {
        private const val TAG = "PodcatchMain"
    }
}

private fun enqueueEpisodeDownload(context: android.content.Context, episode: WatchEpisode) {
    if (episode.audioUrl.isBlank()) return
    android.widget.Toast.makeText(context, "Downloading…", android.widget.Toast.LENGTH_SHORT).show()
    val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()
    val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
        .setConstraints(constraints)
        .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
        EpisodeDownloadWorker.UNIQUE_WORK_NAME,
        ExistingWorkPolicy.KEEP,
        request,
    )
}

@OptIn(ExperimentalHorologistApi::class)
@Composable
fun PodcatchApp() {
    PodcatchTheme {
        val navController = rememberSwipeDismissableNavController()
        Scaffold(timeText = { TimeText() }) {
            SwipeDismissableNavHost(
                navController = navController,
                startDestination = "episodeList",
            ) {
                composable("episodeList") {
                    EpisodeListScreen(
                        onEpisodeClick = { episode ->
                            navController.navigate(
                                "player/${Uri.encode(episode.guid)}",
                            )
                        },
                    )
                }
                composable("player/{guid}") { backStackEntry ->
                    val guid = backStackEntry.arguments?.getString("guid") ?: return@composable
                    EpisodePlayerScreen(
                        guid = Uri.decode(guid),
                        onVolumeClick = { navController.navigate("volume") },
                        onSpeedClick = { navController.navigate("speed") },
                    )
                }
                composable("volume") {
                    VolumeScreen()
                }
                composable("speed") {
                    val playerEntry = remember(navController) {
                        navController.getBackStackEntry("player/{guid}")
                    }
                    val playerViewModel: EpisodePlayerViewModel = viewModel(
                        viewModelStoreOwner = playerEntry,
                    )
                    SpeedScreen(
                        currentSpeed = playerViewModel.currentSpeed,
                        onSpeedSelected = { speed -> playerViewModel.setSpeed(speed) },
                        onBack = { navController.popBackStack() },
                    )
                }
            }
        }
    }
}

/** Yellow dot = new, ring = part-listened, grey check = finished. */
@Composable
private fun EpisodeStatusIndicator(progress: EpisodeProgress?, isPlaying: Boolean) {
    if (isPlaying) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(18.dp)) {
            CircularProgressIndicator(
                progress = (progress?.fraction ?: 0f).coerceAtLeast(0.03f),
                indicatorColor = MaterialTheme.colors.primary,
                trackColor = Color.DarkGray,
                strokeWidth = 2.dp,
                modifier = Modifier.fillMaxSize(),
            )
            Icon(
                imageVector = Icons.Rounded.PlayArrow,
                contentDescription = "Playing",
                tint = MaterialTheme.colors.primary,
                modifier = Modifier.size(11.dp),
            )
        }
        return
    }
    when (statusOf(progress)) {
        EpisodeStatus.NEW -> Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(Color(0xFFFFC107)),
        )
        EpisodeStatus.IN_PROGRESS -> CircularProgressIndicator(
            progress = (progress?.fraction ?: 0f).coerceAtLeast(0.03f),
            indicatorColor = MaterialTheme.colors.primary,
            trackColor = Color.DarkGray,
            strokeWidth = 3.dp,
            modifier = Modifier.size(18.dp),
        )
        EpisodeStatus.COMPLETE -> Icon(
            imageVector = Icons.Rounded.CheckCircle,
            contentDescription = "Finished",
            tint = Color.Gray,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
fun EpisodeListScreen(onEpisodeClick: (WatchEpisode) -> Unit) {
    val episodes by SyncedWatchEpisodes.episodes.collectAsState()
    val progressByGuid by PlaybackState.progress.collectAsState()
    val playingGuid by PlaybackState.playingGuid.collectAsState()
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 32.dp, start = 8.dp, end = 8.dp),
    ) {
        if (episodes.isEmpty()) {
            item {
                Text(
                    text = "No episodes queued",
                    style = MaterialTheme.typography.body1,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        } else {
            items(episodes, key = { it.guid }) { episode ->
                val isDownloaded = episode.localPath != null
                val context = LocalContext.current
                Card(
                    onClick = {
                        if (isDownloaded) {
                            onEpisodeClick(episode)
                        } else {
                            enqueueEpisodeDownload(context, episode)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .alpha(if (isDownloaded) 1f else 0.6f),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val artworkModel = episode.artworkPath?.let { File(it) }
                            ?: episode.artworkUrl.takeIf { it.isNotBlank() }
                        if (artworkModel != null) {
                            AsyncImage(
                                model = artworkModel,
                                contentDescription = episode.podcastTitle,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(6.dp)),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = episode.title,
                                style = MaterialTheme.typography.body2,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.basicMarquee(
                                    animationMode = MarqueeAnimationMode.WhileFocused,
                                ),
                            )
                            Text(
                                text = episode.podcastTitle,
                                style = MaterialTheme.typography.caption2,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                        if (isDownloaded) {
                            EpisodeStatusIndicator(
                                progress = progressByGuid[episode.guid],
                                isPlaying = episode.guid == playingGuid,
                            )
                        } else if (episode.downloadProgress > 0) {
                            Text(
                                text = "${episode.downloadProgress}%",
                                style = MaterialTheme.typography.caption3,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Rounded.Download,
                                contentDescription = "Not downloaded",
                                tint = Color.Gray,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
