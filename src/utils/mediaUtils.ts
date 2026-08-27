/**
 * Media URL utility to safely resolve media sources and bypass browser CORS / COEP restrictions.
 */
export function getSafeMediaUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Local object URLs, Data URIs, or relative server paths are safe
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:') || trimmed.startsWith('/')) {
    return trimmed;
  }

  // Same-origin localhost/127.0.0.1
  if (
    trimmed.startsWith('http://localhost') ||
    trimmed.startsWith('http://127.0.0.1') ||
    trimmed.startsWith('https://localhost') ||
    trimmed.startsWith('https://127.0.0.1')
  ) {
    return trimmed;
  }

  // Already routed through proxy
  if (trimmed.includes('/api/proxy-media?url=')) {
    return trimmed;
  }

  // External HTTP / HTTPS media - route through local streaming proxy to prevent CORS/COEP blocking
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `/api/proxy-media?url=${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

/**
 * Uploads large media files in high-speed 4-worker parallel streams (8MB chunks).
 * Maximize upload bandwidth utilization while maintaining 100% immunity to Cloudflare Tunnel limits.
 */
export async function uploadMediaInChunks(
  fileOrBlob: Blob | File,
  fileName: string,
  onProgress?: (percent: number, loadedMB: string, totalMB: string, speedMBps: string) => void
): Promise<{ serverUrl: string; serverFileName: string; size: number }> {
  const totalSize = fileOrBlob.size;
  // Adaptive chunk size: 8MB for files > 80MB, 4MB for smaller files
  const CHUNK_SIZE = totalSize > 80 * 1024 * 1024 ? 8 * 1024 * 1024 : 4 * 1024 * 1024;
  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
  const uploadId = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let completedChunks = 0;
  let loadedBytes = 0;
  const startTime = Date.now();
  let lastCompleteData: any = null;

  const totalMBStr = (totalSize / (1024 * 1024)).toFixed(1);

  // Queue of chunks to upload
  const queue = Array.from({ length: totalChunks }, (_, idx) => idx);
  const CONCURRENCY = Math.min(4, totalChunks);

  async function worker() {
    while (queue.length > 0) {
      const i = queue.shift();
      if (i === undefined) break;

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkSize = end - start;
      const chunk = fileOrBlob.slice(start, end);

      let attempts = 0;
      let chunkOk = false;
      let lastError: any = null;

      while (attempts < 3 && !chunkOk) {
        attempts++;
        try {
          const queryParams = new URLSearchParams({
            uploadId,
            chunkIndex: i.toString(),
            totalChunks: totalChunks.toString(),
            fileName: fileName || 'video.mp4'
          });

          const res = await fetch(`/api/upload-chunk?${queryParams.toString()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk
          } as any);

          if (res.ok) {
            const data = await res.json();
            if (data.complete) {
              lastCompleteData = data;
            }
            chunkOk = true;
          } else {
            lastError = new Error(`Server status ${res.status}`);
            await new Promise(r => setTimeout(r, 600));
          }
        } catch (err) {
          lastError = err;
          await new Promise(r => setTimeout(r, 600));
        }
      }

      if (!chunkOk) {
        throw lastError || new Error(`Failed to upload chunk ${i + 1}/${totalChunks}`);
      }

      completedChunks++;
      loadedBytes += chunkSize;

      if (onProgress) {
        const pct = Math.min(99, Math.round((completedChunks / totalChunks) * 100));
        const loadedMBStr = (loadedBytes / (1024 * 1024)).toFixed(1);
        const elapsedSec = (Date.now() - startTime) / 1000 || 0.1;
        const speedMBps = (loadedBytes / (1024 * 1024) / elapsedSec).toFixed(1);
        onProgress(pct, loadedMBStr, totalMBStr, speedMBps);
      }
    }
  }

  // Run CONCURRENCY workers simultaneously
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  if (!lastCompleteData || !lastCompleteData.url) {
    try {
      const q = new URLSearchParams({
        uploadId,
        chunkIndex: '0',
        totalChunks: totalChunks.toString(),
        fileName: fileName || 'video.mp4'
      });
      const checkRes = await fetch(`/api/upload-chunk?${q.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Blob([])
      } as any);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.complete && checkData.url) {
          lastCompleteData = checkData;
        }
      }
    } catch {}
  }

  if (lastCompleteData && lastCompleteData.url) {
    if (onProgress) onProgress(100, totalMBStr, totalMBStr, '0');
    return {
      serverUrl: lastCompleteData.url,
      serverFileName: lastCompleteData.fileName || fileName,
      size: lastCompleteData.size || totalSize
    };
  }

  throw new Error('Chunked upload completed but server file assembly is pending');
}
