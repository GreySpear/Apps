package com.greyspear.skald.spike

import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import com.greyspear.skald.spike.databinding.ActivityMainBinding
import java.util.concurrent.Executors

/**
 * The whole spike: one button -> synthesize a hardcoded sentence -> play it.
 * Success = you hear the sentence on-device. Watch Logcat (tag "SkaldSpike")
 * for cold vs. warm synth latency — that's the number that decides the reading UX.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val worker = Executors.newSingleThreadExecutor()

    // Constructed lazily on the worker thread (model load is slow; keep it off the UI thread).
    @Volatile
    private var tts: Tts? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.speakButton.setOnClickListener { speak() }

        // Warm up the engine at launch so the first tap measures warm latency.
        worker.execute { ensureTts() }
    }

    private fun ensureTts(): Tts {
        tts?.let { return it }
        setStatus("Loading voice…")
        val t = Tts(assets)
        tts = t
        setStatus("Ready. Tap to speak.")
        return t
    }

    private fun speak() {
        setStatus("Synthesizing…")
        worker.execute {
            try {
                val engine = ensureTts()
                val text = "Skald is speaking. If you can hear this, the spike passed."

                val t0 = System.currentTimeMillis()
                val audio = engine.synth(text)
                val t1 = System.currentTimeMillis()
                Log.i(Tts.TAG, "synth: ${t1 - t0} ms, ${audio.samples.size} samples @ ${audio.sampleRate} Hz")

                setStatus("Synth ${t1 - t0} ms — playing…")
                AudioPlayer.play(audio.samples, audio.sampleRate)
                setStatus("Done. Synth ${t1 - t0} ms. Tap to repeat.")
            } catch (e: Throwable) {
                Log.e(Tts.TAG, "spike failed", e)
                setStatus("Failed: ${e.message} (see Logcat)")
            }
        }
    }

    private fun setStatus(text: String) {
        runOnUiThread { binding.statusText.text = text }
    }

    override fun onDestroy() {
        super.onDestroy()
        worker.execute { tts?.release() }
        worker.shutdown()
    }
}
