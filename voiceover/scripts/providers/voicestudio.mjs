/**
 * VoiceStudio provider — speaks to a locally running VoiceStudio backend
 * (github.com/debpalash/VoiceStudio) over its OpenAI-compatible audio API.
 *
 * Endpoint: POST {base}/v1/audio/speech   (router prefix /v1/audio)
 * Health:   GET  {base}/health
 *
 * The OpenAI-compatible route is preferred over the native POST /generate
 * because it returns raw audio bytes instead of base64-in-JSON, and its request
 * shape is the one VoiceStudio commits to keeping stable. VoiceStudio's own
 * extensions (language, instruct, description) ride along in the same body and
 * are ignored by any other OpenAI-compatible server you might point this at.
 */

const DEFAULT_BASE = process.env.OMNIVOICE_API_URL || 'http://127.0.0.1:3900';

export const name = 'voicestudio';

export async function health({ base = DEFAULT_BASE } = {}) {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, detail: `GET /health → ${res.status}` };
    return { ok: true, detail: await res.text() };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

/**
 * @param {{text: string, voice: object, sceneId: string}} req
 * @returns {Promise<Buffer>} WAV bytes
 */
export async function synthesize({ text, voice }, { base = DEFAULT_BASE } = {}) {
  const body = {
    model: voice.engine ?? 'omnivoice',
    input: text,
    // A saved voice-profile id clones that voice; "default" uses the engine's
    // own voice and lets `instruct` (voice design) do the shaping instead.
    voice: voice.profileId ?? 'default',
    response_format: 'wav',
    speed: voice.speed ?? 1.0,
  };
  if (voice.language) body.language = voice.language;
  if (voice.instruct) body.instruct = voice.instruct;
  if (voice.description) body.description = voice.description;

  const res = await fetch(`${base}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Diffusion TTS on CPU is slow; give a long sentence room to finish.
    signal: AbortSignal.timeout(Number(process.env.VOICEOVER_TIMEOUT_MS ?? 600_000)),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`VoiceStudio ${res.status}: ${detail.slice(0, 500)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export function hint() {
  return [
    `No VoiceStudio backend answered at ${DEFAULT_BASE}.`,
    '',
    'Start one:',
    '  git clone https://github.com/debpalash/VoiceStudio && cd VoiceStudio',
    '  uv sync',
    '  uv run uvicorn backend.main:app --host 127.0.0.1 --port 3900',
    '',
    'or run the desktop app, or:',
    '  docker run -d -p 127.0.0.1:3900:3900 -v omnivoice-data:/app/omnivoice_data \\',
    '    --name voicestudio palashdeb/omnivoice-studio:stable',
    '',
    'Point elsewhere with OMNIVOICE_API_URL=http://host:port',
  ].join('\n');
}
