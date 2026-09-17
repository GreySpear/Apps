# Skald — Design & Project Spec

_Personal offline Android TTS app for EPUBs and pasted text._

Last updated: 2026-09-17

---

## 1. Goal & scope

Build an Android app, for personal use only, that reads text aloud using a good
**offline** neural voice. Two ways to feed it text:

1. **Paste / share text** — a paste box in-app, plus registering as a target in
   Android's system share sheet ("Share to Skald") so text from any app can be
   sent over.
2. **EPUB** — open an `.epub` file, extract chapter text, read it aloud with
   playback controls and remembered position.

**Explicitly out of scope** (at least for now):

- PDF (parsing pain not worth it for personal use).
- Play Store distribution, onboarding, privacy policies, store compliance.
- Cloud APIs, accounts, sync, telemetry.
- Supporting old Android versions or devices other than my own phone.
- A system-wide TTS engine other apps can select (possible future add; see §9).

## 2. Why this is feasible now

Small neural TTS models (**Piper**, Kokoro) now run fully offline on a phone CPU
and sound genuinely good — a recent change that makes "bundle a model I own"
realistic without training anything.

The **honest difficulty is not synthesis** — it's the reading pipeline (text
extraction, normalization, segmentation, playback state). For a personal app we
can start crude on those and improve only what actually reads wrong to the ear.

## 3. Architecture decisions

| Area | Decision | Rationale |
|---|---|---|
| Platform | Native Android, **Kotlin** | Background audio, foreground service, MediaSession need tight native integration. |
| Synthesis | **Piper** voice model | Small, offline, good quality, permissive (MIT) license, many voices. |
| Engine runtime | **sherpa-onnx** (prebuilt Android AAR) | Wraps ONNX Runtime + Piper + phonemization, ships Kotlin/Java bindings and example apps. **Avoids writing raw JNI** — this is the key de-risking choice. |
| Audio output | `AudioTrack` (raw PCM) | Engine returns PCM; stream it directly. |
| Media controls | **Media3 / MediaSession** (`MediaSessionService`) | Lock-screen + notification controls, Bluetooth/car, background playback. |
| EPUB parsing | Unzip → parse OPF spine → extract XHTML text | EPUB is just zipped XHTML; no heavyweight lib needed. |
| Voice delivery | Download voice on demand (not bundled in APK) | Neural voices are ~20–60 MB each; keeps install small, lets voices update without app rebuild. |
| Storage | Local files + a small DB (Room/SQLite) for library & positions | Per-book reading position, imported books list. |

## 4. The reading pipeline (where the real work is)

```
input text
  → text normalization   (numbers, abbreviations, dates, currency, units → spoken words)
  → sentence segmentation (split into engine-sized chunks; good splits = natural prosody)
  → synthesis (Piper via sherpa-onnx → PCM)
  → playback (AudioTrack + MediaSession, with pause/resume/skip)
  → [optional] highlight the sentence currently being spoken
```

Notes:
- Neural models generally do **not** normalize text; they speak the words you give
  them. "Dr. Smith paid $1,500 on 3/4" must be pre-expanded by us.
- Segmentation quality directly affects how natural long reading sounds and keeps
  latency low (synthesize a sentence or two ahead, not the whole chapter).
- For personal use, start with a crude normalizer and improve on real mistakes.

## 5. The spike comes first (go / no-go)

**Before building anything else**, a throwaway app with one button that runs a
**hardcoded sentence** through sherpa-onnx/Piper and plays it on my actual phone.

Nothing else — no EPUB, no UI, no library.

Rationale: the reader UX is all ordinary Android I know is possible. The only real
unknown is whether native TTS integration works smoothly on my device. If the spike
speaks, the rest is effort, not risk. If it fights, I learned that in a weekend, not
a month. **Don't build the reader around an engine I haven't heard speak yet.**

Step-by-step integration notes for the spike — dependency, voice model, minimal
Kotlin, and known failure modes — are in [SPIKE.md](SPIKE.md). A ready-to-run
scaffold of the spike app lives in [spike/](spike/) (see its
[README](spike/README.md)): open in Android Studio, drop in a voice, run.

## 6. Milestones

| Milestone | Deliverable |
|---|---|
| **Spike** | Hardcoded sentence → audio on my phone. Go/no-go on sherpa-onnx + Piper. |
| **v0.1** | Paste box + share-sheet intake → normalize → speak, with pause/resume. |
| **v0.2** | Background playback + Media3 media notification / lock-screen controls. |
| **v0.3** | Open an EPUB → chapter list → read a chapter → remember position. |
| **v0.4** | Speed control, sentence highlighting, sleep timer, voice picker — quality-of-life. |

## 7. Requirements / setup

- Android Studio + a **physical test device** (emulator CPU perf misrepresents TTS latency).
- Kotlin. Likely **no raw JNI** thanks to sherpa-onnx bindings.
- A chosen Piper voice model file (`.onnx` + config), downloaded to the device.
- No server, no accounts, no cloud — free to run and fully private.

## 8. Open questions to resolve during the spike

- Which specific Piper voice to default to (quality vs. size vs. latency).
- Sentence-highlight sync approach: word/sentence timestamps from the engine vs.
  estimate from audio length. (Sentence-level is likely good enough.)
- Chunk look-ahead depth for smooth playback without excessive memory.

## 9. Possible future additions (not committed)

- PDF support.
- Register as a system-wide `TextToSpeechService` so other apps can use the voices.
- Multiple voices / per-book voice.
- Bookmarks and notes.

## 10. Name

**Skald** (Old Norse court poet). Alternatives considered: *Scop* (Old English) —
rejected, reads as "scope"/"shop"; *Fili* (Irish poet) — rejected, collides with
"file" and the Hobbit dwarf. Easy to rename; it's a personal project.
