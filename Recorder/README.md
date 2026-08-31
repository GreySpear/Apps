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
2. Check **NDK (Side by side)** and install version **26.1.10909125**
3. Check **CMake** and install version **3.22.1**

### 4. Open and sync

1. Open Android Studio
2. Select **File > Open** and choose the `Recorder/` folder
3. Wait for Gradle sync to complete

### 5. Build and run

1. Connect your Android device via USB
2. Select it from the device dropdown in the toolbar
3. Click **Run** (or `Shift+F10`)

## First Launch

1. **Grant permissions** — allow Microphone and Notifications when prompted
2. **Record** — tap Record, lock the screen if you like, then tap Stop when done. The recording appears in the list.
3. **Play back** — tap the play button on any recording to verify audio
4. **Transcribe** — tap Transcribe on a recording. On first use it will prompt to download the Whisper model (~142MB for the default `base` model). After download, transcription runs entirely on-device.
5. **Change model** — tap the overflow menu (three dots in the toolbar) and select **Whisper Model** to switch between:
   - `tiny` (~75MB) — fastest, lower accuracy
   - `base` (~142MB) — default, good balance
   - `small` (~466MB) — most accurate, slower

## Architecture

- **Audio capture:** `AudioRecord` at 16kHz mono 16-bit PCM, written as WAV
- **Background recording:** Foreground service with partial wake lock, survives screen-off and Doze
- **Transcription:** whisper.cpp via JNI, batch post-recording
- **Encryption:** AES-256-GCM with Android Keystore-backed key, applied to audio files at rest
- **Storage:** Room database for metadata and transcripts, encrypted files in app-internal storage
- **Privacy:** `allowBackup=false`, no analytics SDKs, only network call is one-time model download
