package dev.podcatch.app.playback

import android.content.Context
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.ui.WearUnsuitableOutputPlaybackSuppressionResolverListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var positionTicker: Job? = null

    /**
     * Publish the play position once a second for as long as audio is playing.
     *
     * The player screen's ViewModel also autosaves, but it is torn down as soon as you
     * navigate away — so without this, anything outside the player screen (the
     * now-playing bar on the episode list) would show a position frozen at whatever was
     * last written. This only touches the in-memory flow; durability stays with
     * [PlaybackState.savePosition].
     */
    private fun startPositionTicker() {
        if (positionTicker?.isActive == true) return
        positionTicker = serviceScope.launch {
            while (true) {
                val player = mediaSession?.player
                val guid = player?.currentMediaItem?.mediaId
                if (player != null && guid != null && player.isPlaying) {
                    PlaybackState.publishPosition(
                        guid,
                        player.currentPosition,
                        player.duration.coerceAtLeast(0L),
                    )
                }
                delay(POSITION_TICK_MS)
            }
        }
    }

    private fun stopPositionTicker() {
        positionTicker?.cancel()
        positionTicker = null
    }

    override fun onCreate() {
        super.onCreate()
        PlaybackState.init(this)

        val player = ExoPlayer.Builder(this)
            .setSeekForwardIncrementMs(30_000L)
            .setSeekBackIncrementMs(10_000L)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setSuppressPlaybackOnUnsuitableOutput(true)
            .build()
            .also {
                it.addListener(WearUnsuitableOutputPlaybackSuppressionResolverListener(this))
                it.addListener(object : Player.Listener {
                    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                        // Save position of previous episode when switching
                        val prevGuid = PlaybackState.currentGuid
                        val newGuid = mediaItem?.mediaId
                        if (prevGuid != null && prevGuid != newGuid) {
                            // Position was already saved before setMedia in the ViewModel
                        }
                        if (newGuid != null) {
                            PlaybackState.setCurrentEpisode(newGuid)
                        }
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        PlaybackState.setPlaying(isPlaying)
                        if (isPlaying) startPositionTicker() else stopPositionTicker()
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) {
                            // Save the end position and stay there — don't reset
                            val guid = PlaybackState.currentGuid
                            val player = mediaSession?.player
                            if (guid != null && player != null) {
                                PlaybackState.markCompleted(guid, player.duration.coerceAtLeast(0L))
                            }
                        }
                    }
                })
            }

        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player
        // Save position before potentially stopping
        if (player != null) {
            val guid = PlaybackState.currentGuid
            if (guid != null) {
                PlaybackState.savePosition(
                    guid,
                    player.currentPosition,
                    player.duration.coerceAtLeast(0L),
                )
            }
        }
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        stopPositionTicker()
        serviceScope.cancel()
        // Save position on service destroy
        mediaSession?.player?.let { player ->
            val guid = PlaybackState.currentGuid
            if (guid != null) {
                PlaybackState.savePosition(
                    guid,
                    player.currentPosition,
                    player.duration.coerceAtLeast(0L),
                )
            }
            player.release()
        }
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }

    companion object {
        /** Live UI cadence. Persistence stays on its own slower interval. */
        private const val POSITION_TICK_MS = 1_000L

        fun intent(context: Context) = Intent(context, PlaybackService::class.java)
    }
}
