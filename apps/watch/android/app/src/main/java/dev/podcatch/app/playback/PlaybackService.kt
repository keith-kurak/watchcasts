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

class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null

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

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) {
                            // Save the end position and stay there — don't reset
                            val guid = PlaybackState.currentGuid
                            val player = mediaSession?.player
                            if (guid != null && player != null) {
                                PlaybackState.savePosition(guid, player.duration)
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
                PlaybackState.savePosition(guid, player.currentPosition)
            }
        }
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        // Save position on service destroy
        mediaSession?.player?.let { player ->
            val guid = PlaybackState.currentGuid
            if (guid != null) {
                PlaybackState.savePosition(guid, player.currentPosition)
            }
            player.release()
        }
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }

    companion object {
        fun intent(context: Context) = Intent(context, PlaybackService::class.java)
    }
}
