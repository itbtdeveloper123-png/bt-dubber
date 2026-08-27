import { RecapSegment, MovieRecapResult, SubtitleStyleConfig } from '../types';

/**
 * Convert time string (MM:SS or HH:MM:SS or seconds) to seconds float
 */
export function parseTimeToSeconds(timeStr: string | number): number {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().replace(',', '.').split(':').map(Number);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return Number(parts[0]) || 0;
}

/**
 * Format seconds into SRT timecode format: 00:01:23,456
 */
export function formatToSrtTime(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Format seconds into WebVTT timecode format: 00:01:23.456
 */
export function formatToVttTime(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Format seconds into ASS timecode format: 0:01:23.45
 */
export function formatToAssTime(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Generate standard SubRip (.srt) subtitle content
 */
export function generateSrtContent(segments: RecapSegment[], includeSpeakerName: boolean = true): string {
  const lines: string[] = [];

  segments.forEach((seg, idx) => {
    const startSec = parseTimeToSeconds(seg.start_time);
    let endSec = parseTimeToSeconds(seg.end_time);
    if (endSec <= startSec) endSec = startSec + 2.5;

    const speakerPrefix = includeSpeakerName && seg.speaker_name && seg.speaker_name !== 'អ្នកសម្រាយ' 
      ? `[${seg.speaker_name}]: ` 
      : '';
    const text = `${speakerPrefix}${seg.khmer_script || ''}`.trim();

    lines.push(String(idx + 1));
    lines.push(`${formatToSrtTime(startSec)} --> ${formatToSrtTime(endSec)}`);
    lines.push(text);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate standard WebVTT (.vtt) subtitle content
 */
export function generateVttContent(segments: RecapSegment[], title: string = 'BT-Dubber Subtitles'): string {
  const lines: string[] = ['WEBVTT', `NOTE Title: ${title}`, ''];

  segments.forEach((seg, idx) => {
    const startSec = parseTimeToSeconds(seg.start_time);
    let endSec = parseTimeToSeconds(seg.end_time);
    if (endSec <= startSec) endSec = startSec + 2.5;

    const speakerPrefix = seg.speaker_name && seg.speaker_name !== 'អ្នកសម្រាយ' 
      ? `<v ${seg.speaker_name}>` 
      : '';
    const speakerSuffix = speakerPrefix ? '</v>' : '';
    const text = `${speakerPrefix}${seg.khmer_script || ''}${speakerSuffix}`.trim();

    lines.push(String(idx + 1));
    lines.push(`${formatToVttTime(startSec)} --> ${formatToVttTime(endSec)}`);
    lines.push(text);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate stylized Advanced SubStation Alpha (.ass) subtitle content with Khmer font support
 */
export function generateAssContent(
  segments: RecapSegment[], 
  styleConfig?: SubtitleStyleConfig,
  title: string = 'BT-Dubber Subtitles'
): string {
  const fontFamily = styleConfig?.fontFamily === 'sans-serif' ? 'Arial' : (styleConfig?.fontFamily || 'Kantumruy Pro');
  const fontSize = styleConfig?.fontSize === 'xl' ? '46' : styleConfig?.fontSize === 'lg' ? '40' : styleConfig?.fontSize === 'sm' ? '30' : '36';
  
  // Convert hex colors to ASS &HBBGGRR format
  const hexToAssColor = (hex: string, defaultColor: string = '&H00FFFFFF') => {
    if (!hex || !hex.startsWith('#')) return defaultColor;
    const clean = hex.replace('#', '');
    if (clean.length === 6) {
      const r = clean.substring(0, 2);
      const g = clean.substring(2, 4);
      const b = clean.substring(4, 6);
      return `&H00${b}${g}${r}&`;
    }
    return defaultColor;
  };

  const primaryColor = hexToAssColor(styleConfig?.textColor || '#ffffff', '&H00FFFFFF&');
  const outlineColor = hexToAssColor(styleConfig?.strokeColor || '#000000', '&H00000000&');
  const highlightColor = hexToAssColor(styleConfig?.highlightColor || '#fbbf24', '&H0024BFFB&');

  const assHeader = `[Script Info]
; Script generated by BT-Dubber AI Studio
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${primaryColor},${highlightColor},${outlineColor},&H80000000,1,0,0,0,100,100,0,0,1,3,1.5,2,40,40,50,1
Style: Narrator,${fontFamily},${fontSize},&H00E0E7FF&,&H004338CA&,&H001E1B4B&,&H80000000,1,0,0,0,100,100,0,0,1,3,1.5,2,40,40,50,1
Style: Female,${fontFamily},${fontSize},&H00FCE7F3&,&H00BE185D&,&H00500724&,&H80000000,1,0,0,0,100,100,0,0,1,3,1.5,2,40,40,50,1
Style: Male,${fontFamily},${fontSize},&H00DBEAFE&,&H001D4ED8&,&H00172554&,&H80000000,1,0,0,0,100,100,0,0,1,3,1.5,2,40,40,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const eventLines: string[] = [];

  segments.forEach((seg) => {
    const startSec = parseTimeToSeconds(seg.start_time);
    let endSec = parseTimeToSeconds(seg.end_time);
    if (endSec <= startSec) endSec = startSec + 2.5;

    const g = (seg.speaker_gender || '').toLowerCase();
    let styleName = 'Default';
    if (g.includes('female') || g === 'child_girl') styleName = 'Female';
    else if (g === 'male' || g === 'male_elder' || g === 'child_boy') styleName = 'Male';
    else if (g === 'narrator') styleName = 'Narrator';

    const actor = seg.speaker_name || '';
    const text = (seg.khmer_script || '').replace(/\r?\n/g, '\\N');

    eventLines.push(`Dialogue: 0,${formatToAssTime(startSec)},${formatToAssTime(endSec)},${styleName},${actor},0,0,0,,${text}`);
  });

  return assHeader + eventLines.join('\n');
}

/**
 * Generate Final Cut Pro / Premiere Pro XML Subtitle Sequence Markers
 */
export function generateFcpxmlContent(recap: MovieRecapResult): string {
  const durationSec = parseTimeToSeconds(recap.total_recap_duration_est) || 180;
  const frameRate = 30;
  const totalFrames = Math.floor(durationSec * frameRate);

  const markerXml = (recap.recap_segments || []).map((seg, idx) => {
    const startSec = parseTimeToSeconds(seg.start_time);
    let endSec = parseTimeToSeconds(seg.end_time);
    if (endSec <= startSec) endSec = startSec + 2.5;
    const durSec = endSec - startSec;

    return `        <marker start="${Math.floor(startSec * frameRate)}/30s" duration="${Math.floor(durSec * frameRate)}/30s" value="[${seg.speaker_name || 'Dub'}]: ${seg.khmer_script}" completed="0"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080p30" frameDuration="1/30s" width="1920" height="1080"/>
  </resources>
  <library>
    <event name="${recap.movie_title || 'BT Dubber Project'}">
      <project name="${recap.movie_title || 'BT Dubber'}">
        <sequence format="r1" duration="${totalFrames}/30s">
          <spine>
            <gap name="Timeline" offset="0s" duration="${totalFrames}/30s" start="0s">
${markerXml}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

/**
 * Trigger file download directly in the browser
 */
export function downloadSubtitleFile(content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
