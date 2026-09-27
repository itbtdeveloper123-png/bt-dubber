export async function processAndExtractAudio(
  fileOrBlobOrUrl: File | Blob | string | null | undefined,
  customFileName?: string
): Promise<{ base64: string; mimeType: string }> {
  if (!fileOrBlobOrUrl) {
    throw new Error('No valid media file or URL provided for audio extraction');
  }

  // If input is a URL string, call server extract endpoint directly
  if (typeof fileOrBlobOrUrl === 'string') {
    const serverRes = await fetch('/api/extract-full-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaUrl: fileOrBlobOrUrl,
        fileName: customFileName || fileOrBlobOrUrl.split('/').pop() || 'media.mp4'
      })
    });

    if (serverRes.ok) {
      const data = await serverRes.json();
      if (data.base64) {
        return {
          base64: `data:${data.mimeType || 'audio/wav'};base64,${data.base64}`,
          mimeType: data.mimeType || 'audio/wav'
        };
      }
    }
    throw new Error('Server failed to extract audio from URL');
  }

  if (!(fileOrBlobOrUrl instanceof Blob)) {
    throw new Error('Invalid media input: Expected a File, Blob, or URL string');
  }

  const file = fileOrBlobOrUrl;
  const safeName = (file instanceof File && file.name) ? file.name : (customFileName || 'media.wav');

  // If it's already a pure audio file (WAV/MP3/AAC), read as base64 directly
  const cleanType = (file.type || '').split(';')[0].trim().toLowerCase();
  const isPureAudio = cleanType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(safeName);

  if (isPureAudio && file.size < 25 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          const mime = cleanType || 'audio/wav';
          resolve({ base64: result, mimeType: mime });
        } else {
          reject(new Error('Failed to read audio file'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }

  // 1. Try server-side FFmpeg 100% full audio extraction (Desktop/Server only)
  const isMobileDevice = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!isMobileDevice && file.size < 50 * 1024 * 1024) {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = (reader.result as string || '').split(',')[1];
          if (res) resolve(res);
          else reject(new Error('Empty base64'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const fileBase64 = await base64Promise;
      const serverRes = await fetch('/api/extract-full-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          fileName: safeName
        })
      });

    if (serverRes.ok) {
      const data = await serverRes.json();
      if (data.base64) {
        console.log(`🎬 [Full Audio Extracted]: ${(data.durationSec || 0).toFixed(1)}s of 100% complete audio`);
        return {
          base64: `data:${data.mimeType || 'audio/wav'};base64,${data.base64}`,
          mimeType: data.mimeType || 'audio/wav'
        };
      }
    }
  } catch (serverErr) {
    console.warn('Server FFmpeg audio extraction notice, trying browser WebAudio:', serverErr);
  }
}

  // 2. Client-side Browser WebAudio Extraction
  try {
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // On mobile devices, decoding massive video files (> 35MB) exceeds WebKit's 256MB RAM limit and causes instant iOS app crash
    if (isMobile && file.size > 35 * 1024 * 1024) {
      console.warn('⚠️ File is too large for mobile in-memory WebAudio decoding (>35MB). Skipping memory-heavy decode to prevent iOS crash.');
      return {
        base64: '',
        mimeType: file.type || 'video/mp4'
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) throw new Error('AudioContext not supported');

    const audioCtx = new AudioCtx();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const duration = decodedBuffer.duration;
    const cappedDuration = Math.min(duration, isMobile ? 300 : 1800); // 5 mins on mobile, 30 mins on desktop
    const targetSampleRate = 16000;
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
    console.warn('Browser audio extraction error:', err);
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // If file is > 25MB on mobile, do NOT read as Base64 to prevent OOM crash
    if (isMobile || file.size > 30 * 1024 * 1024) {
      return {
        base64: '',
        mimeType: file.type || 'video/mp4'
      };
    }

    // Fallback for smaller files: Read full file as base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          resolve({ base64: result, mimeType: file.type || 'video/mp4' });
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
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
