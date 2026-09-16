import React from 'react';
import { Composition } from 'remotion';

import { Narrated } from './Narrated';
import { msToFrames, narration } from './manifest';

/**
 * Everything about this composition — length, size, scene timing — comes from
 * public/narration.json, which `npm run synth` regenerates from the real
 * synthesized audio. Change the script, re-run synth, and the video re-times
 * itself; nothing here needs touching.
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="Narrated"
    component={Narrated}
    durationInFrames={msToFrames(narration.totalMs, narration.fps)}
    fps={narration.fps}
    width={narration.width}
    height={narration.height}
    defaultProps={{ scenes: narration.scenes }}
  />
);
