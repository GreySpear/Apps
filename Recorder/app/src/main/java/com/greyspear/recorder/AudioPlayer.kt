package com.greyspear.recorder

import android.media.MediaPlayer
import android.util.Log
import java.io.File

class AudioPlayer {

    companion object {
        private const val TAG = "AudioPlayer"
    }

    private var mediaPlayer: MediaPlayer? = null

    val isPlaying: Boolean get() = mediaPlayer?.isPlaying == true

    var onCompletion: (() -> Unit)? = null

    fun play(file: File) {
        stop()
        if (!file.exists()) {
            Log.e(TAG, "File not found: ${file.absolutePath}")
            return
        }
        mediaPlayer = MediaPlayer().apply {
            setDataSource(file.absolutePath)
            setOnCompletionListener {
                onCompletion?.invoke()
            }
            setOnErrorListener { _, what, extra ->
                Log.e(TAG, "Playback error: what=$what extra=$extra")
                true
            }
            prepare()
            Log.i(TAG, "Playing ${file.name}: duration=${duration}ms")
            start()
        }
    }

    fun stop() {
        mediaPlayer?.let {
            if (it.isPlaying) it.stop()
            it.release()
        }
        mediaPlayer = null
    }
}
