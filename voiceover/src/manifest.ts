import raw from '../public/narration.json';

export type NarrationScene = {
  id: string;
  heading: string | null;
  text: string;
  /** Path under public/, or null when the manifest was built with --estimate. */
  file: string | null;
  estimated: boolean;
  hash: string;
  startMs: number;
  durationMs: number;
  gapAfterMs: number;
};

export type Narration = {
  generatedAt: string;
  provider: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  totalMs: number;
  scenes: NarrationScene[];
};

export const narration = raw as Narration;

export const msToFrames = (ms: number, fps: number) => Math.max(1, Math.round((ms / 1000) * fps));
