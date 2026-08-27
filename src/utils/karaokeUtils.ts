/**
 * Khmer Karaoke Word & Single-Line Splitting Utilities
 * Uses Unicode-standard Khmer Word & Grapheme cluster boundary segmentation
 * to prevent breaking Khmer ligatures, coeng subscripts (ជើងអក្សរ), and vowel signs (ដៃជើង).
 */

export interface KaraokeWord {
  word: string;
  startSec: number;
  endSec: number;
  isPast: boolean;
  isActive: boolean;
  isFuture: boolean;
}

/**
 * Clean script by removing speaker tags e.g. "អ្នកសម្រាយ៖ " or "[Piseth]: "
 */
export function cleanKhmerScript(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^\[[^\]]+\]:\s*/, '')
    .replace(/^([^\s:៖]+[:៖]\s*)/, '')
    .trim();
}

/**
 * Split Khmer text into whole, unbroken words using Intl.Segmenter or space/punctuation boundaries
 * Guarantees Khmer consonant-coeng clusters (ជើងអក្សរ ្) and vowel signs (ស្រៈលើក្រោម) are NEVER broken!
 */
export function splitKhmerIntoWords(text: string): string[] {
  const clean = cleanKhmerScript(text);
  if (!clean) return [];

  // Check if browser/runtime supports Intl.Segmenter with Khmer locale
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter('km', { granularity: 'word' });
      const segments = Array.from(segmenter.segment(clean)) as Array<{ segment: string; isWordLike?: boolean }>;
      const words = segments
        .map(s => s.segment.trim())
        .filter(s => s.length > 0 && !/^[.,!?។៕៖\s]+$/.test(s));
      if (words.length > 0) return words;
    } catch {}
  }

  // Fallback: Split on spaces or Khmer punctuation
  const spaceTokens = clean.split(/[.,!?។៕៖\s]+/).filter(t => t.trim().length > 0);
  if (spaceTokens.length > 0) {
    return spaceTokens;
  }

  return [clean];
}

/**
 * Split Khmer sentence into short, concise single-line phrases (បង្ហាញមួយជួរៗ ត្រឹម ៣-៥ ពាក្យពេញ)
 * Never cuts words or syllables mid-character.
 */
export function splitKhmerIntoLines(text: string): string[] {
  const clean = cleanKhmerScript(text);
  if (!clean) return [];

  const words = splitKhmerIntoWords(clean);
  if (words.length === 0) return [];

  // Group 3 to 5 unbroken words per single line
  const lines: string[] = [];
  let currentLineWords: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (
      currentLineWords.length >= 4 ||
      (currentLength + word.length > 24 && currentLineWords.length >= 2)
    ) {
      lines.push(currentLineWords.join(' '));
      currentLineWords = [word];
      currentLength = word.length;
    } else {
      currentLineWords.push(word);
      currentLength += word.length + 1;
    }
  }

  if (currentLineWords.length > 0) {
    lines.push(currentLineWords.join(' '));
  }

  return lines.filter(l => l.trim().length > 0);
}

/**
 * Calculate dynamic karaoke word boundaries and current active highlight index
 */
export function getKaraokeWords(
  rawScript: string,
  startSec: number,
  endSec: number,
  currentTimeSec: number
): { words: KaraokeWord[]; activeWordIndex: number; progress: number } {
  const words = splitKhmerIntoWords(rawScript);
  if (words.length === 0) {
    return { words: [], activeWordIndex: -1, progress: 0 };
  }

  const duration = Math.max(0.4, endSec - startSec);
  const elapsed = Math.max(0, Math.min(duration, currentTimeSec - startSec));
  const progress = elapsed / duration;

  const timePerWord = duration / words.length;
  
  let activeIndex = Math.floor(elapsed / timePerWord);
  if (currentTimeSec < startSec) activeIndex = -1;
  if (currentTimeSec >= endSec) activeIndex = words.length - 1;
  if (activeIndex >= words.length) activeIndex = words.length - 1;

  const wordItems: KaraokeWord[] = words.map((word, idx) => {
    const wStart = startSec + idx * timePerWord;
    const wEnd = wStart + timePerWord;
    const isActive = idx === activeIndex && currentTimeSec >= startSec && currentTimeSec <= endSec;
    const isPast = idx < activeIndex || (currentTimeSec > endSec);
    const isFuture = idx > activeIndex && currentTimeSec < wStart;

    return {
      word,
      startSec: wStart,
      endSec: wEnd,
      isActive,
      isPast,
      isFuture,
    };
  });

  return {
    words: wordItems,
    activeWordIndex: activeIndex,
    progress,
  };
}

/**
 * Get active single line (1 ជួរគត់) for current playhead position
 */
export function getActiveSingleLineKaraoke(
  rawScript: string,
  startSec: number,
  endSec: number,
  currentTimeSec: number
): { lineText: string; words: KaraokeWord[]; lineIndex: number; totalLines: number } | null {
  const lines = splitKhmerIntoLines(rawScript);
  if (lines.length === 0) return null;

  const duration = Math.max(0.5, endSec - startSec);
  const timePerLine = duration / lines.length;

  const elapsed = Math.max(0, Math.min(duration, currentTimeSec - startSec));
  let lineIdx = Math.floor(elapsed / timePerLine);
  if (lineIdx >= lines.length) lineIdx = lines.length - 1;
  if (lineIdx < 0) lineIdx = 0;

  const activeLineText = lines[lineIdx];
  const lineStart = startSec + lineIdx * timePerLine;
  const lineEnd = lineStart + timePerLine;

  const { words } = getKaraokeWords(activeLineText, lineStart, lineEnd, currentTimeSec);

  return {
    lineText: activeLineText,
    words,
    lineIndex: lineIdx,
    totalLines: lines.length
  };
}
