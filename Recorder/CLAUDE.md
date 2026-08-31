# Offline Voice Recorder + Transcription — Android

## Current Status (update this each session)

- **Phase:** Step 1 complete — audio capture MVP.
- **Next task:** Step 2 — foreground service + Doze survival (record with screen off 30+ min).
- **Blocked on:** —
- **Recent decisions / notes:**
  - Step 1 done: AudioRecorder (16kHz mono PCM → WAV), AudioPlayer (MediaPlayer), UI with record/play/timer, WAV header verification logging.
  - Package: `com.greyspear.recorder`, minSdk 26, targetSdk 34.
  - Format verification reads WAV header back and logs + toasts on mismatch.

> Update this block at the end of each session so the next one starts with accurate context. Keep it short — it's a pointer, not a changelog.

---

A personal, fully on-device Android app for recording meetings/voice and transcribing them locally with Whisper. No cloud, no telemetry. Privacy by architecture, not policy.

> **Scope note:** Personal tool for own use. NOT HIPAA/legal/regulated. This means: encrypt-at-rest as good hygiene, but skip compliance scaffolding (audit trails, consent flows, SQLCipher, DPA concerns). Single data subject = the developer.

---

## 1. Goal

Record audio reliably (survives screen-off / Doze), then transcribe on-device with Whisper after the recording finishes. Transcripts and audio stay encrypted on the phone. Ship the recorder+transcription core first; treat note-taking as a *possible later feature*, not a parallel track.

**Explicit non-goals (v1):**
- No live/streaming transcription (batch, post-recording only)
- No cloud sync, no accounts, no analytics
- No note-taking / rich-text layer yet
- No multi-user, no sharing/export polish beyond plain-text/file share

---

## 2. Architecture Decisions (already made — don't re-litigate)

| Decision | Choice | Why |
|---|---|---|
| STT engine | **whisper.cpp** via JNI | Best accuracy; accuracy matters for meeting records. Vosk rejected (live-streaming advantage irrelevant here). |
| Model size | `base` default, `small` optional | `small` = better accuracy, acceptable slower batch speed for personal use. `tiny` as low-end fallback. |
| Transcription timing | **Post-recording batch** | Removes the accuracy-vs-battery-vs-realtime fight entirely. |
| Audio capture | `AudioRecord`, 16kHz mono PCM | Exactly what Whisper wants — no transcoding step. |
| Language | Kotlin | — |
| Storage | Room + file storage, encrypted at rest | Android Keystore-backed keys. |
| Model delivery | Download on first run | Keeps APK small. Model file contains NO user data, so network fetch does not break the offline/privacy claim. |

---

## 3. Requirements

### Functional
- FR1: Record audio via a foreground service that survives screen-off and Doze.
- FR2: Capture 16kHz mono PCM directly (feed Whisper without resampling).
- FR3: Persist recordings with metadata (title, timestamp, duration).
- FR4: Transcribe a finished recording on demand (and/or auto after stop) using whisper.cpp.
- FR5: Store transcript linked to its recording; display + plain-text copy/share.
- FR6: Download/manage the Whisper model file on first run; let user pick model size.
- FR7: List, play back, rename, and delete recordings + transcripts.

### Non-functional
- NFR1: All audio + transcripts encrypted at rest (Keystore-backed key; encrypt files, consider SQLCipher optional/skip for personal scope).
- NFR2: `android:allowBackup="false"`; exclude data dirs from any backup.
- NFR3: Zero telemetry. No analytics/crash-reporting SDKs that phone home. Audit every dependency.
- NFR4: Only network call permitted = one-time model download. Nothing else touches the network.
- NFR5: Recording must not silently die when the app is backgrounded (wake lock + foreground service notification).

---

## 4. The Hard Parts (budget time here, not on transcription)

1. **Background reliability / Doze** — making recording survive screen-off and Doze on YOUR specific phone is the real time sink. Foreground service + partial wake lock + a persistent notification. Test on the actual device early.
2. **Audio format discipline** — the mic won't hand you 16kHz mono PCM by default. Configure `AudioRecord` correctly up front; verify sample rate/channel/encoding.
3. **Model storage/download UX** — bundling Whisper bloats the APK; download once, store, verify, handle interrupted downloads.
4. **JNI boundary** — invoking whisper.cpp from Kotlin; memory management across the boundary during long transcriptions.

---

## 5. Suggested Stack / Libraries

- **Kotlin**, single module to start.
- **Audio:** `AudioRecord` (capture), `MediaPlayer`/`ExoPlayer` (playback).
- **STT:** whisper.cpp — start from the official `whisper.android` sample as scaffolding for the JNI + build setup.
- **Storage:** Room (metadata + transcripts), app-internal encrypted file storage for audio.
- **Crypto:** Android Keystore for key material; encrypt audio files. (SQLCipher optional — likely skip at personal scope.)
- **Background:** Foreground `Service` + `WakeLock`. Consider `WorkManager` for the post-recording transcription job.

---

## 6. Build Order (incremental — get to a usable core fast)

1. **Audio capture MVP** — record 16kHz mono PCM to a file, play it back. Prove the format is right.
2. **Foreground service + Doze survival** — make it record with the screen off for 30+ min without dying. *This is the risky milestone; do it early.*
3. **Storage + list UI** — Room metadata, list/rename/delete/playback.
4. **Whisper integration** — JNI, model download, transcribe a finished file, show transcript.
5. **Encryption at rest** — Keystore key, encrypt audio + transcript storage.
6. **Hardening** — `allowBackup=false`, dependency audit for phone-home behavior, model-size picker.
7. **(Decide later)** — use it for ~2 weeks, THEN decide if a note-taking layer is worth adding. Let real usage spec the feature.

---

## 7. Open Questions (resolve as you go)

- Auto-transcribe on stop, or manual "transcribe" button? (Battery vs convenience.)
- `base` vs `small` as the shipped default after real-world accuracy testing.
- Keep audio after transcription, or offer transcript-only retention to save space?
- Minimum Android API level / target device(s).

---

## 8. Notes for Claude Code

- Prefer the `whisper.android` sample's build config as a reference for the NDK/JNI/CMake setup rather than assembling it from scratch.
- Verify audio format empirically (log sample rate, channels, encoding) — don't assume `AudioRecord` gave you what you asked for.
- When adding ANY dependency, check for network/telemetry behavior before committing to it (NFR3/NFR4).
- Do the Doze/background-survival milestone before building UI polish — it's the thing most likely to force an architecture change.
