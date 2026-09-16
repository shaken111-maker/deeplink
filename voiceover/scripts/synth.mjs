#!/usr/bin/env node
/**
 * Narration builder: script.json -> public/audio/*.wav + public/narration.json
 *
 *   node scripts/synth.mjs                      # synthesize via VoiceStudio
 *   node scripts/synth.mjs --provider=files     # use narration-assets/<id>.wav
 *   node scripts/synth.mjs --estimate           # no audio, estimated timings only
 *   node scripts/synth.mjs --force              # ignore the cache
 *
 * The manifest it writes is the single contract between "make the voice" and
 * "make the video": Remotion reads nothing but `public/narration.json` and
 * never knows or cares which provider produced the clips. Durations in the
 * manifest come from the real WAV headers, so scene timing is exact rather
 * than guessed — that is the whole reason this step exists as its own pass
 * instead of living inside the composition.
 *
 * Without audio the manifest still gets written with `estimated: true`
 * durations, so `npm run studio` works on a fresh clone with no TTS backend
 * anywhere in sight.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readWavInfo } from './lib/wav.mjs';
import * as voicestudio from './providers/voicestudio.mjs';
import * as files from './providers/files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS = { voicestudio, files };

/** Calm narration pace used only when there is no real audio to measure. */
const WORDS_PER_MINUTE = 145;
const MIN_ESTIMATE_MS = 1200;

function parseArgs(argv) {
  const opts = { provider: 'voicestudio', script: 'script.json', force: false, estimate: false };
  for (const arg of argv) {
    if (arg === '--force') opts.force = true;
    else if (arg === '--estimate') opts.estimate = true;
    else if (arg.startsWith('--provider=')) opts.provider = arg.slice('--provider='.length);
    else if (arg.startsWith('--script=')) opts.script = arg.slice('--script='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function estimateMs(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_ESTIMATE_MS, Math.round((words / WORDS_PER_MINUTE) * 60_000));
}

/** Identity of a clip: re-synthesize only when the text or the voice changed. */
function clipHash(scene, voice, providerName) {
  return createHash('sha256')
    .update(JSON.stringify({ text: scene.text, voice, provider: providerName }))
    .digest('hex')
    .slice(0, 16);
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (fallback !== null && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const script = await readJson(path.join(ROOT, opts.script));

  const audioDir = path.join(ROOT, 'public', 'audio');
  const manifestPath = path.join(ROOT, 'public', 'narration.json');
  await mkdir(audioDir, { recursive: true });

  const previous = await readJson(manifestPath, { scenes: [] });
  const priorById = new Map(previous.scenes.map((s) => [s.id, s]));

  let provider = null;
  if (!opts.estimate) {
    provider = PROVIDERS[opts.provider];
    if (!provider) {
      throw new Error(`unknown provider "${opts.provider}" (have: ${Object.keys(PROVIDERS).join(', ')})`);
    }
    const status = await provider.health({ root: ROOT });
    if (!status.ok) {
      console.error(`✗ provider "${provider.name}" unavailable: ${status.detail}\n`);
      console.error(provider.hint());
      console.error('\nRun with --estimate to build a silent manifest instead.');
      process.exit(2);
    }
    console.log(`→ provider: ${provider.name} (${status.detail.trim().slice(0, 120)})`);
  } else {
    console.log('→ estimate mode: no audio, timings derived from word count');
  }

  const scenes = [];
  let cursorMs = 0;

  for (const scene of script.scenes) {
    const hash = clipHash(scene, script.voice, opts.estimate ? 'estimate' : provider.name);
    const rel = `audio/${scene.id}.wav`;
    const abs = path.join(ROOT, 'public', rel);
    const prior = priorById.get(scene.id);

    let durationMs;
    let file = null;
    let estimated = false;

    if (opts.estimate) {
      durationMs = estimateMs(scene.text);
      estimated = true;
      // A stale clip from an earlier run would silently outlive its text.
      await rm(abs, { force: true });
    } else if (!opts.force && prior?.hash === hash && prior.file && prior.durationMs) {
      durationMs = prior.durationMs;
      file = prior.file;
      console.log(`· ${scene.id}: cached (${(durationMs / 1000).toFixed(2)}s)`);
    } else {
      const started = Date.now();
      const wav = await provider.synthesize({ text: scene.text, voice: script.voice, sceneId: scene.id }, { root: ROOT });
      const info = readWavInfo(wav);
      await writeFile(abs, wav);
      durationMs = info.durationMs;
      file = rel;
      console.log(
        `✓ ${scene.id}: ${(durationMs / 1000).toFixed(2)}s audio in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
          `(${info.sampleRate} Hz, ${info.channels}ch)`,
      );
    }

    scenes.push({
      id: scene.id,
      heading: scene.heading ?? null,
      text: scene.text,
      file,
      estimated,
      hash,
      startMs: cursorMs,
      durationMs,
      gapAfterMs: scene.gapAfterMs ?? 0,
    });

    cursorMs += durationMs + (scene.gapAfterMs ?? 0);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    provider: opts.estimate ? 'estimate' : provider.name,
    title: script.title,
    fps: script.fps ?? 30,
    width: script.width ?? 1080,
    height: script.height ?? 1920,
    totalMs: cursorMs,
    scenes,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `\nwrote public/narration.json — ${scenes.length} scenes, ${(cursorMs / 1000).toFixed(2)}s total` +
      `${opts.estimate ? ' (estimated)' : ''}`,
  );
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
