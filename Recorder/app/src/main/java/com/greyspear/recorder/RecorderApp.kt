package com.greyspear.recorder

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.greyspear.recorder.data.AppDatabase
import com.greyspear.recorder.data.RecordingDao

class RecorderApp : Application() {

    companion object {
        const val CHANNEL_RECORDING = "recording"
    }

    lateinit var db: AppDatabase
        private set

    val recordingDao: RecordingDao get() = db.recordingDao()

    override fun onCreate() {
        super.onCreate()
        db = AppDatabase.get(this)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_RECORDING,
                "Recording",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shown while a recording is in progress"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }
}
