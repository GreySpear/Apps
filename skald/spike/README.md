# Skald Spike

Throwaway app to answer one question: **does sherpa-onnx + a Piper voice speak on my
phone, with acceptable latency?** One button, one hardcoded sentence, real device.
See [`../SPIKE.md`](../SPIKE.md) for the full rationale and failure-mode table.

## Run it

1. **Open in Android Studio** (`skald/spike/` as the project root). Let it sync.
   - Android Studio will generate the Gradle wrapper JAR and `local.properties`
     (your SDK path). If building from the CLI instead, run `gradle wrapper` once
     first, then `./gradlew installDebug`.
2. **Add a voice.** Download a `vits-piper-en_US-*-medium` archive (SPIKE.md §2),
   unzip into `app/src/main/assets/` per `app/src/main/assets/PUT_VOICE_HERE.md`.
   The default expects `assets/vits-piper-en_US-amy-medium/`; change `VOICE_DIR` /
   `MODEL_FILE` in `Tts.kt` if you use another.
3. **Verify the dependency.** Confirm the sherpa-onnx Maven coordinate/version in
   `app/build.gradle.kts` against the current release (SPIKE.md §3). If no Maven
   artifact works, drop the prebuilt `.aar` into `app/libs/` and switch to the
   commented `fileTree` line.
4. **Run on a physical device** (not the emulator — CPU perf differs). Tap **Speak**.

## What success looks like

- You hear: *"Skald is speaking. If you can hear this, the spike passed."*
- Logcat (tag `SkaldSpike`) prints synth latency in ms. Note cold (first) vs. warm.

## If it doesn't work

Check the failure-mode table in [`../SPIKE.md`](../SPIKE.md) §8 — silent output is
almost always a wrong/missing `espeak-ng-data` dir or asset path; `UnsatisfiedLinkError`
means the JNI libs weren't packaged (dependency or ABI issue).

## Layout

```
spike/
  settings.gradle.kts        root Gradle config
  build.gradle.kts           plugin versions
  app/build.gradle.kts       app config + sherpa-onnx dependency (VERIFY version)
  app/src/main/AndroidManifest.xml
  app/src/main/java/com/greyspear/skald/spike/
    MainActivity.kt          button -> synth -> play, logs latency
    Tts.kt                   sherpa-onnx OfflineTts wrapper (VERIFY API names)
    AudioPlayer.kt           float PCM -> AudioTrack
  app/src/main/res/layout/activity_main.xml
  app/src/main/assets/       <- voice goes here (git-ignored)
```
