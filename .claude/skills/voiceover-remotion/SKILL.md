---
name: voiceover-remotion
description: "Produce a narrated video in this repo: write/edit the narration script, synthesize the voice track (VoiceStudio local TTS, or any WAV source), and render it with Remotion from voiceover/. Use when asked to make a narrated clip, add or change a voiceover, re-record narration, retime scenes to the audio, render the explainer video, or swap the narrating voice. Triggers: 'озвучка', 'озвучить', 'narration', 'voiceover', 'narrated video', 'render the video', 'remotion', 'change the voice', 'clone my voice for the video'."
---

# Narrated video pipeline (`voiceover/`)

Two passes, one contract. `npm run synth` turns `script.json` into WAV clips
plus `public/narration.json`; Remotion reads only that manifest. Scene timing
comes from the **measured** duration of each clip, so the video always matches
the voice — never edit timings by hand.

```
script.json ──synth──> public/audio/*.wav + public/narration.json ──remotion──> out/narrated.mp4
```

## Commands

```bash
cd voiceover
npm install
npm run synth              # VoiceStudio at $OMNIVOICE_API_URL (default 127.0.0.1:3900)
npm run synth -- --provider=files   # use narration-assets/<sceneId>.wav instead
npm run synth:estimate     # no TTS: word-count timings, silent video (always works)
npm run studio             # preview
npm run render             # out/narrated.mp4
```

`synth` caches per scene on a hash of `text + voice + provider` — editing one
line re-synthesizes one clip. `--force` rebuilds everything.

## Changing the narration

Edit `voiceover/script.json`, then re-run `synth`. Fields:

| Field | Meaning |
|---|---|
| `voice.profileId` | A VoiceStudio voice-profile id → clones that voice. `null` → engine default |
| `voice.instruct` | Voice design prompt, used when no `profileId` ("спокойный мужской голос, размеренный темп") |
| `voice.language` | Passed to the engine; `"Auto"` also works |
| `voice.engine` | VoiceStudio engine id (`omnivoice`, `voxcpm2`, `supertonic3`, …) |
| `scenes[].text` | What is spoken — also what is shown on screen |
| `scenes[].gapAfterMs` | Silence held after the clip before the next scene |

## Getting a backend up

The `omnivoice` skill in this repo covers install, health checks and voice
cloning in full — read it before debugging a connection error. Shortest path:

```bash
docker run -d -p 127.0.0.1:3900:3900 -v omnivoice-data:/app/omnivoice_data \
  --name voicestudio palashdeb/omnivoice-studio:stable
curl -s localhost:3900/health
```

To clone a voice: `POST /profiles` with a 3-10 s reference WAV, take the
returned id, put it in `script.json` as `voice.profileId`.

## When there is no backend

Any WAV source works — cloud TTS through an MCP tool, an ElevenLabs export, a
real human at a microphone. Drop one WAV per scene in
`voiceover/narration-assets/<sceneId>.wav` and run `--provider=files`. Nothing
downstream changes.

Adding a new provider: one module in `voiceover/scripts/providers/` exporting
`name`, `health()`, `synthesize()` and `hint()`, registered in the `PROVIDERS`
map in `scripts/synth.mjs`.

## Rendering in a container

Remotion downloads Chrome Headless Shell from `remotion.media` on first render.
Where that host is blocked, point it at an existing Chromium instead:

```bash
npx remotion render Narrated out/narrated.mp4 \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

## Known approximation

On-screen word highlighting spreads words evenly across each clip's duration —
close, but not forced alignment. For word-accurate captions, transcribe the
synthesized WAVs (VoiceStudio's `/v1/audio/transcriptions`, which returns word
timings) and feed them to `@remotion/captions`. Not wired up yet.
