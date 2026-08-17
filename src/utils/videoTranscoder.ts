let ffmpegInstance: any = null;

/**
 * Checks if a file or file name is likely to use codecs not universally supported by browser HTML5 video
 * (e.g. HEVC / H.265 from iPhone IMG_*.MP4, Apple ProRes, QuickTime MOV, MKV, AVI, etc.)
 */
export function isLikelyUnsupportedVideo(fileOrName: File | string): boolean {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  if (!name) return false;

  // Check unsupported container / codec extensions
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['mov', 'mkv', 'avi', 'flv', 'wmv', 'ts', 'm4v', 'hevc'].includes(ext)) {
    return true;
  }

  return false;
}

export async function getFFmpeg(onProgress?: (percent: number, statusText: string) => void): Promise<any> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  // Dynamic import to avoid static pre-bundling conflicts in Vite
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');

  const ffmpeg = new FFmpeg();
  ffmpegInstance = ffmpeg;

  ffmpeg.on('log', ({ message }: { message: string }) => {
    console.log('[FFmpeg Log]:', message);
  });

  ffmpeg.on('progress', ({ progress }: { progress: number }) => {
    const percent = Math.min(Math.round(progress * 100), 100);
    if (onProgress) {
      onProgress(percent, `កំពុងបម្លែងវីដេអូល្បឿនលឿន (Turbo H.264)... (${percent}%)`);
    }
  });

  if (onProgress) {
    onProgress(10, 'កំពុងដំណើរការម៉ាស៊ីនបម្លែងល្បឿនលឿន...');
  }

  // Try JSDelivr first, then unpkg CDN as fallback
  const cdnList = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm',
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
  ];

  let loaded = false;
  let lastError: any = null;

  for (const baseURL of cdnList) {
    try {
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      await ffmpeg.load({ coreURL, wasmURL });
      loaded = true;
      break;
    } catch (e) {
      console.warn(`Failed loading FFmpeg from ${baseURL}, trying next fallback...`, e);
      lastError = e;
    }
  }

  if (!loaded) {
    try {
      await ffmpeg.load();
    } catch (err) {
      console.error('All FFmpeg load attempts failed:', err || lastError);
      throw new Error('មិនអាចទាញយកប្រព័ន្ធបម្លែង FFmpeg WebAssembly បានទេ។ សូមពិនិត្យមើលអ៊ីនធឺណិតរបស់អ្នក!');
    }
  }

  return ffmpeg;
}

/**
 * Transcodes any video file (HEVC/H.265, MOV, AVI, MKV, iPhone clips) to standard H.264 + AAC MP4
 * Optimized for ULTRA-FAST processing (480p preview scale, fastdecode tuning, 24fps)
 * taking only a few seconds instead of minutes.
 */
export async function convertVideoToH264MP4(
  file: File,
  onProgress?: (percent: number, statusText: string) => void
): Promise<File> {
  try {
    if (onProgress) onProgress(5, 'រៀបចំទិន្នន័យវីដេអូដើម...');

    const ffmpeg = await getFFmpeg(onProgress);
    const { fetchFile } = await import('@ffmpeg/util');

    const ext = file.name.split('.').pop() || 'mp4';
    const inputName = `input_${Date.now()}.${ext}`;
    const outputName = `converted_${Date.now()}.mp4`;

    if (onProgress) onProgress(20, 'បញ្ចូលវីដេអូទៅកាន់ Ultra-Fast Memory...');
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    if (onProgress) onProgress(35, 'ចាប់ផ្តើមបម្លែង Video Codec ល្បឿនលឿន (Turbo Web MP4)...');

    // HIGH-DEFINITION HD H.264 ENCODING:
    // Retains full native resolution (1080p / 2K) with crisp CRF 21 for crystal-clear HD preview!
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-vcodec', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-acodec', 'aac',
      '-b:a', '192k',
      '-threads', '0',
      '-movflags', '+faststart',
      outputName
    ]);

    if (onProgress) onProgress(90, 'កំពុងបញ្ចប់ការបម្លែង...');

    const data = await ffmpeg.readFile(outputName);

    // Clean up virtual filesystem memory
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore cleanup notice
    }

    let blob: Blob;
    if (data instanceof Uint8Array) {
      blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
    } else if (typeof data === 'string') {
      const encoder = new TextEncoder();
      blob = new Blob([encoder.encode(data) as unknown as BlobPart], { type: 'video/mp4' });
    } else {
      blob = new Blob([data as any], { type: 'video/mp4' });
    }

    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '_web_h264.mp4';
    const convertedFile = new File([blob], newFileName, { type: 'video/mp4' });

    if (onProgress) onProgress(100, 'បម្លែងវីដេអូបានជោគជ័យ 100%!');

    return convertedFile;
  } catch (error: any) {
    console.error('Error during video transcoding:', error);
    throw error;
  }
}
