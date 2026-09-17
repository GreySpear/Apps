package com.greyspear.skald.spike

import android.content.res.AssetManager
import android.util.Log
import com.k2fsa.sherpa.onnx.GeneratedAudio
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig

/**
 * Thin wrapper around sherpa-onnx offline TTS for the spike.
 *
 * ⚠️ The class/field names below (OfflineTtsVitsModelConfig, GeneratedAudio.samples,
 * OfflineTts.generate signature) can drift between sherpa-onnx releases. If the build
 * fails to resolve a symbol, check the current sample app referenced in ../SPIKE.md §4
 * and adjust — the *shape* (build config -> construct -> generate -> float PCM) is stable.
 *
 * Construct ONCE and reuse: construction loads the model and is slow.
 */
class Tts(assetManager: AssetManager) {

    private val tts: OfflineTts

    init {
        val modelConfig = OfflineTtsModelConfig(
            vits = OfflineTtsVitsModelConfig(
                model = "$VOICE_DIR/$MODEL_FILE",
                tokens = "$VOICE_DIR/tokens.txt",
                dataDir = "$VOICE_DIR/espeak-ng-data", // REQUIRED for Piper voices
                lexicon = "",                          // Piper phonemizes via espeak-ng, not a lexicon
                noiseScale = 0.667f,
                noiseScaleW = 0.8f,
                lengthScale = 1.0f                     // >1.0 = slower speech
            ),
            numThreads = 2,
            debug = true,
            provider = "cpu"                           // try "nnapi" later only if warm latency is poor
        )
        val config = OfflineTtsConfig(model = modelConfig)

        // assetManager makes the relative paths above resolve inside app/src/main/assets/.
        tts = OfflineTts(assetManager = assetManager, config = config)
        Log.i(TAG, "OfflineTts constructed (sampleRate=${tts.sampleRate()})")
    }

    /** Synthesize [text]. Blocks — call off the main thread. Returns float PCM + sample rate. */
    fun synth(text: String, speakerId: Int = 0, speed: Float = 1.0f): GeneratedAudio =
        tts.generate(text = text, sid = speakerId, speed = speed)

    fun release() {
        tts.release()
    }

    companion object {
        const val TAG = "SkaldSpike"

        // ── Point these at whatever voice you unpacked into assets/. ──────────────
        // Grab a vits-piper-en_US-*-medium archive (see ../SPIKE.md §2) and unzip its
        // contents into app/src/main/assets/<VOICE_DIR>/ so the layout is:
        //   assets/<VOICE_DIR>/<MODEL_FILE>
        //   assets/<VOICE_DIR>/tokens.txt
        //   assets/<VOICE_DIR>/espeak-ng-data/...
        const val VOICE_DIR = "vits-piper-en_US-amy-medium"
        const val MODEL_FILE = "en_US-amy-medium.onnx"
    }
}
