package com.greyspear.recorder

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.greyspear.recorder.data.AppDatabase
import com.greyspear.recorder.data.Recording
import com.greyspear.recorder.data.RecordingDao
import com.greyspear.recorder.whisper.ModelManager
import com.greyspear.recorder.whisper.TranscriptionManager
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_PERMISSIONS = 1
        private const val DEFAULT_MODEL = "base"
    }

    private lateinit var tvStatus: TextView
    private lateinit var tvTimer: TextView
    private lateinit var btnRecord: MaterialButton
    private lateinit var rvRecordings: RecyclerView
    private lateinit var tvEmpty: TextView

    private lateinit var dao: RecordingDao
    private lateinit var adapter: RecordingAdapter
    private lateinit var modelManager: ModelManager
    private val transcriptionManager = TranscriptionManager()
    private val player = AudioPlayer()
    private val handler = Handler(Looper.getMainLooper())
    private var currentlyPlayingId: Long? = null

    private var service: RecordingService? = null
    private var bound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = (binder as RecordingService.LocalBinder).service
            bound = true
            if (service?.isRecording == true) {
                onReconnectedWhileRecording()
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
            bound = false
        }
    }

    private val timerTick = object : Runnable {
        override fun run() {
            val svc = service ?: return
            if (svc.isRecording) {
                val elapsed = (System.currentTimeMillis() - svc.recordingStartMs) / 1000
                val text = formatSeconds(elapsed)
                tvTimer.text = text
                svc.updateNotificationTimer(text)
                handler.postDelayed(this, 500)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        dao = AppDatabase.get(this).recordingDao()
        modelManager = ModelManager(this)

        tvStatus = findViewById(R.id.tvStatus)
        tvTimer = findViewById(R.id.tvTimer)
        btnRecord = findViewById(R.id.btnRecord)
        rvRecordings = findViewById(R.id.rvRecordings)
        tvEmpty = findViewById(R.id.tvEmpty)

        adapter = RecordingAdapter(
            onPlay = { rec -> togglePlayback(rec) },
            onMore = { anchor, rec -> showPopupMenu(anchor, rec) },
            onTranscribe = { rec -> transcribeRecording(rec) }
        )
        rvRecordings.layoutManager = LinearLayoutManager(this)
        rvRecordings.adapter = adapter

        btnRecord.setOnClickListener { toggleRecording() }

        player.onCompletion = {
            runOnUiThread {
                currentlyPlayingId = null
                tvStatus.text = getString(R.string.status_idle)
            }
        }

        observeRecordings()
        requestRequiredPermissions()
    }

    override fun onStart() {
        super.onStart()
        Intent(this, RecordingService::class.java).also {
            bindService(it, connection, Context.BIND_AUTO_CREATE)
        }
    }

    override fun onStop() {
        super.onStop()
        handler.removeCallbacks(timerTick)
        if (player.isPlaying) {
            player.stop()
            currentlyPlayingId = null
        }
        if (bound) {
            unbindService(connection)
            bound = false
            service = null
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player.stop()
        transcriptionManager.release()
    }

    private fun observeRecordings() {
        lifecycleScope.launch {
            dao.getAll().collect { recordings ->
                adapter.submitList(recordings)
                tvEmpty.visibility = if (recordings.isEmpty()) View.VISIBLE else View.GONE
            }
        }
    }

    private fun onReconnectedWhileRecording() {
        tvStatus.text = getString(R.string.status_recording)
        btnRecord.text = getString(R.string.stop)
        handler.post(timerTick)
    }

    private fun toggleRecording() {
        val svc = service
        if (svc != null && svc.isRecording) {
            stopRecording(svc)
        } else {
            startRecording()
        }
    }

    private fun startRecording() {
        if (!hasAudioPermission()) {
            requestRequiredPermissions()
            return
        }

        if (player.isPlaying) {
            player.stop()
            currentlyPlayingId = null
        }

        val file = File(filesDir, "recording_${System.currentTimeMillis()}.wav")
        val intent = RecordingService.startIntent(this, file.absolutePath)
        ContextCompat.startForegroundService(this, intent)

        tvStatus.text = getString(R.string.status_recording)
        tvTimer.text = formatSeconds(0)
        btnRecord.text = getString(R.string.stop)

        handler.postDelayed(timerTick, 500)
    }

    private fun stopRecording(svc: RecordingService) {
        handler.removeCallbacks(timerTick)
        val startMs = svc.recordingStartMs
        val file = svc.stopRecording()

        tvStatus.text = getString(R.string.status_done)
        btnRecord.text = getString(R.string.record)

        if (file != null && file.exists()) {
            val durationMs = System.currentTimeMillis() - startMs
            val title = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
                .format(Date(startMs))

            lifecycleScope.launch {
                dao.insert(
                    Recording(
                        title = title,
                        filePath = file.absolutePath,
                        createdAt = startMs,
                        durationMs = durationMs,
                        sizeBytes = file.length()
                    )
                )
                Log.i(TAG, "Saved recording: $title (${file.length()} bytes, ${durationMs}ms)")
            }
        }
    }

    private fun transcribeRecording(rec: Recording) {
        val modelFile = modelManager.getModelFile(DEFAULT_MODEL)

        if (!modelManager.isModelDownloaded(DEFAULT_MODEL)) {
            promptModelDownload(rec)
            return
        }

        tvStatus.text = getString(R.string.model_loading)

        lifecycleScope.launch {
            if (!transcriptionManager.isLoaded) {
                val loaded = transcriptionManager.loadModel(modelFile)
                if (!loaded) {
                    tvStatus.text = getString(R.string.transcription_failed)
                    Toast.makeText(this@MainActivity, "Failed to load model", Toast.LENGTH_SHORT).show()
                    return@launch
                }
            }

            tvStatus.text = getString(R.string.transcribing)
            val result = transcriptionManager.transcribe(File(rec.filePath), cacheDir)

            result.onSuccess { text ->
                dao.setTranscript(rec.id, text, System.currentTimeMillis())
                tvStatus.text = getString(R.string.status_idle)
                Log.i(TAG, "Transcription saved for ${rec.title}: ${text.length} chars")
            }.onFailure { e ->
                tvStatus.text = getString(R.string.transcription_failed)
                Toast.makeText(this@MainActivity, "Transcription failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun promptModelDownload(rec: Recording) {
        AlertDialog.Builder(this)
            .setTitle(R.string.model_settings)
            .setMessage("The $DEFAULT_MODEL model needs to be downloaded (~${modelManager.getAvailableModels().find { it.name == DEFAULT_MODEL }?.sizeBytes?.let { it / 1_000_000 } ?: "?"}MB). Download now?")
            .setPositiveButton("Download") { _, _ -> downloadAndTranscribe(rec) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun downloadAndTranscribe(rec: Recording) {
        lifecycleScope.launch {
            tvStatus.text = getString(R.string.model_downloading, 0)

            val result = modelManager.downloadModel(DEFAULT_MODEL) { downloaded, total ->
                if (total > 0) {
                    val pct = (downloaded * 100 / total).toInt()
                    handler.post {
                        tvStatus.text = getString(R.string.model_downloading, pct)
                    }
                }
            }

            result.onSuccess {
                transcribeRecording(rec)
            }.onFailure { e ->
                tvStatus.text = getString(R.string.model_download_failed)
                Toast.makeText(this@MainActivity, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun togglePlayback(rec: Recording) {
        if (currentlyPlayingId == rec.id) {
            player.stop()
            currentlyPlayingId = null
            tvStatus.text = getString(R.string.status_idle)
        } else {
            val file = File(rec.filePath)
            if (!file.exists()) {
                Toast.makeText(this, "Audio file not found", Toast.LENGTH_SHORT).show()
                return
            }
            player.play(file, cacheDir)
            currentlyPlayingId = rec.id
            tvStatus.text = getString(R.string.status_playing)
        }
    }

    private fun showPopupMenu(anchor: View, rec: Recording) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, R.string.rename)
            menu.add(0, 2, 1, R.string.delete)
            if (rec.transcript != null) {
                menu.add(0, 3, 2, R.string.transcribe)
            }
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> { showRenameDialog(rec); true }
                    2 -> { showDeleteDialog(rec); true }
                    3 -> { transcribeRecording(rec); true }
                    else -> false
                }
            }
            show()
        }
    }

    private fun showRenameDialog(rec: Recording) {
        val input = EditText(this).apply {
            setText(rec.title)
            selectAll()
            setPadding(64, 32, 64, 16)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.rename_title)
            .setView(input)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val newTitle = input.text.toString().trim()
                if (newTitle.isNotEmpty()) {
                    lifecycleScope.launch { dao.rename(rec.id, newTitle) }
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun showDeleteDialog(rec: Recording) {
        AlertDialog.Builder(this)
            .setTitle(R.string.delete_confirm_title)
            .setMessage(getString(R.string.delete_confirm_message, rec.title))
            .setPositiveButton(R.string.delete) { _, _ ->
                if (currentlyPlayingId == rec.id) {
                    player.stop()
                    currentlyPlayingId = null
                }
                lifecycleScope.launch {
                    dao.delete(rec.id)
                    File(rec.filePath).delete()
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun formatSeconds(s: Long): String =
        String.format(Locale.US, "%02d:%02d", s / 60, s % 60)

    private fun hasAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestRequiredPermissions() {
        val needed = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQUEST_PERMISSIONS)
        }
    }
}
