# Developing Skald

How to work on Skald locally, with Android Studio for the device/GUI side and
Claude Code for the code/build side. This is a personal project — the setup below
is deliberately lightweight.

## The two tools and who does what

| Tool | Role |
|---|---|
| **Android Studio** (on your machine) | Yours. Brings the Android SDK + emulator. You drive the emulator/physical device, layout preview, profiler, and Logcat GUI. |
| **Claude Code (CLI)** (on your machine, in the repo) | Where Claude works: reads code, applies edits, runs `./gradlew`, reads build errors and Logcat, iterates with you. |
| **Claude Desktop app** | Just a chat window — no file/build access. Fine for questions, not for managing the project. Not needed for this workflow. |
| **Claude Code on the web** (cloud) | Where the initial design + scaffold were written. Has the repo but **no Android SDK/device**, so it can't build or run the app — only edit and push. |

Android Studio and Claude Code sit side by side over the same files: you run the
app and use the IDE; Claude edits code and runs Gradle/tests.

## One-time setup

1. **Install Android Studio** (Mac/Windows/Linux). Let it install the SDK and, if
   you want it, an emulator. A physical phone is preferred for this project — the
   spike's whole point is measuring real on-device TTS latency (emulator CPU lies).
2. **Install Claude Code (CLI)** and sign in.
3. **Clone the repo and check out the working branch:**
   ```bash
   git clone https://github.com/GreySpear/Apps.git
   cd Apps
   git checkout claude/stoic-galileo-kj3763
   ```
   Everything so far — `skald/DESIGN.md`, `SPIKE.md`, and the `skald/spike/`
   scaffold — is on that branch.

## Running Claude Code alongside Android Studio

Two good options — use whichever feels better:

- **Terminal:** open a terminal (the one docked inside Android Studio works, or a
  separate one) in the repo root and run `claude`. Claude edits files and runs
  builds there while you watch changes reflected in the IDE.
- **JetBrains / Android Studio plugin:** install the Claude Code plugin so it's
  embedded in the IDE and diffs/edits appear directly in your editor.

## The build-debug loop

1. Make a change (you, or ask Claude to).
2. Build/run on your device — from Android Studio's Run button, or have Claude run
   `./gradlew installDebug` from the terminal.
3. When something breaks, paste the error (or point Claude at Logcat / the Gradle
   output) and Claude reads it and fixes it in place.
4. Commit and push so work is preserved and stays in sync across machines/sessions.

## Sessions don't share memory — the repo does

A cloud Claude Code session and a local one are separate and don't share
conversation history. **What carries between them is the repository.** That's why
every step here has been committed and pushed. When you start locally, `git pull`
the branch and all the context — design docs, spike notes, scaffold — comes with
it, and you can pick up exactly where things left off.

Keep the habit: commit and push meaningful progress, and record decisions in the
docs (`DESIGN.md` etc.) rather than only in chat, so future sessions (yours or
Claude's) start informed.

## First real task

Run the spike (see [`spike/README.md`](spike/README.md)): open `skald/spike/` in
Android Studio, drop a `vits-piper` voice into `assets/`, run on your phone, and
capture the synth latency. That go/no-go result decides whether to proceed to
DESIGN §6 v0.1.
