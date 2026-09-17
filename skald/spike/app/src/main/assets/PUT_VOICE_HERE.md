# Put the Piper voice here

This spike loads the voice from `assets/`. Download a `vits-piper-en_US-*-medium`
archive (see `../../../../SPIKE.md` §2), unzip it, and place its contents so the
layout is:

```
assets/vits-piper-en_US-amy-medium/
  en_US-amy-medium.onnx
  en_US-amy-medium.onnx.json
  tokens.txt
  espeak-ng-data/            <-- required; do not omit
```

If you use a different voice, update `VOICE_DIR` / `MODEL_FILE` in `Tts.kt`.

The model files are large (~60 MB) and are intentionally **git-ignored** — they are
not committed to the repo. This placeholder just keeps the `assets/` folder present.
