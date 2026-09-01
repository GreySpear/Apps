package com.greyspear.recorder.whisper

import android.util.Log
import com.greyspear.recorder.crypto.CryptoManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

class TranscriptionManager {

    companion object {
        private const val TAG = "TranscriptionManager"
    }

    private val whisperLib = WhisperLib()
    private val crypto = CryptoManager()
    private var contextPtr: Long = 0

    @Volatile
    private var cancelled = false

    val isLoaded: Boolean get() = contextPtr != 0L

    class CancelledException : Exception("Transcription cancelled")

    /** Requests abort of the in-progress transcription. Safe to call from any thread. */
    fun cancel() {
        cancelled = true
        whisperLib.requestAbort()
        Log.i(TAG, "Transcription cancel requested")
    }

    suspend fun loadModel(modelFile: File): Boolean = withContext(Dispatchers.IO) {
        if (contextPtr != 0L) {
            whisperLib.freeContext(contextPtr)
            contextPtr = 0
        }
        contextPtr = whisperLib.initContext(modelFile.absolutePath)
        val ok = contextPtr != 0L
        Log.i(TAG, "Model load ${if (ok) "succeeded" else "failed"}: ${modelFile.name}")
        ok
    }

    suspend fun transcribe(wavFile: File, cacheDir: File): Result<String> = withContext(Dispatchers.IO) {
        if (contextPtr == 0L) {
            return@withContext Result.failure(IllegalStateException("Model not loaded"))
        }
        cancelled = false
        var decryptedTmp: File? = null
        try {
            val playFile = try {
                val tmp = crypto.decryptToTempFile(wavFile, cacheDir)
                decryptedTmp = tmp
                tmp
            } catch (e: Exception) {
                Log.w(TAG, "Decrypt failed, trying as plaintext", e)
                wavFile
            }

            if (cancelled) return@withContext Result.failure(CancelledException())

            val samples = readWavSamples(playFile)
            Log.i(TAG, "Read ${samples.size} samples from ${wavFile.name}")

            val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
            val text = whisperLib.transcribe(contextPtr, samples, threads)

            if (cancelled) {
                Result.failure(CancelledException())
            } else {
                Result.success(text.trim())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Transcription failed", e)
            Result.failure(e)
        } finally {
            decryptedTmp?.delete()
        }
    }

    fun release() {
        if (contextPtr != 0L) {
            whisperLib.freeContext(contextPtr)
            contextPtr = 0
        }
    }

    private fun readWavSamples(file: File): FloatArray {
        RandomAccessFile(file, "r").use { raf ->
            val header = ByteArray(44)
            raf.read(header)

            val buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
            val dataSize = buf.getInt(40)
            val numSamples = dataSize / 2 // 16-bit PCM

            val pcmBytes = ByteArray(dataSize)
            raf.read(pcmBytes)

            val pcmBuf = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
            val samples = FloatArray(numSamples)
            for (i in 0 until numSamples) {
                samples[i] = pcmBuf.getShort().toFloat() / 32768.0f
            }
            return samples
        }
    }
}
