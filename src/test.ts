import { detectPotentialBoundaries } from './ffmpeg';

const path = '/Volumes/nhk/The Great Summits - 6113 - 015.mp4';
detectPotentialBoundaries(path, 0, 120000);
