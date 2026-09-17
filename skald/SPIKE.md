# Skald — Spike: hardcoded sentence → audio

Goal of this spike: prove that **sherpa-onnx + a Piper voice speaks a hardcoded
sentence on my actual phone**. One button, one sentence, real device. No EPUB, no
UI, no library, no share sheet. This is a go/no-go gate, nothing more.

> ⚠️ **Verify the moving parts against the current sherpa-onnx release before
> trusting this doc.** Version strings and a few API names below drift between
> releases. The two things to confirm first are (1) the current Maven coordinate +
> version, and (2) that the Kotlin class/field names in §4 still match. Everything
> else here is stable in shape. Sources to check:
> - sherpa-onnx releases / docs: https://github.com/k2-fsa/sherpa-onnx
> - Android TTS docs: https://k2-fsa.github.io/sherpa/onnx/tts/
> - Piper voices (pre-converted for sherpa-onnx): https://github.com/k2-fsa/sherpa-onnx/releases (the `vits-piper-*` assets)

---

## 0. Success criteria

- Tap a button in a debug app on my phone → hear an English sentence in the Piper
  voice, from the phone speaker.
- Note the **cold-start latency** (first synth after launch) and **warm latency**
  (subsequent). This is the number that decides whether the reading UX will feel good.

If that happens, the spike passes and the rest of Skald is effort, not risk.

## 1. Two ways to run the spike

**Option A — sherpa-onnx's own Android sample (fastest sanity check).**
The repo ships a ready TTS Android app. Cloning it, dropping in a voice, and running
it on-device proves the *engine* works on my phone before I write any of my own code.
Do this first if the spike is fighting me — it isolates "does the engine run here"
from "did I wire it up right".

**Option B — a minimal app I write (the real spike).**
A one-Activity app with a button. This is what §3–§5 cover. Do this once Option A (or
confidence) says the engine is fine.

## 2. Get a voice model

Piper voices come pre-converted for sherpa-onnx as `vits-piper-*` release archives.
A US English medium-quality voice is the right default for the spike (good
quality/size/latency balance). Each archive unpacks to roughly:

```
vits-piper-en_US-<voice>-medium/
  en_US-<voice>-medium.onnx        # the model (~60 MB for medium)
  en_US-<voice>-medium.onnx.json   # model metadata (sample rate, etc.)
  tokens.txt                       # token table
  espeak-ng-data/                  # phonemizer data dir — REQUIRED for Piper voices
```

For the spike, put these under `app/src/main/assets/` so they ship inside the debug
APK. (Real Skald downloads them at runtime instead — see DESIGN §3 — but assets are
simplest to prove the concept.)

> The `espeak-ng-data/` directory is not optional. Piper voices phonemize via
> eSpeak-ng; without that dir pointed at correctly, synthesis fails or is silent.

## 3. Gradle wiring

In `app/build.gradle(.kts)` add the sherpa-onnx dependency. **Confirm the current
coordinate + version** (this is the #1 thing that goes stale):

```kotlin
dependencies {
    // VERIFY coordinate and version against the latest release before using.
    implementation("com.k2-fsa:sherpa-onnx:<CURRENT_VERSION>")
}
```

If a published Maven artifact isn't available/working, the fallback is to drop the
prebuilt `.aar` (and its JNI `.so` libs) from the release into `app/libs/` and
`implementation(files("libs/sherpa-onnx.aar"))`. Prefer the Maven coordinate if it
exists.

Also make sure large asset files aren't compressed (some setups need
`androidResources { noCompress += listOf("onnx") }` or similar) — a model that gets
re-compressed can fail to mmap. Note this only if loading fails.

## 4. Minimal synthesis code

Shape of the Kotlin API (Piper = a VITS model in sherpa-onnx terms). **Names may
differ slightly by release — verify against the sample app.** The important thing is
the *shape*: build a config → construct `OfflineTts` → `generate(text, speakerId,
speed)` → get back float samples + sample rate.

