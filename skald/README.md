# Skald

A personal, offline Android text-to-speech app for reading EPUBs and pasted text
aloud — built to be fully owned end to end, with no cloud, accounts, or tracking.

**Status:** Design phase. No code yet.

See [DESIGN.md](DESIGN.md) for the full spec, decisions, and roadmap, and
[DEVELOPING.md](DEVELOPING.md) for the local setup (Android Studio + Claude Code).

## In one line

Paste or share text → hear it read in a good offline neural voice. Open an EPUB →
have it read to you with playback controls and your place remembered.

## Guiding constraints

- **Just for me.** No Play Store, no onboarding, no settings sprawl, no
  backwards-compat gymnastics. Targets one phone and one owner's taste.
- **Fully offline.** All synthesis runs on-device. Nothing leaves the phone.
- **Owned stack.** The app is mine top to bottom; the only borrowed piece is the
  neural voice model (permissively licensed), not a service.
