export async function processAndExtractAudio(file: File): Promise<{ base64: string; mimeType: string }> {
  // If it's already a small audio or video file (< 8MB), we can read as base64 directly
  if (file.size < 8 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          const mimeType = file.type || (file.name.endsWith('.mp3') ? 'audio/mp3' : 'video/mp4');
          resolve({ base64: result, mimeType });
        } else {
          reject(new Error('Failed to read file as Data URL'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }

  // For larger video/audio files (> 8MB), extract & downsample audio track to lightweight 16kHz WAV
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) throw new Error('AudioContext not supported');

    const audioCtx = new AudioCtx();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Target 16,000 Hz Mono for compact size & high speech recognition accuracy
    const targetSampleRate = 16000;
    const duration = decodedBuffer.duration;
    // Cap audio duration at max 4 minutes (240s) for ultra-fast upload and instant translation
    const cappedDuration = Math.min(duration, 240);
    const targetLength = Math.floor(cappedDuration * targetSampleRate);

    const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    audioCtx.close().catch(() => {});

    const wavBlob = audioBufferToWav(renderedBuffer);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          resolve({ base64: result, mimeType: 'audio/wav' });
        } else {
          reject(new Error('Failed to convert WAV blob to base64'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error on WAV blob'));
      reader.readAsDataURL(wavBlob);
    });

  } catch (err) {
    console.warn('Browser audio extraction failed, falling back to direct slice:', err);
    // Fallback: Slice first 6MB of raw file if audio decoding fails
    const slicedBlob = file.slice(0, 6 * 1024 * 1024, file.type);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          resolve({ base64: result, mimeType: file.type || 'video/mp4' });
        } else {
          reject(new Error('Failed to read sliced file'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error on slice'));
      reader.readAsDataURL(slicedBlob);
    });
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * 2;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