```kotlin
import com.k2fsa.sherpa.onnx.*

class Tts(assetManager: android.content.res.AssetManager) {
    private val tts: OfflineTts

    init {
        val voiceDir = "vits-piper-en_US-amy-medium" // whatever I unpacked into assets/
        val modelConfig = OfflineTtsModelConfig(
            vits = OfflineTtsVitsModelConfig(
                model    = "$voiceDir/en_US-amy-medium.onnx",
                tokens   = "$voiceDir/tokens.txt",
                dataDir  = "$voiceDir/espeak-ng-data", // REQUIRED for Piper
                lexicon  = "",                         // Piper uses espeak, not a lexicon
                noiseScale = 0.667f,
                noiseScaleW = 0.8f,
                lengthScale = 1.0f                     // >1 = slower speech
            ),
            numThreads = 2,
            debug = true,
            provider = "cpu"                            // NNAPI is an optimization for later
        )
        val config = OfflineTtsConfig(model = modelConfig)

        // Loading from assets: pass the AssetManager so relative paths resolve into assets/.
        tts = OfflineTts(assetManager = assetManager, config = config)
    }

    /** Returns PCM float samples + sample rate. */
    fun synth(text: String, speakerId: Int = 0, speed: Float = 1.0f): GeneratedAudio =
        tts.generate(text = text, sid = speakerId, speed = speed)
}
```

Notes:
- Piper medium voices are usually **single-speaker**, so `sid = 0`.
- `speed` and/or `lengthScale` control rate — one of them; check which the current API
  honors. (`speed = 1.0` default is fine for the spike.)
- `GeneratedAudio` exposes something like `samples: FloatArray` and
  `sampleRate: Int` — verify exact field names.

## 5. Play the PCM with AudioTrack

sherpa-onnx returns **float PCM in [-1, 1]**. `AudioTrack` in float mode plays that
directly — no manual 16-bit conversion needed for the spike.

```kotlin
import android.media.*

fun play(samples: FloatArray, sampleRate: Int) {
    val channel = AudioFormat.CHANNEL_OUT_MONO
    val encoding = AudioFormat.ENCODING_PCM_FLOAT
    val minBuf = AudioTrack.getMinBufferSize(sampleRate, channel, encoding)
    val bufSize = maxOf(minBuf, samples.size * 4) // 4 bytes per float

    val track = AudioTrack.Builder()
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        )
        .setAudioFormat(
            AudioFormat.Builder()
                .setEncoding(encoding)
                .setSampleRate(sampleRate)
                .setChannelMask(channel)
                .build()
        )
        .setBufferSizeInBytes(bufSize)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()

    track.play()
    track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
    // Spike-simple: block until done, then release. Real Skald streams chunks.
    track.stop()
    track.release()
}
```

Wire button → background thread (synthesis blocks; never on the UI thread) →
`synth(...)` → `play(...)`. Log timestamps around `synth()` for the latency numbers.

```kotlin
button.setOnClickListener {
    Thread {
        val t0 = System.currentTimeMillis()
        val audio = tts.synth("Skald is speaking. If you can hear this, the spike passed.")
        val t1 = System.currentTimeMillis()
        Log.i("Skald", "synth took ${t1 - t0} ms for ${audio.samples.size} samples")
        play(audio.samples, audio.sampleRate)
    }.start()
}
```

## 6. Threading & lifecycle (minimum viable)

- **Never** call `generate()` or `AudioTrack.write(..., WRITE_BLOCKING)` on the main
  thread. A raw `Thread {}` is fine for the spike; real Skald uses a coroutine +
  proper cancellation.
- Construct `OfflineTts` **once** and reuse it. Construction loads the model (slow);
  doing it per-tap will mislead the latency numbers.
- Call `tts.release()` (or equivalent) when done if the API exposes it — the native
  object holds memory.

## 7. What to record when it works (feeds later phases)

- Cold vs. warm synth latency for a one-sentence input.
- APK size with the voice bundled (informs the download-on-demand decision).
- Subjective voice quality on the phone speaker vs. headphones.
- Whether `numThreads` / `provider = "nnapi"` meaningfully change latency (only worth
  testing if warm latency feels sluggish).

## 8. Known failure modes to watch for

| Symptom | Likely cause |
|---|---|
| Silent output, no crash | `dataDir` (espeak-ng-data) wrong or missing; or asset path typo. |
| Crash on `OfflineTts` construct | Model/tokens asset path wrong, or `.onnx` got compressed in the APK. |
| `UnsatisfiedLinkError` | JNI `.so` not packaged — Maven artifact not applied, or ABI filter excluded the device's ABI. |
| Garbled/robotic speech | Wrong tokens.txt for the model, or model/config mismatch. |
| Works on emulator, slow/broken on device | Exactly why the spike must run on the real phone. |

---

## Decision

**Pass:** engine speaks on-device with acceptable latency → proceed to DESIGN §6 v0.1.
**Fail/awkward:** reconsider engine (raw Piper via ONNX Runtime, or another wrapper)
before building any reader UX on top of it.
