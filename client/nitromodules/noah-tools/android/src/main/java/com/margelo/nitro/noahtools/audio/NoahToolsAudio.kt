package com.margelo.nitro.noahtools.audio

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import com.margelo.nitro.core.Promise
import java.io.File

object NoahToolsAudio {
    private var mediaPlayer: MediaPlayer? = null
    private lateinit var context: Context

    fun initialize(context: Context) {
        this.context = context
    }

    fun performPlayAudio(filePath: String): Promise<Unit> {
        return Promise.async {
            try {
                // Release any existing player
                mediaPlayer?.release()
                mediaPlayer = null

                val player = MediaPlayer()

                when {
                    filePath.startsWith("file://") -> {
                        // File URI
                        val uri = Uri.parse(filePath)
                        player.setDataSource(context, uri)
                    }
                    filePath.startsWith("/") -> {
                        // Absolute file path
                        player.setDataSource(filePath)
                    }
                    else -> {
                        // Asset file
                        val assetFileDescriptor = context.assets.openFd(filePath)
                        player.setDataSource(
                            assetFileDescriptor.fileDescriptor,
                            assetFileDescriptor.startOffset,
                            assetFileDescriptor.length
                        )
                        assetFileDescriptor.close()
                    }
                }

                player.prepare()
                player.start()

                mediaPlayer = player
                Unit
            } catch (e: Exception) {
                throw e
            }
        }
    }

    fun performPauseAudio() {
        try {
            mediaPlayer?.pause()
        } catch (e: Exception) {
            // Ignore
        }
    }

    fun performStopAudio() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {
            // Ignore
        }
    }

    fun performResumeAudio() {
        try {
            mediaPlayer?.start()
        } catch (e: Exception) {
            // Ignore
        }
    }

    fun performSeekAudio(positionSeconds: Double) {
        try {
            mediaPlayer?.seekTo((positionSeconds * 1000).toInt())
        } catch (e: Exception) {
            // Ignore
        }
    }

    fun performGetAudioDuration(): Double {
        return try {
            (mediaPlayer?.duration ?: 0) / 1000.0
        } catch (e: Exception) {
            0.0
        }
    }

    fun performGetAudioPosition(): Double {
        return try {
            (mediaPlayer?.currentPosition ?: 0) / 1000.0
        } catch (e: Exception) {
            0.0
        }
    }

    fun performIsAudioPlaying(): Boolean {
        return try {
            mediaPlayer?.isPlaying ?: false
        } catch (e: Exception) {
            false
        }
    }
}
