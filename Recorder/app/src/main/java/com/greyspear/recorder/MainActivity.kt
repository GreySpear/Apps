package com.greyspear.recorder

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.EditText
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.greyspear.recorder.crypto.CryptoManager
import com.greyspear.recorder.data.AppDatabase
import com.greyspear.recorder.data.Recording
import com.greyspear.recorder.data.RecordingDao
import com.greyspear.recorder.whisper.ModelManager
import com.greyspear.recorder.whisper.TranscriptionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_PERMISSIONS = 1
        private const val PREFS_NAME = "recorder_prefs"
        private const val PREF_MODEL = "whisper_model"
        private const val PREF_AUTO_TRANSCRIBE = "auto_transcribe"
        private const val DEFAULT_MODEL = "base"
    }

    private lateinit var tvStatus: TextView
    private lateinit var tvTimer: TextView
    private lateinit var btnRecord: MaterialButton
    private lateinit var btnCancelTranscribe: MaterialButton
    private lateinit var rvRecordings: RecyclerView
    private lateinit var tvEmpty: TextView
    private lateinit var etSearch: TextInputEditText

    private lateinit var dao: RecordingDao
    private lateinit var adapter: RecordingAdapter
    private lateinit var modelManager: ModelManager
    private lateinit var prefs: SharedPreferences
    private val transcriptionManager = TranscriptionManager()
    private val player = AudioPlayer()
    private val crypto = CryptoManager()
    private val handler = Handler(Looper.getMainLooper())
    private var currentlyPlayingId: Long? = null
    private var observeJob: Job? = null
    private var transcribeJob: Job? = null
    private var searchQuery: String = ""

    private var pendingSaveText: String? = null
    private var pendingSaveAudio: File? = null

    private val saveTranscriptLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("text/plain")
    ) { uri ->
        val text = pendingSaveText
        pendingSaveText = null
        if (uri != null && text != null) writeTextToUri(uri, text)
    }

    private val saveAudioLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("audio/x-wav")
    ) { uri ->
        val file = pendingSaveAudio
        if (uri != null && file != null) writeFileToUri(uri, file)
        pendingSaveAudio?.delete()
        pendingSaveAudio = null
    }

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

    private val playbackTick = object : Runnable {
        override fun run() {
            val id = currentlyPlayingId ?: return
            val mp = player.mediaPlayer ?: return
            if (mp.isPlaying && mp.duration > 0) {
                val progress = (mp.currentPosition * 100) / mp.duration
                adapter.updateProgress(id, progress)
                handler.postDelayed(this, 250)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setSupportActionBar(findViewById(R.id.toolbar))

        dao = AppDatabase.get(this).recordingDao()
        modelManager = ModelManager(this)
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

        tvStatus = findViewById(R.id.tvStatus)
        tvTimer = findViewById(R.id.tvTimer)
        btnRecord = findViewById(R.id.btnRecord)
        btnCancelTranscribe = findViewById(R.id.btnCancelTranscribe)
        rvRecordings = findViewById(R.id.rvRecordings)
        tvEmpty = findViewById(R.id.tvEmpty)
        etSearch = findViewById(R.id.etSearch)

        adapter = RecordingAdapter(
            onPlay = { rec -> togglePlayback(rec) },
            onMore = { anchor, rec -> showPopupMenu(anchor, rec) },
            onTranscribe = { rec -> transcribeRecording(rec) }
        )
        rvRecordings.layoutManager = LinearLayoutManager(this)
        rvRecordings.adapter = adapter

        btnRecord.setOnClickListener { toggleRecording() }
        btnCancelTranscribe.setOnClickListener { stopTranscription() }

        player.onCompletion = {
            runOnUiThread {
                handler.removeCallbacks(playbackTick)
                val oldId = currentlyPlayingId
                currentlyPlayingId = null
                adapter.playingId = null
                tvStatus.text = getString(R.string.status_idle)
            }
        }

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                searchQuery = s?.toString()?.trim() ?: ""
                observeRecordings()
            }
        })

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
        handler.removeCallbacks(playbackTick)
        if (player.isPlaying) {
            player.stop()
            currentlyPlayingId = null
            adapter.playingId = null
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
        transcriptionManager.cancel()
        transcribeJob?.cancel()
        transcriptionManager.release()
    }

    private fun observeRecordings() {
        observeJob?.cancel()
        observeJob = lifecycleScope.launch {
            val flow = if (searchQuery.isEmpty()) dao.getAll() else dao.search(searchQuery)
            flow.collectLatest { recordings ->
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
            handler.removeCallbacks(playbackTick)
            currentlyPlayingId = null
            adapter.playingId = null
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
                val id = dao.insert(
                    Recording(
                        title = title,
                        filePath = file.absolutePath,
                        createdAt = startMs,
                        durationMs = durationMs,
                        sizeBytes = file.length()
                    )
                )
                Log.i(TAG, "Saved recording: $title (${file.length()} bytes, ${durationMs}ms)")

                if (prefs.getBoolean(PREF_AUTO_TRANSCRIBE, false)) {
                    val rec = dao.getById(id)
                    if (rec != null) transcribeRecording(rec)
                }
            }
        }
    }

    private fun transcribeRecording(rec: Recording) {
        val model = selectedModel()
        val modelFile = modelManager.getModelFile(model)

        if (!modelManager.isModelDownloaded(model)) {
            promptModelDownload(rec)
            return
        }

        tvStatus.text = getString(R.string.model_loading)

        transcribeJob = lifecycleScope.launch {
            try {
                if (!transcriptionManager.isLoaded) {
                    val loaded = transcriptionManager.loadModel(modelFile)
                    if (!loaded) {
                        tvStatus.text = getString(R.string.transcription_failed)
                        Toast.makeText(this@MainActivity, "Failed to load model", Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                }

                showTranscribeControls()
                tvStatus.text = getString(R.string.transcribing)
                val result = transcriptionManager.transcribe(File(rec.filePath), cacheDir)

                result.onSuccess { text ->
                    dao.setTranscript(rec.id, text, System.currentTimeMillis())
                    tvStatus.text = getString(R.string.status_idle)
                    Log.i(TAG, "Transcription saved for ${rec.title}: ${text.length} chars")
                }.onFailure { e ->
                    if (e is TranscriptionManager.CancelledException) {
                        tvStatus.text = getString(R.string.transcription_cancelled)
                    } else {
                        tvStatus.text = getString(R.string.transcription_failed)
                        Toast.makeText(this@MainActivity, "Transcription failed: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            } finally {
                hideTranscribeControls()
                transcribeJob = null
            }
        }
    }

    private fun stopTranscription() {
        transcriptionManager.cancel()
        transcribeJob?.cancel()
        transcribeJob = null
        hideTranscribeControls()
        tvStatus.text = getString(R.string.transcription_cancelled)
    }

    private fun showTranscribeControls() {
        btnRecord.isEnabled = false
        btnCancelTranscribe.visibility = View.VISIBLE
    }

    private fun hideTranscribeControls() {
        btnRecord.isEnabled = true
        btnCancelTranscribe.visibility = View.GONE
    }

    private fun promptModelDownload(rec: Recording) {
        val model = selectedModel()
        val sizeMb = modelManager.getAvailableModels()
            .find { it.name == model }?.sizeBytes?.let { it / 1_000_000 } ?: "?"
        AlertDialog.Builder(this)
            .setTitle(R.string.model_settings)
            .setMessage("The $model model needs to be downloaded (~${sizeMb}MB). Download now?")
            .setPositiveButton("Download") { _, _ -> downloadAndTranscribe(rec) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun downloadAndTranscribe(rec: Recording) {
        val model = selectedModel()
        lifecycleScope.launch {
            tvStatus.text = getString(R.string.model_downloading, 0)

            val result = modelManager.downloadModel(model) { downloaded, total ->
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
            handler.removeCallbacks(playbackTick)
            currentlyPlayingId = null
            adapter.playingId = null
            tvStatus.text = getString(R.string.status_idle)
        } else {
            val file = File(rec.filePath)
            if (!file.exists()) {
                Toast.makeText(this, "Audio file not found", Toast.LENGTH_SHORT).show()
                return
            }
            player.play(file, cacheDir)
            currentlyPlayingId = rec.id
            adapter.playingId = rec.id
            tvStatus.text = getString(R.string.status_playing)
            handler.postDelayed(playbackTick, 250)
        }
    }

    private fun showPopupMenu(anchor: View, rec: Recording) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, R.string.rename)
            menu.add(0, 2, 1, R.string.delete)
            menu.add(0, 6, 2, R.string.export_audio)
            menu.add(0, 7, 3, R.string.save_audio)
            if (rec.transcript != null) {
                menu.add(0, 3, 4, R.string.share_transcript)
                menu.add(0, 4, 5, R.string.copy_transcript)
                menu.add(0, 8, 6, R.string.save_transcript)
                menu.add(0, 5, 7, R.string.re_transcribe)
            }
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> { showRenameDialog(rec); true }
                    2 -> { showDeleteDialog(rec); true }
                    3 -> { shareTranscript(rec); true }
                    4 -> { copyTranscript(rec); true }
                    5 -> { transcribeRecording(rec); true }
                    6 -> { exportAudio(rec); true }
                    7 -> { saveAudioToLocation(rec); true }
                    8 -> { saveTranscriptToLocation(rec); true }
                    else -> false
                }
            }
            show()
        }
    }

    private fun sanitizedName(title: String): String =
        title.replace(Regex("[^a-zA-Z0-9 _-]"), "").ifBlank { "recording" }

    private fun saveTranscriptToLocation(rec: Recording) {
        val text = rec.transcript ?: return
        pendingSaveText = text
        saveTranscriptLauncher.launch("${sanitizedName(rec.title)}.txt")
    }

    private fun saveAudioToLocation(rec: Recording) {
        val src = File(rec.filePath)
        if (!src.exists()) {
            Toast.makeText(this, "Audio file not found", Toast.LENGTH_SHORT).show()
            return
        }
        tvStatus.text = getString(R.string.exporting_audio)
        lifecycleScope.launch {
            val tmp = try {
                crypto.decryptToTempFile(src, cacheDir)
            } catch (e: Exception) {
                Log.w(TAG, "Decrypt failed, saving as plaintext", e)
                src.copyTo(File(cacheDir, "save_${System.currentTimeMillis()}.wav"), overwrite = true)
            }
            pendingSaveAudio = tmp
            tvStatus.text = getString(R.string.status_idle)
            saveAudioLauncher.launch("${sanitizedName(rec.title)}.wav")
        }
    }

    private fun writeTextToUri(uri: Uri, text: String) {
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
            Toast.makeText(this, R.string.saved_ok, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e(TAG, "Save transcript failed", e)
            Toast.makeText(this, R.string.save_failed, Toast.LENGTH_SHORT).show()
        }
    }

    private fun writeFileToUri(uri: Uri, file: File) {
        try {
            contentResolver.openOutputStream(uri)?.use { out ->
                file.inputStream().use { it.copyTo(out) }
            }
            Toast.makeText(this, R.string.saved_ok, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e(TAG, "Save audio failed", e)
            Toast.makeText(this, R.string.save_failed, Toast.LENGTH_SHORT).show()
        }
    }

    private fun shareTranscript(rec: Recording) {
        val text = rec.transcript ?: return
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, rec.title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_transcript)))
    }

    private fun copyTranscript(rec: Recording) {
        val text = rec.transcript ?: return
        val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(rec.title, text))
        Toast.makeText(this, R.string.transcript_copied, Toast.LENGTH_SHORT).show()
    }

    private fun exportAudio(rec: Recording) {
        tvStatus.text = getString(R.string.exporting_audio)
        lifecycleScope.launch {
            val srcFile = File(rec.filePath)
            if (!srcFile.exists()) {
                tvStatus.text = getString(R.string.status_idle)
                Toast.makeText(this@MainActivity, "Audio file not found", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val shareFile = try {
                val tmp = crypto.decryptToTempFile(srcFile, cacheDir)
                val named = File(cacheDir, "${rec.title.replace(Regex("[^a-zA-Z0-9 _-]"), "")}.wav")
                tmp.renameTo(named)
                named
            } catch (e: Exception) {
                val named = File(cacheDir, "${rec.title.replace(Regex("[^a-zA-Z0-9 _-]"), "")}.wav")
                srcFile.copyTo(named, overwrite = true)
                named
            }

            val uri = FileProvider.getUriForFile(
                this@MainActivity,
                "$packageName.fileprovider",
                shareFile
            )
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "audio/wav"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            tvStatus.text = getString(R.string.status_idle)
            startActivity(Intent.createChooser(intent, getString(R.string.export_audio)))
        }
    }

    private fun batchTranscribe() {
        val model = selectedModel()
        if (!modelManager.isModelDownloaded(model)) {
            Toast.makeText(this, getString(R.string.model_not_available), Toast.LENGTH_SHORT).show()
            return
        }

        transcribeJob = lifecycleScope.launch {
            try {
                val untranscribed = dao.getUntranscribed()
                if (untranscribed.isEmpty()) {
                    Toast.makeText(this@MainActivity, R.string.batch_transcribe_none, Toast.LENGTH_SHORT).show()
                    return@launch
                }

                val modelFile = modelManager.getModelFile(model)
                if (!transcriptionManager.isLoaded) {
                    tvStatus.text = getString(R.string.model_loading)
                    val loaded = transcriptionManager.loadModel(modelFile)
                    if (!loaded) {
                        tvStatus.text = getString(R.string.transcription_failed)
                        return@launch
                    }
                }

                showTranscribeControls()
                var completed = 0
                var cancelledEarly = false
                for (rec in untranscribed) {
                    if (!isActive) break
                    completed++
                    tvStatus.text = getString(R.string.batch_transcribe_progress, completed, untranscribed.size)

                    val result = transcriptionManager.transcribe(File(rec.filePath), cacheDir)
                    result.onSuccess { text ->
                        dao.setTranscript(rec.id, text, System.currentTimeMillis())
                        Log.i(TAG, "Batch transcribed ${rec.title}")
                    }.onFailure { e ->
                        if (e is TranscriptionManager.CancelledException) {
                            cancelledEarly = true
                        } else {
                            Log.e(TAG, "Batch transcription failed for ${rec.title}", e)
                        }
                    }
                    if (cancelledEarly) break
                }

                if (cancelledEarly) {
                    tvStatus.text = getString(R.string.transcription_cancelled)
                } else {
                    tvStatus.text = getString(R.string.status_idle)
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.batch_transcribe_done, completed),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } finally {
                hideTranscribeControls()
                transcribeJob = null
            }
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
                    handler.removeCallbacks(playbackTick)
                    currentlyPlayingId = null
                    adapter.playingId = null
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

    private fun selectedModel(): String =
        prefs.getString(PREF_MODEL, DEFAULT_MODEL) ?: DEFAULT_MODEL

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        menu.findItem(R.id.menu_auto_transcribe)?.isChecked =
            prefs.getBoolean(PREF_AUTO_TRANSCRIBE, false)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.menu_model -> { showModelPicker(); true }
            R.id.menu_batch_transcribe -> { batchTranscribe(); true }
            R.id.menu_auto_transcribe -> {
                val newVal = !item.isChecked
                item.isChecked = newVal
                prefs.edit().putBoolean(PREF_AUTO_TRANSCRIBE, newVal).apply()
                Toast.makeText(
                    this,
                    "Auto-transcribe ${if (newVal) "enabled" else "disabled"}",
                    Toast.LENGTH_SHORT
                ).show()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun showModelPicker() {
        val models = modelManager.getAvailableModels()
        val current = selectedModel()
        val labels = models.map { m ->
            val sizeMb = m.sizeBytes / 1_000_000
            val status = when {
                m.name == current && m.downloaded -> "active"
                m.downloaded -> "downloaded"
                else -> "not downloaded"
            }
            "${m.name} (~${sizeMb}MB) — $status"
        }.toTypedArray()

        val currentIdx = models.indexOfFirst { it.name == current }.coerceAtLeast(0)

        AlertDialog.Builder(this)
            .setTitle(R.string.model_settings)
            .setSingleChoiceItems(labels, currentIdx) { dialog, which ->
                val chosen = models[which]
                if (!chosen.downloaded) {
                    dialog.dismiss()
                    promptModelDownloadForPicker(chosen.name)
                } else {
                    selectModel(chosen.name)
                    dialog.dismiss()
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun selectModel(modelName: String) {
        val previous = selectedModel()
        prefs.edit().putString(PREF_MODEL, modelName).apply()
        if (previous != modelName && transcriptionManager.isLoaded) {
            transcriptionManager.release()
        }
        Toast.makeText(this, "Model set to $modelName", Toast.LENGTH_SHORT).show()
        Log.i(TAG, "Whisper model changed: $previous → $modelName")
    }

    private fun promptModelDownloadForPicker(modelName: String) {
        val sizeMb = modelManager.getAvailableModels()
            .find { it.name == modelName }?.sizeBytes?.let { it / 1_000_000 } ?: "?"
        AlertDialog.Builder(this)
            .setTitle(R.string.model_settings)
            .setMessage("Download the $modelName model (~${sizeMb}MB)?")
            .setPositiveButton("Download") { _, _ -> downloadModelForPicker(modelName) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun downloadModelForPicker(modelName: String) {
        lifecycleScope.launch {
            tvStatus.text = getString(R.string.model_downloading, 0)

            val result = modelManager.downloadModel(modelName) { downloaded, total ->
                if (total > 0) {
                    val pct = (downloaded * 100 / total).toInt()
                    handler.post { tvStatus.text = getString(R.string.model_downloading, pct) }
                }
            }

            result.onSuccess {
                selectModel(modelName)
                tvStatus.text = getString(R.string.status_idle)
            }.onFailure { e ->
                tvStatus.text = getString(R.string.model_download_failed)
                Toast.makeText(this@MainActivity, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
