# Recorder

Offline voice recorder + on-device transcription for Android. Records 16kHz mono PCM audio, transcribes locally via whisper.cpp, and encrypts everything at rest. No cloud, no telemetry.

## Prerequisites

- Android Studio (Hedgehog or later)
- NDK 26.1.10909125 and CMake 3.22.1 (install via Android Studio SDK Manager)
- Android device running API 26+ (Android 8.0+) with USB debugging enabled
- Git

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/GreySpear/Apps.git
cd Apps/Recorder
```

### 2. Clone whisper.cpp

The native transcription engine must be cloned into the project before building:

```bash
git clone https://github.com/ggerganov/whisper.cpp.git app/src/main/cpp/whisper.cpp
```

### 3. Install NDK and CMake

In Android Studio:

1. Go to **File > Settings > Languages & Frameworks > Android SDK > SDK Tools**
2. Check **Show Package Details** (bottom-right)
3. Check **NDK (Side by side)** and install version **26.1.10909125**
4. Check **CMake** and install version **3.22.1**

### 4. Configure Gradle JDK

If you see a "Gradle JVM version" error on sync:

1. Go to **File > Settings > Build, Execution, Deployment > Build Tools > Gradle**
2. Under **Gradle JDK**, select **jbr-21** (JetBrains Runtime 21, bundled with Android Studio)
3. Click **Apply**, then re-sync

### 5. Open and sync

1. Open Android Studio
2. Select **File > Open** and choose the `Recorder/` folder
3. Wait for Gradle sync to complete

### 6. Build and run

1. Connect your Android device via USB
2. Select it from the device dropdown in the toolbar
3. Click **Run** (or `Shift+F10`)

## Features

### Recording
- Tap **Record** to start, **Stop** to finish
- Records in the background with screen off (foreground service + wake lock)
- Survives Doze mode for long recordings
- Audio captured at 16kHz mono PCM (optimal for Whisper)

### Transcription
- Tap **Transcribe** on any recording to transcribe on-device
- Downloads the Whisper model on first use (~142MB for `base`)
- **Auto-transcribe** — enable in the overflow menu to transcribe automatically after every recording
- **Batch transcribe** — select "Transcribe all" from the overflow menu to transcribe all un-transcribed recordings at once
- **Re-transcribe** — re-run transcription from a recording's overflow menu (useful after switching models)

### Playback
- Tap the play button on any recording
- **Progress bar** shows current playback position
- Play/pause icon toggles on the active recording

### Search
- Search bar filters recordings by **title** and **transcript content** in real-time

### Sharing & Export
- **Share transcript** — send transcript text via Android share sheet (email, messages, notes, etc.)
- **Copy transcript** — copy transcript to clipboard
- **Share audio** — export the decrypted WAV file via Android share sheet

### Model Management
- Select **Whisper Model** from the overflow menu to switch between:
  - `tiny` (~75MB) — fastest, lower accuracy
  - `base` (~142MB) — default, good balance
  - `small` (~466MB) — most accurate, slower
- Models are downloaded once and stored locally

### Security & Privacy
- All audio files encrypted at rest (AES-256-GCM, Android Keystore)
- `allowBackup=false` with full data extraction exclusion
- Zero analytics or telemetry SDKs
- Only network call is one-time model download

## Architecture

- **Audio capture:** `AudioRecord` at 16kHz mono 16-bit PCM, written as WAV
- **Background recording:** Foreground service with partial wake lock, survives screen-off and Doze
- **Transcription:** whisper.cpp via JNI, batch post-recording
- **Encryption:** AES-256-GCM with Android Keystore-backed key, applied to audio files at rest
- **Storage:** Room database for metadata and transcripts, encrypted files in app-internal storage
- **Privacy:** `allowBackup=false`, no analytics SDKs, only network call is one-time model download

## Changelog

### v0.1.0

**Step 1 — Audio capture MVP**
- `AudioRecorder` capturing 16kHz mono 16-bit PCM to WAV files
- `AudioPlayer` for playback with `MediaPlayer`
- WAV header written as placeholder, patched after recording stops

**Step 2 — Foreground service + Doze survival**
- `RecordingService` as foreground service with `foregroundServiceType="microphone"`
- Partial wake lock (4h max) for background recording
- Persistent notification with stop action

**Step 3 — Storage + list UI**
- Room database with `Recording` entity and `RecordingDao`
- `RecordingAdapter` with RecyclerView list
- Popup menu for rename and delete
- Single-activity layout with controls card and recording list

**Step 4 — Whisper integration**
- JNI bridge (`whisper_jni.cpp` + `CMakeLists.txt`)
- `WhisperLib` Kotlin wrapper for native calls
- `ModelManager` for downloading ggml models from HuggingFace (tiny/base/small)
- `TranscriptionManager` for loading models and running transcription
- Transcript stored in Room (database migration v1 to v2)
- Per-item Transcribe button and re-transcribe via overflow menu

**Step 5 — Encryption at rest**
- `CryptoManager` with AES-256-GCM via Android Keystore
- Recording service encrypts audio on stop, falls back to plaintext on failure
- Playback and transcription decrypt to temp files, clean up after use
- `data_extraction_rules.xml` excluding all backup domains

**Step 6 — Hardening**
- Toolbar with overflow menu for model-size picker
- Selected model stored in SharedPreferences
- Dependency audit: all deps are AndroidX with no telemetry

**Post-v0.1.0 features**
- Share and copy transcript via overflow menu
- Auto-transcribe toggle (transcribes automatically after recording stops)
- Search bar filtering by title and transcript content
- Share audio (decrypted WAV export via FileProvider + share sheet)
- Playback progress bar with play/pause icon toggle
- Batch transcribe all un-transcribed recordings
