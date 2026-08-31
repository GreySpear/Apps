package com.greyspear.recorder.whisper

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class ModelManager(private val context: Context) {

    companion object {
        private const val TAG = "ModelManager"
        private const val MODELS_DIR = "whisper-models"

        private val MODEL_URLS = mapOf(
            "tiny" to "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
            "base" to "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
            "small" to "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
        )

        private val MODEL_SIZES = mapOf(
            "tiny" to 75_000_000L,
            "base" to 142_000_000L,
            "small" to 466_000_000L
        )
    }

    private val modelsDir: File
        get() = File(context.filesDir, MODELS_DIR).also { it.mkdirs() }

    fun getModelFile(modelName: String): File =
        File(modelsDir, "ggml-$modelName.bin")

    fun isModelDownloaded(modelName: String): Boolean {
        val file = getModelFile(modelName)
        val expectedSize = MODEL_SIZES[modelName] ?: return false
        return file.exists() && file.length() > expectedSize * 0.9
    }

    fun getAvailableModels(): List<ModelInfo> =
        MODEL_URLS.keys.map { name ->
            ModelInfo(
                name = name,
                sizeBytes = MODEL_SIZES[name] ?: 0,
                downloaded = isModelDownloaded(name)
            )
        }

    suspend fun downloadModel(
        modelName: String,
        onProgress: (bytesDownloaded: Long, totalBytes: Long) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        val url = MODEL_URLS[modelName]
            ?: return@withContext Result.failure(IllegalArgumentException("Unknown model: $modelName"))

        val outFile = getModelFile(modelName)
        val tmpFile = File(outFile.parent, "${outFile.name}.tmp")

        try {
            Log.i(TAG, "Downloading $modelName from $url")
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 30_000
            conn.readTimeout = 30_000
            conn.instanceFollowRedirects = true
            conn.connect()

            val totalBytes = conn.contentLengthLong.let {
                if (it > 0) it else MODEL_SIZES[modelName] ?: -1L
            }

            conn.inputStream.use { input ->
                FileOutputStream(tmpFile).use { output ->
                    val buf = ByteArray(8192)
                    var downloaded = 0L
                    var read: Int

                    while (input.read(buf).also { read = it } != -1) {
                        output.write(buf, 0, read)
                        downloaded += read
                        onProgress(downloaded, totalBytes)
                    }
                }
            }

            tmpFile.renameTo(outFile)
            Log.i(TAG, "Download complete: ${outFile.name} (${outFile.length()} bytes)")
            Result.success(outFile)
        } catch (e: Exception) {
            Log.e(TAG, "Download failed", e)
            tmpFile.delete()
            Result.failure(e)
        }
    }

    fun deleteModel(modelName: String) {
        getModelFile(modelName).delete()
    }

    data class ModelInfo(
        val name: String,
        val sizeBytes: Long,
        val downloaded: Boolean
    )
}
