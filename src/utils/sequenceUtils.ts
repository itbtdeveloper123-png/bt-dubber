import { EpisodeClip, RecapSegment } from '../types';

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
export function formatTimecode(seconds: number, forceHours: boolean = false): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);

  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');

  if (h > 0 || forceHours) {
    const hStr = h.toString().padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

/**
 * Parse time string (e.g. '00:15', '00:02.5', '00:01,500', or '01:20:05.2') into high-precision seconds
 */
export function parseTimecode(timeStr?: string | number): number {
  if (timeStr === undefined || timeStr === null) return 0;
  if (typeof timeStr === 'number') return isNaN(timeStr) ? 0 : timeStr;

  const trimmed = String(timeStr).trim().replace(',', '.');
  if (!trimmed) return 0;

  // Plain number string e.g. "12.5"
  if (!trimmed.includes(':')) {
    const val = parseFloat(trimmed);
    return isNaN(val) ? 0 : val;
  }

  const parts = trimmed.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(trimmed) || 0;
}

/**
 * Calculate effective duration of a clip after trimming
 */
export function getClipEffectiveDuration(clip: EpisodeClip): number {
  const rawDur = clip.duration || 10;
  const trimStart = Math.max(0, clip.trimStart || 0);
  const trimEnd = Math.max(0, clip.trimEnd || 0);
  const effective = Math.max(0.5, rawDur - trimStart - trimEnd);
  return effective / (clip.speed || 1);
}

/**
 * Calculate total duration of all clips in sequence
 */
export function getTotalSequenceDuration(clips: EpisodeClip[]): number {
  return clips.reduce((acc, clip) => acc + getClipEffectiveDuration(clip), 0);
}

export interface SequenceTimelinePosition {
  clipIndex: number;
  clip: EpisodeClip;
  clipLocalTime: number; // Time relative to the trimmed clip start
  clipRawTime: number;   // Absolute time in the underlying media file
  globalTime: number;
}

/**
 * Map global timeline time to the specific clip and local time within that clip
 */
export function mapGlobalTimeToClip(clips: EpisodeClip[], globalTime: number): SequenceTimelinePosition | null {
  if (!clips || clips.length === 0) return null;

  let accumulatedTime = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const effectiveDur = getClipEffectiveDuration(clip);
    const clipStartGlobal = accumulatedTime;
    const clipEndGlobal = accumulatedTime + effectiveDur;

    if (globalTime >= clipStartGlobal && (globalTime < clipEndGlobal || i === clips.length - 1)) {
      const localProgress = Math.max(0, globalTime - clipStartGlobal);
      const clipRawTime = (clip.trimStart || 0) + (localProgress * (clip.speed || 1));
      return {
        clipIndex: i,
        clip,
        clipLocalTime: localProgress,
        clipRawTime,
        globalTime,
      };
    }
    accumulatedTime += effectiveDur;
  }

  // If beyond total duration, return end of last clip
  const lastIndex = clips.length - 1;
  const lastClip = clips[lastIndex];
  const effectiveDur = getClipEffectiveDuration(lastClip);
  return {
    clipIndex: lastIndex,
    clip: lastClip,
    clipLocalTime: effectiveDur,
    clipRawTime: (lastClip.trimStart || 0) + (effectiveDur * (lastClip.speed || 1)),
    globalTime,
  };
}

/**
 * Find active subtitle segment for current playback with sub-second precision
 */
export function findActiveSubtitle(segments: RecapSegment[] | undefined, rawTimeSeconds: number): RecapSegment | null {
  if (!segments || segments.length === 0) return null;

  for (const seg of segments) {
    const start = parseTimecode(seg.start_time);
    const end = parseTimecode(seg.end_time);
    if (rawTimeSeconds >= (start - 0.05) && rawTimeSeconds < (end + 0.15)) {
      return seg;
    }
  }
  return null;
}
