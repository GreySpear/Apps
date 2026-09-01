package com.greyspear.recorder

import android.media.MediaPlayer
import android.util.Log
import com.greyspear.recorder.crypto.CryptoManager
import java.io.File

class AudioPlayer {

    companion object {
        private const val TAG = "AudioPlayer"
    }

    var mediaPlayer: MediaPlayer? = null
        private set
    private var decryptedTmp: File? = null
    private val crypto = CryptoManager()

    val isPlaying: Boolean get() = mediaPlayer?.isPlaying == true

    var onCompletion: (() -> Unit)? = null

    fun play(file: File, cacheDir: File) {
        stop()
        if (!file.exists()) {
            Log.e(TAG, "File not found: ${file.absolutePath}")
            return
        }

        val playFile = try {
            val tmp = crypto.decryptToTempFile(file, cacheDir)
            decryptedTmp = tmp
            tmp
        } catch (e: Exception) {
            Log.w(TAG, "Decrypt failed, trying as plaintext", e)
            file
        }

        mediaPlayer = MediaPlayer().apply {
            setDataSource(playFile.absolutePath)
            setOnCompletionListener {
                cleanupTmp()
                onCompletion?.invoke()
            }
            setOnErrorListener { _, what, extra ->
                Log.e(TAG, "Playback error: what=$what extra=$extra")
                cleanupTmp()
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
        cleanupTmp()
    }

    private fun cleanupTmp() {
        decryptedTmp?.delete()
        decryptedTmp = null
    }
}
