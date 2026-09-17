package com.greyspear.skald.spike

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Plays float PCM [-1, 1] as returned by sherpa-onnx, directly via AudioTrack in
 * float mode (no 16-bit conversion needed). Spike-simple: blocks until playback
 * finishes, then releases. Real Skald will stream chunks and keep the track alive.
 */
object AudioPlayer {

    fun play(samples: FloatArray, sampleRate: Int) {
        if (samples.isEmpty()) return

        val channelMask = AudioFormat.CHANNEL_OUT_MONO
        val encoding = AudioFormat.ENCODING_PCM_FLOAT
        val minBuf = AudioTrack.getMinBufferSize(sampleRate, channelMask, encoding)
        val bufSize = maxOf(minBuf, samples.size * 4) // 4 bytes per float

        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(encoding)
                    .setSampleRate(sampleRate)
                    .setChannelMask(channelMask)
                    .build()
            )
            .setBufferSizeInBytes(bufSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        track.play()
        track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
        track.stop()
        track.release()
    }
}
