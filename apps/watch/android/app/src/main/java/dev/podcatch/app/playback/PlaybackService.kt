package dev.podcatch.app.playback

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.ui.WearUnsuitableOutputPlaybackSuppressionResolverListener
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import dev.podcatch.app.R
import dev.podcatch.app.data.PlaybackProgressSync
import dev.podcatch.app.data.SyncedWatchEpisodes
import dev.podcatch.app.data.UpNextQueue

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

    /**
     * Move the player onto a position that arrived from the phone.
     *
     * Only ever for an episode that is loaded and paused — [PlaybackState.applyRemoteProgress]
     * never raises a request for one that is playing. Without this the merge would not
     * survive: a paused player writes its own position on pause and on teardown, and that
     * write is newer than the phone's, so it would put the old position straight back.
     */
    private fun observeSeekRequests() {
        serviceScope.launch {
            PlaybackState.seekRequest.collect { request ->
                if (request == null) return@collect
                val player = mediaSession?.player
                val actionable = player != null &&
                    !player.isPlaying &&
                    player.currentMediaItem?.mediaId == request.guid
                if (actionable) player!!.seekTo(request.positionMs)
                // Cleared either way. The merge itself is already durable in prefs; this
                // request only exists to correct a live player, and holding a stale one
                // would block the next request from being noticed.
                PlaybackState.clearSeekRequest()
            }
        }
    }

    /**
     * Start the next queued episode when the current one ends.
     *
     * Skips queued episodes with no downloaded file rather than stopping at one. The queue
     * can outlive a download — an episode is removed from the watch, or a file is cleaned
     * up — and ending playback on an entry that was never playable is worse than passing
     * over it. Skipped episodes stay queued.
     */
    private fun playNextFromQueue(player: Player) {
        UpNextQueue.load(this)
        SyncedWatchEpisodes.load(this)
        val episodes = SyncedWatchEpisodes.episodes.value
        for (guid in UpNextQueue.guids.value) {
            val next = episodes.firstOrNull { it.guid == guid } ?: continue
            val localPath = next.localPath
            if (localPath.isNullOrBlank()) continue

            val metadata = MediaMetadata.Builder()
                .setTitle(next.title)
                .setArtist(next.podcastTitle)
                .build()
            val item = MediaItem.Builder()
                .setMediaId(next.guid)
                .setUri(localPath)
                .setMediaMetadata(metadata)
                .build()

            // Same rule the player screen uses: a finished episode starts over, a
            // part-listened one resumes.
            val saved = PlaybackState.getProgress(next.guid)
            val startPosition = if (saved.completed) 0L else saved.positionMs

            // Removed as it starts, not when it was queued: an episode is "up next" until
            // it becomes "now playing", and leaving it in both places reads as a duplicate.
            UpNextQueue.remove(next.guid)

            player.setMediaItem(item, startPosition)
            player.prepare()
            player.play()
            PlaybackState.setCurrentEpisode(next.guid)
            return
        }
    }

    /**
     * Seek buttons for the system media controls.
     *
     * These must be backed by [SessionCommand]s, not by `Player.COMMAND_SEEK_FORWARD` /
     * `COMMAND_SEEK_BACK`. Those player commands were already available — the legacy
     * `PlaybackState` has advertised REWIND and FAST_FORWARD all along — and the Wear
     * media controls app ignores them. It only draws extra buttons from the session's
     * *custom actions*, which a player-command button does not produce.
     *
     * Order matters, and slots do not. The Wear app takes custom actions in list order:
     * the first replaces its "Next" button, and every later one is buried in the
     * "More Actions" overflow. It pays no attention to [CommandButton.setSlots], so
     * forward goes first — a backward jump sitting where "Next" used to be reads wrong.
     * The slot hints stay for other surfaces that do honour them, such as the phone.
     *
     * The handlers call `seekBack()`/`seekForward()`, so the distance comes from the
     * increments set on the player and stays defined in one place.
     */
    private fun seekButtons(): List<CommandButton> = listOf(
        CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_30)
            .setSessionCommand(SessionCommand(ACTION_SEEK_FORWARD, Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_FORWARD)
            .setDisplayName(getString(R.string.seek_forward))
            .build(),
        CommandButton.Builder(CommandButton.ICON_SKIP_BACK_10)
            .setSessionCommand(SessionCommand(ACTION_SEEK_BACK, Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_BACK)
            .setDisplayName(getString(R.string.seek_back))
            .build(),
    )

    /** Accepts the two seek commands and runs them against the player. */
    private inner class SessionCallback : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                .add(SessionCommand(ACTION_SEEK_BACK, Bundle.EMPTY))
                .add(SessionCommand(ACTION_SEEK_FORWARD, Bundle.EMPTY))
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(commands)
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            // seekBack/seekForward use the increments configured on the player, so the
            // distance stays defined in exactly one place.
            when (customCommand.customAction) {
                ACTION_SEEK_BACK -> session.player.seekBack()
                ACTION_SEEK_FORWARD -> session.player.seekForward()
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    override fun onCreate() {
        super.onCreate()
        PlaybackState.init(this)
        // Every durable position write reaches the phone. The publisher throttles, so a
        // save every few seconds during playback does not become a put every few seconds.
        PlaybackState.setOnProgressSaved { PlaybackProgressSync.publish(this) }
        observeSeekRequests()

        val player = ExoPlayer.Builder(this)
            .setSeekForwardIncrementMs(SEEK_FORWARD_MS)
            .setSeekBackIncrementMs(SEEK_BACK_MS)
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
                        if (isPlaying) {
                            startPositionTicker()
                        } else {
                            stopPositionTicker()
                            // Pausing ends a listening session. Save and publish it now:
                            // the ViewModel also saves on pause, but it is gone as soon
                            // as you navigate away from the player screen.
                            val guid = PlaybackState.currentGuid
                            val player = mediaSession?.player
                            if (guid != null && player != null) {
                                PlaybackState.savePosition(
                                    guid,
                                    player.currentPosition,
                                    player.duration.coerceAtLeast(0L),
                                )
                                PlaybackProgressSync.publish(
                                    this@PlaybackService,
                                    force = true,
                                )
                            }
                        }
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) {
                            // Save the end position and stay there — don't reset
                            val guid = PlaybackState.currentGuid
                            val player = mediaSession?.player
                            if (guid != null && player != null) {
                                PlaybackState.markCompleted(guid, player.duration.coerceAtLeast(0L))
                                PlaybackProgressSync.publish(
                                    this@PlaybackService,
                                    force = true,
                                )
                                playNextFromQueue(player)
                            }
                        }
                    }
                })
            }

        mediaSession = MediaSession.Builder(this, player)
            .setCustomLayout(seekButtons())
            .setCallback(SessionCallback())
            .build()
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
        // Save position on service destroy
        mediaSession?.player?.let { player ->
            val guid = PlaybackState.currentGuid
            if (guid != null) {
                PlaybackState.savePosition(
                    guid,
                    player.currentPosition,
                    player.duration.coerceAtLeast(0L),
                )
                // The listening session just ended, so this is the position that matters.
                // Bypass the throttle rather than let it be the one update that is lost.
                PlaybackProgressSync.publish(this, force = true)
            }
            player.release()
        }
        PlaybackState.setOnProgressSaved(null)
        serviceScope.cancel()
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }

    companion object {
        /** Live UI cadence. Persistence stays on its own slower interval. */
        private const val POSITION_TICK_MS = 1_000L

        // Seek distances. Named because two things depend on each of them: the player's
        // increment, and the icon the media controls draw (ICON_SKIP_BACK_10 /
        // ICON_SKIP_FORWARD_30). Change one of these and its icon has to change with it,
        // or the button will lie about what it does.
        private const val SEEK_BACK_MS = 10_000L
        private const val SEEK_FORWARD_MS = 30_000L

        private const val ACTION_SEEK_BACK = "dev.podcatch.app.action.SEEK_BACK"
        private const val ACTION_SEEK_FORWARD = "dev.podcatch.app.action.SEEK_FORWARD"

        fun intent(context: Context) = Intent(context, PlaybackService::class.java)
    }
}
