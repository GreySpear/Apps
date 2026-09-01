package com.greyspear.recorder.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface RecordingDao {

    @Query("SELECT * FROM recordings ORDER BY createdAt DESC")
    fun getAll(): Flow<List<Recording>>

    @Query("SELECT * FROM recordings WHERE title LIKE '%' || :query || '%' OR transcript LIKE '%' || :query || '%' ORDER BY createdAt DESC")
    fun search(query: String): Flow<List<Recording>>

    @Query("SELECT * FROM recordings WHERE transcript IS NULL ORDER BY createdAt DESC")
    suspend fun getUntranscribed(): List<Recording>

    @Query("SELECT * FROM recordings WHERE id = :id")
    suspend fun getById(id: Long): Recording?

    @Insert
    suspend fun insert(recording: Recording): Long

    @Update
    suspend fun update(recording: Recording)

    @Query("UPDATE recordings SET title = :title WHERE id = :id")
    suspend fun rename(id: Long, title: String)

    @Query("UPDATE recordings SET transcript = :transcript, transcribedAt = :transcribedAt WHERE id = :id")
    suspend fun setTranscript(id: Long, transcript: String, transcribedAt: Long)

    @Query("DELETE FROM recordings WHERE id = :id")
    suspend fun delete(id: Long)
}
