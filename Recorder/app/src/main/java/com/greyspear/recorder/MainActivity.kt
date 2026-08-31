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
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import java.io.File
import java.io.RandomAccessFile
import java.util.Locale

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_PERMISSIONS = 1
    }

    private lateinit var tvStatus: TextView
    private lateinit var tvTimer: TextView
    private lateinit var tvFormat: TextView
    private lateinit var btnRecord: MaterialButton
    private lateinit var btnPlay: MaterialButton

    private val player = AudioPlayer()
    private val handler = Handler(Looper.getMainLooper())
    private var lastRecordingFile: File? = null

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

        tvStatus = findViewById(R.id.tvStatus)
        tvTimer = findViewById(R.id.tvTimer)
        tvFormat = findViewById(R.id.tvFormat)
        btnRecord = findViewById(R.id.btnRecord)
        btnPlay = findViewById(R.id.btnPlay)

        btnRecord.setOnClickListener { toggleRecording() }
        btnPlay.setOnClickListener { togglePlayback() }

        player.onCompletion = {
            runOnUiThread { onPlaybackStopped() }
        }

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
        if (player.isPlaying) player.stop()
        if (bound) {
            unbindService(connection)
            bound = false
            service = null
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player.stop()
    }

    private fun onReconnectedWhileRecording() {
        tvStatus.text = getString(R.string.status_recording)
        btnRecord.text = getString(R.string.stop)
        btnPlay.visibility = View.GONE
        tvFormat.visibility = View.GONE
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

        val file = File(filesDir, "recording_${System.currentTimeMillis()}.wav")
        lastRecordingFile = file

        val intent = RecordingService.startIntent(this, file.absolutePath)
        ContextCompat.startForegroundService(this, intent)

        tvStatus.text = getString(R.string.status_recording)
        tvTimer.text = formatSeconds(0)
        tvFormat.visibility = View.GONE
        btnRecord.text = getString(R.string.stop)
        btnPlay.visibility = View.GONE

        handler.postDelayed(timerTick, 500)
    }

    private fun stopRecording(svc: RecordingService) {
        handler.removeCallbacks(timerTick)
        val file = svc.stopRecording()
        lastRecordingFile = file

        tvStatus.text = getString(R.string.status_done)
        btnRecord.text = getString(R.string.record)

        file?.let {
            if (it.exists()) {
                btnPlay.visibility = View.VISIBLE
                showFormatInfo(it)
                verifyWavFormat(it)
            }
        }
    }

    private fun togglePlayback() {
        if (player.isPlaying) {
            player.stop()
            onPlaybackStopped()
        } else {
            lastRecordingFile?.let { file ->
                player.play(file)
                tvStatus.text = getString(R.string.status_playing)
                btnPlay.text = getString(R.string.stop_play)
            }
        }
    }

    private fun onPlaybackStopped() {
        tvStatus.text = getString(R.string.status_done)
        btnPlay.text = getString(R.string.play)
    }

    private fun showFormatInfo(file: File) {
        val sizeKb = file.length() / 1024
        val sizeStr = if (sizeKb > 1024) "%.1f MB".format(sizeKb / 1024.0) else "$sizeKb KB"
        tvFormat.text = "${AudioRecorder.SAMPLE_RATE} Hz · mono · 16-bit PCM · $sizeStr"
        tvFormat.visibility = View.VISIBLE
    }

    private fun verifyWavFormat(file: File) {
        try {
            RandomAccessFile(file, "r").use { raf ->
                val header = ByteArray(44)
                raf.read(header)

                val sampleRate = readInt32LE(header, 24)
                val channels = readInt16LE(header, 22)
                val bitsPerSample = readInt16LE(header, 34)
                val audioFormat = readInt16LE(header, 20)
                val dataSize = readInt32LE(header, 40)

                Log.i(TAG, "WAV verification — format=$audioFormat rate=$sampleRate " +
                        "channels=$channels bits=$bitsPerSample dataSize=$dataSize")

                if (sampleRate != AudioRecorder.SAMPLE_RATE) {
                    Log.w(TAG, "Sample rate mismatch! Expected ${AudioRecorder.SAMPLE_RATE}, got $sampleRate")
                    Toast.makeText(this, "Warning: sample rate is $sampleRate, expected ${AudioRecorder.SAMPLE_RATE}", Toast.LENGTH_LONG).show()
                }
                if (channels != 1) {
                    Log.w(TAG, "Channel count mismatch! Expected 1, got $channels")
                }
                if (bitsPerSample != 16) {
                    Log.w(TAG, "Bits per sample mismatch! Expected 16, got $bitsPerSample")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "WAV verification failed", e)
        }
    }

    private fun readInt32LE(buf: ByteArray, offset: Int): Int =
        (buf[offset].toInt() and 0xFF) or
        ((buf[offset + 1].toInt() and 0xFF) shl 8) or
        ((buf[offset + 2].toInt() and 0xFF) shl 16) or
        ((buf[offset + 3].toInt() and 0xFF) shl 24)

    private fun readInt16LE(buf: ByteArray, offset: Int): Int =
        (buf[offset].toInt() and 0xFF) or
        ((buf[offset + 1].toInt() and 0xFF) shl 8)

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
