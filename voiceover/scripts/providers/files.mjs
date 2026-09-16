/**
 * Bring-your-own-audio provider.
 *
 * Reads `narration-assets/<sceneId>.wav` instead of calling a TTS server. This
 * is the escape hatch for any voice source that is not an HTTP endpoint this
 * repo knows about: a cloud TTS run through an MCP tool, an ElevenLabs export,
 * or a human actually recording the lines. Everything downstream — durations,
 * manifest, Remotion timing — behaves identically.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const name = 'files';

const DIR = process.env.VOICEOVER_ASSET_DIR || 'narration-assets';

export async function health({ root } = {}) {
  return { ok: true, detail: `reading WAVs from ${path.join(root ?? '.', DIR)}` };
}

export async function synthesize({ sceneId }, { root = '.' } = {}) {
  const file = path.join(root, DIR, `${sceneId}.wav`);
  try {
    return await readFile(file);
  } catch {
    throw new Error(`expected ${file} — drop a WAV there for scene "${sceneId}"`);
  }
}

export function hint() {
  return `Put one WAV per scene in ${DIR}/, named <sceneId>.wav.`;
}
