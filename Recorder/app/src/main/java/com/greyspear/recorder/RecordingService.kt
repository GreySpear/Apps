package com.greyspear.recorder

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File

class RecordingService : Service() {

    companion object {
        private const val TAG = "RecordingService"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_STOP = "com.greyspear.recorder.STOP"

        fun startIntent(context: Context, outputPath: String): Intent =
            Intent(context, RecordingService::class.java).apply {
                putExtra("output_path", outputPath)
            }

        fun stopIntent(context: Context): Intent =
            Intent(context, RecordingService::class.java).apply {
                action = ACTION_STOP
            }
    }

    inner class LocalBinder : Binder() {
        val service: RecordingService get() = this@RecordingService
    }

    private val binder = LocalBinder()
    private val recorder = AudioRecorder()
    private var wakeLock: PowerManager.WakeLock? = null
    private var outputFile: File? = null
    var recordingStartMs = 0L
        private set

    val isRecording: Boolean get() = recorder.recording

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopRecording()
            return START_NOT_STICKY
        }

        val path = intent?.getStringExtra("output_path")
        if (path != null) {
            startRecording(File(path))
        }

        return START_STICKY
    }

    private fun startRecording(file: File) {
        if (recorder.recording) return

        outputFile = file
        recordingStartMs = System.currentTimeMillis()

        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWakeLock()

        recorder.start(file)
        Log.i(TAG, "Recording started: ${file.name}")
    }

    fun stopRecording(): File? {
        if (!recorder.recording) return outputFile

        recorder.stop()
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(TAG, "Recording stopped: ${outputFile?.name}")
        return outputFile
    }

    override fun onDestroy() {
        super.onDestroy()
        if (recorder.recording) {
            recorder.stop()
        }
        releaseWakeLock()
    }

    fun updateNotificationTimer(elapsed: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(elapsed))
    }

    private fun buildNotification(elapsed: String = "00:00"): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopPendingIntent = PendingIntent.getService(
            this, 1,
            Intent(this, RecordingService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, RecorderApp.CHANNEL_RECORDING)
            .setContentTitle("Recording")
            .setContentText(elapsed)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopPendingIntent)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Recorder::RecordingWakeLock"
        ).apply {
            acquire(4 * 60 * 60 * 1000L) // 4 hour max
        }
        Log.i(TAG, "Wake lock acquired")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
            Log.i(TAG, "Wake lock released")
        }
        wakeLock = null
    }
}
