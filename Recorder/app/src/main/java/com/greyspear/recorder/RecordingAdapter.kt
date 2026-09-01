package com.greyspear.recorder

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.greyspear.recorder.data.Recording
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class RecordingAdapter(
    private val onPlay: (Recording) -> Unit,
    private val onMore: (View, Recording) -> Unit,
    private val onTranscribe: (Recording) -> Unit
) : ListAdapter<Recording, RecordingAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<Recording>() {
            override fun areItemsTheSame(old: Recording, new: Recording) = old.id == new.id
            override fun areContentsTheSame(old: Recording, new: Recording) = old == new
        }
    }

    var playingId: Long? = null
        set(value) {
            val oldId = field
            field = value
            if (oldId != null) notifyItemChanged(currentList.indexOfFirst { it.id == oldId })
            if (value != null) notifyItemChanged(currentList.indexOfFirst { it.id == value })
        }

    var playbackProgress: Int = 0

    fun updateProgress(id: Long, progress: Int) {
        playbackProgress = progress
        val idx = currentList.indexOfFirst { it.id == id }
        if (idx >= 0) notifyItemChanged(idx, "progress")
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvTitle: TextView = view.findViewById(R.id.tvTitle)
        val tvMeta: TextView = view.findViewById(R.id.tvMeta)
        val btnPlay: ImageButton = view.findViewById(R.id.btnPlay)
        val btnMore: ImageButton = view.findViewById(R.id.btnMore)
        val tvTranscript: TextView = view.findViewById(R.id.tvTranscript)
        val btnTranscribe: MaterialButton = view.findViewById(R.id.btnTranscribe)
        val progressBar: LinearProgressIndicator = view.findViewById(R.id.playbackProgress)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder =
        ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_recording, parent, false))

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val rec = getItem(position)
        val isPlaying = rec.id == playingId

        holder.tvTitle.text = rec.title
        holder.tvMeta.text = formatMeta(rec)
        holder.btnPlay.setOnClickListener { onPlay(rec) }
        holder.btnMore.setOnClickListener { onMore(it, rec) }

        holder.btnPlay.setImageResource(
            if (isPlaying) android.R.drawable.ic_media_pause
            else android.R.drawable.ic_media_play
        )

        if (isPlaying) {
            holder.progressBar.visibility = View.VISIBLE
            holder.progressBar.progress = playbackProgress
        } else {
            holder.progressBar.visibility = View.GONE
        }

        if (rec.transcript != null) {
            holder.tvTranscript.text = rec.transcript
            holder.tvTranscript.visibility = View.VISIBLE
            holder.btnTranscribe.visibility = View.GONE
        } else {
            holder.tvTranscript.visibility = View.GONE
            holder.btnTranscribe.visibility = View.VISIBLE
            holder.btnTranscribe.setOnClickListener { onTranscribe(rec) }
        }
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int, payloads: MutableList<Any>) {
        if (payloads.contains("progress")) {
            holder.progressBar.progress = playbackProgress
        } else {
            super.onBindViewHolder(holder, position, payloads)
        }
    }

    private fun formatMeta(rec: Recording): String {
        val duration = formatDuration(rec.durationMs)
        val size = formatSize(rec.sizeBytes)
        val date = SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date(rec.createdAt))
        return "$duration · $size · $date"
    }

    private fun formatDuration(ms: Long): String {
        val totalSec = ms / 1000
        val min = totalSec / 60
        val sec = totalSec % 60
        return String.format(Locale.US, "%d:%02d", min, sec)
    }

    private fun formatSize(bytes: Long): String {
        val kb = bytes / 1024
        return if (kb > 1024) "%.1f MB".format(kb / 1024.0) else "$kb KB"
    }
}
