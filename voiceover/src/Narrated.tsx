import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { msToFrames, type NarrationScene } from './manifest';

const BG = '#0b0d12';
const FG = '#f5f6f8';
const DIM = 'rgba(245,246,248,0.34)';
const ACCENT = '#5b8cff';

/**
 * One narrated scene: the voice clip plus the words it is saying.
 *
 * Word highlighting spreads the scene's words evenly across the clip's measured
 * duration. That is an approximation — it tracks the voice closely because the
 * duration is real (read off the WAV header), but it is not forced alignment.
 * For word-accurate timing, run the audio back through ASR and feed
 * @remotion/captions instead; see README.
 */
const Scene: React.FC<{ scene: NarrationScene; index: number; total: number }> = ({ scene, index, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const speechFrames = msToFrames(scene.durationMs, fps);
  const words = scene.text.split(/\s+/).filter(Boolean);
  const spokenWords = Math.min(words.length, Math.floor((frame / speechFrames) * words.length) + 1);

  const enter = interpolate(frame, [0, Math.round(fps * 0.4)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BG, padding: 96, justifyContent: 'center' }}>
      {scene.file ? <Audio src={staticFile(scene.file)} /> : null}

      <div
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 24}px)`,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        {scene.heading ? (
          <div
            style={{
              color: ACCENT,
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 40,
            }}
          >
            {scene.heading}
          </div>
        ) : null}

        <div style={{ color: FG, fontSize: 72, fontWeight: 600, lineHeight: 1.28 }}>
          {words.map((word, i) => (
            <span key={`${scene.id}-${i}`} style={{ color: i < spokenWords ? FG : DIM, transition: 'none' }}>
              {word}{' '}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 96,
          right: 96,
          bottom: 96,
          display: 'flex',
          gap: 12,
        }}
      >
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              height: 6,
              flex: 1,
              borderRadius: 3,
              backgroundColor: i === index ? ACCENT : 'rgba(245,246,248,0.16)',
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Narrated: React.FC<{ scenes: NarrationScene[] }> = ({ scenes }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={msToFrames(scene.startMs, fps)}
          durationInFrames={msToFrames(scene.durationMs + scene.gapAfterMs, fps)}
          name={scene.id}
        >
          <Scene scene={scene} index={i} total={scenes.length} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
