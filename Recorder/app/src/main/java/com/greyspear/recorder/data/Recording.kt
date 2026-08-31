package com.greyspear.recorder.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "recordings")
data class Recording(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val filePath: String,
    val createdAt: Long,
    val durationMs: Long,
    val sizeBytes: Long,
    val transcript: String? = null,
    val transcribedAt: Long? = null
)
