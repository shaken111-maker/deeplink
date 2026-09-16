import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Headless Chromium in CI/containers needs this; harmless on a desktop.
Config.setChromiumOpenGlRenderer('swangle');
