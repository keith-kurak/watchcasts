package dev.podcatch.app.presentation

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.MarqueeAnimationMode
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Download
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
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
import dev.podcatch.app.presentation.theme.PodcatchTheme

class MainActivity : ComponentActivity(), DataClient.OnDataChangedListener {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
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
                    enqueueDownloads()
                }
            }
        }
    }

    private fun enqueueDownloads() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        for (episode in SyncedWatchEpisodes.episodes.value) {
            if (episode.localPath != null) continue
            if (episode.audioUrl.isBlank()) continue

            val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
                .setInputData(
                    workDataOf(
                        EpisodeDownloadWorker.KEY_GUID to episode.guid,
                        EpisodeDownloadWorker.KEY_AUDIO_URL to episode.audioUrl,
                    )
                )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(this).enqueueUniqueWork(
                "download-${episode.guid}",
                ExistingWorkPolicy.KEEP,
                request,
            )
            Log.d(TAG, "Enqueued download for ${episode.guid}")
        }
    }

    companion object {
        private const val TAG = "PodcatchMain"
    }
}

private fun enqueueEpisodeDownload(context: android.content.Context, episode: WatchEpisode) {
    if (episode.audioUrl.isBlank()) return
    val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()
    val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
        .setInputData(
            workDataOf(
                EpisodeDownloadWorker.KEY_GUID to episode.guid,
                EpisodeDownloadWorker.KEY_AUDIO_URL to episode.audioUrl,
            )
        )
        .setConstraints(constraints)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
        "download-${episode.guid}",
        ExistingWorkPolicy.KEEP,
        request,
    )
}

@Composable
fun PodcatchApp() {
    PodcatchTheme {
        Scaffold(timeText = { TimeText() }) {
            val episodes by SyncedWatchEpisodes.episodes.collectAsState()
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
                                    /* TODO: play episode */
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
                                if (episode.artworkUrl.isNotBlank()) {
                                    AsyncImage(
                                        model = episode.artworkUrl,
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
                                    Icon(
                                        imageVector = Icons.Rounded.CheckCircle,
                                        contentDescription = "Downloaded",
                                        tint = Color(0xFF4CAF50),
                                        modifier = Modifier.size(18.dp),
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
    }
}
