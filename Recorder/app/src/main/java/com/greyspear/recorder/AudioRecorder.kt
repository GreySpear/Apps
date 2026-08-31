package com.greyspear.recorder

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean

class AudioRecorder {

    companion object {
        private const val TAG = "AudioRecorder"
        const val SAMPLE_RATE = 16_000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    }

    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private val isRecording = AtomicBoolean(false)

    val recording: Boolean get() = isRecording.get()

    fun start(outputFile: File) {
        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBuf == AudioRecord.ERROR || minBuf == AudioRecord.ERROR_BAD_VALUE) {
            Log.e(TAG, "getMinBufferSize failed: $minBuf")
            return
        }
        val bufSize = maxOf(minBuf, SAMPLE_RATE * 2)

        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufSize
        )

        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "AudioRecord failed to initialize")
            recorder.release()
            return
        }

        Log.i(TAG, "Configured: rate=${recorder.sampleRate} channels=${recorder.channelCount} " +
                "encoding=${recorder.audioFormat} bufSize=$bufSize")

        audioRecord = recorder
        isRecording.set(true)
        recorder.startRecording()

        recordingThread = Thread({
            writeWavFile(recorder, outputFile, bufSize)
        }, "AudioRecorder-IO").apply { start() }
    }

    fun stop(): Long {
        isRecording.set(false)
        recordingThread?.join(2000)
        recordingThread = null
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        return System.currentTimeMillis()
    }

    private fun writeWavFile(recorder: AudioRecord, file: File, bufSize: Int) {
        val buffer = ByteArray(bufSize)
        var totalBytes = 0L

        FileOutputStream(file).use { fos ->
            // placeholder WAV header — patched after recording
            fos.write(ByteArray(44))

            while (isRecording.get()) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read > 0) {
                    fos.write(buffer, 0, read)
                    totalBytes += read
                } else if (read < 0) {
                    Log.e(TAG, "AudioRecord.read error: $read")
                    break
                }
            }
        }

        patchWavHeader(file, totalBytes)
        Log.i(TAG, "Wrote ${file.name}: ${totalBytes} bytes PCM, " +
                "${totalBytes / (SAMPLE_RATE * 2)}s @ ${SAMPLE_RATE}Hz mono 16-bit")
    }

    private fun patchWavHeader(file: File, dataSize: Long) {
        RandomAccessFile(file, "rw").use { raf ->
            val totalSize = dataSize + 36
            val header = wavHeader(dataSize, totalSize)
            raf.seek(0)
            raf.write(header)
        }
    }

    private fun wavHeader(dataSize: Long, totalSize: Long): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = SAMPLE_RATE * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8

        return ByteArray(44).apply {
            // RIFF header
            set(0, 'R'.code.toByte()); set(1, 'I'.code.toByte())
            set(2, 'F'.code.toByte()); set(3, 'F'.code.toByte())
            writeInt32LE(this, 4, totalSize.toInt())
            set(8, 'W'.code.toByte()); set(9, 'A'.code.toByte())
            set(10, 'V'.code.toByte()); set(11, 'E'.code.toByte())
            // fmt sub-chunk
            set(12, 'f'.code.toByte()); set(13, 'm'.code.toByte())
            set(14, 't'.code.toByte()); set(15, ' '.code.toByte())
            writeInt32LE(this, 16, 16) // sub-chunk size
            writeInt16LE(this, 20, 1)  // PCM format
            writeInt16LE(this, 22, channels)
            writeInt32LE(this, 24, SAMPLE_RATE)
            writeInt32LE(this, 28, byteRate)
            writeInt16LE(this, 32, blockAlign)
            writeInt16LE(this, 34, bitsPerSample)
            // data sub-chunk
            set(36, 'd'.code.toByte()); set(37, 'a'.code.toByte())
            set(38, 't'.code.toByte()); set(39, 'a'.code.toByte())
            writeInt32LE(this, 40, dataSize.toInt())
        }
    }

    private fun writeInt32LE(buf: ByteArray, offset: Int, value: Int) {
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = (value shr 8 and 0xFF).toByte()
        buf[offset + 2] = (value shr 16 and 0xFF).toByte()
        buf[offset + 3] = (value shr 24 and 0xFF).toByte()
    }

    private fun writeInt16LE(buf: ByteArray, offset: Int, value: Int) {
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = (value shr 8 and 0xFF).toByte()
    }
}
