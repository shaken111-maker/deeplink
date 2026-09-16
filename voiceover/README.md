# voiceover — narrated video for `deeplink`

A Remotion composition whose timing is driven by a real voice track, and a
synthesis step that can produce that track locally with
[VoiceStudio](https://github.com/debpalash/VoiceStudio) — no API key, no
account, nothing leaving the machine.

```
script.json ──synth──> public/audio/*.wav + public/narration.json ──remotion──> out/narrated.mp4
```

Two passes rather than one on purpose: the composition needs each clip's real
duration to lay scenes end to end, and that duration only exists once the audio
does. `synth` measures it off the WAV header and writes it into the manifest;
Remotion reads nothing else.

## Quick start

```bash
npm install

# No TTS backend yet? Build a silent, word-count-timed manifest and look around:
npm run synth:estimate && npm run studio

# With VoiceStudio running on 127.0.0.1:3900:
npm run synth && npm run render
```

## Producing the voice

### VoiceStudio (default)

`npm run synth` posts each scene to `POST /v1/audio/speech` — VoiceStudio's
OpenAI-compatible route — and asks for `response_format: "wav"`.

Start a backend:

```bash
docker run -d -p 127.0.0.1:3900:3900 -v omnivoice-data:/app/omnivoice_data \
  --name voicestudio palashdeb/omnivoice-studio:stable
```

or clone the repo and `uv sync && uv run uvicorn backend.main:app --port 3900`,
or just run the desktop app. Elsewhere on the network:
`OMNIVOICE_API_URL=http://box:3900 npm run synth`.

First synthesis downloads model weights from HuggingFace (~2.4 GB for the
default `omnivoice` engine) and caches them. A GPU — CUDA, Apple Silicon
MPS/MLX, or ROCm — makes this pleasant; CPU works but a diffusion engine on CPU
is slow. `supertonic3` is pure ONNX/CPU if that is what you have.

**Cloning a voice:** record 3-10 s of clean speech, `POST /profiles` with it,
put the returned id in `script.json` as `voice.profileId`. **Designing one
without a sample:** leave `profileId` null and describe it in `voice.instruct`.

### Anything else

```bash
npm run synth -- --provider=files      # reads narration-assets/<sceneId>.wav
```

One WAV per scene. Cloud TTS, an ElevenLabs export, a real recording — the
manifest, the timings and the render behave identically.

New providers are one module in `scripts/providers/` (`name`, `health`,
`synthesize`, `hint`) plus a line in the `PROVIDERS` map in
`scripts/synth.mjs`.

## Editing the narration

Everything lives in `script.json`. Change a line, re-run `synth` — it hashes
`text + voice + provider` per scene and only re-synthesizes what moved.
`--force` rebuilds all of it.

```jsonc
{
  "voice": {
    "engine": "omnivoice",      // VoiceStudio engine id
    "language": "Russian",
    "instruct": "спокойный уверенный мужской голос, размеренный темп",
    "profileId": null,          // set to a cloned voice id to use it instead
    "speed": 1.0
  },
  "scenes": [
    { "id": "01-problem", "heading": "Проблема", "text": "…", "gapAfterMs": 350 }
  ]
}
```

`scenes[].text` is both spoken and shown. `id` names the WAV file, so keep ids
stable if you want the cache to keep working.

## Rendering

```bash
npm run render          # out/narrated.mp4
npm run studio          # interactive preview
npm run typecheck
```

Remotion fetches Chrome Headless Shell from `remotion.media` on first render.
Where that host is blocked (locked-down CI, sandboxes), reuse a Chromium you
already have:

```bash
npx remotion render Narrated out/narrated.mp4 \
  --browser-executable=/path/to/chrome-linux/headless_shell
```

## Layout

| Path | |
|---|---|
| `script.json` | The narration. The only file you normally edit |
| `scripts/synth.mjs` | script → clips + manifest, with per-scene caching |
| `scripts/providers/` | `voicestudio.mjs` (local TTS), `files.mjs` (BYO audio) |
| `scripts/lib/wav.mjs` | RIFF header reader — why there is no ffmpeg dependency |
| `public/narration.json` | Generated contract between the two passes |
| `public/audio/` | Generated clips (gitignored) |
| `src/Root.tsx` | Composition; length and size come from the manifest |
| `src/Narrated.tsx` | Scene rendering, word highlighting, audio placement |

## Caveat

Word highlighting spreads a scene's words evenly over its measured duration. It
tracks the voice well because the duration is real, but it is not forced
alignment. Word-accurate captions would mean transcribing the synthesized audio
(VoiceStudio's `/v1/audio/transcriptions` returns word timings) and handing the
result to `@remotion/captions`.
