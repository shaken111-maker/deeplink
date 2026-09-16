/**
 * Minimal RIFF/WAVE header reader.
 *
 * The pipeline needs one number from each synthesized clip — its duration — so
 * Remotion can lay scenes end to end. Parsing 44-ish bytes of header here keeps
 * ffmpeg/ffprobe out of the dependency set entirely; VoiceStudio's
 * `/v1/audio/speech` with `response_format: "wav"` always answers with a plain
 * PCM RIFF file, which is exactly what this understands.
 */

/**
 * @param {Buffer} buf
 * @returns {{durationMs: number, sampleRate: number, channels: number, bitsPerSample: number}}
 */
export function readWavInfo(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file (the provider returned something else — check response_format)');
  }

  let fmt = null;
  let dataBytes = null;

  // Walk the chunk list. Chunks are 8-byte header + payload, word-aligned.
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;

    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      // A streamed WAV can carry size 0 or 0xFFFFFFFF; fall back to what is
      // actually on disk rather than trusting the declared length.
      dataBytes = size > 0 && body + size <= buf.length ? size : buf.length - body;
    }

    off = body + size + (size % 2);
  }

  if (!fmt) throw new Error('WAV has no fmt chunk');
  if (dataBytes == null) throw new Error('WAV has no data chunk');

  const bytesPerFrame = (fmt.bitsPerSample / 8) * fmt.channels || 1;
  const frames = dataBytes / bytesPerFrame;
  return {
    durationMs: Math.round((frames / fmt.sampleRate) * 1000),
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
  };
}
