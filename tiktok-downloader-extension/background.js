// Background Service Worker (Manifest V3) for TikTok Downloader HD - BT Dubber

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TikTok Downloader Extension] Installed and ready.');
});

// Helper to sanitize filenames for OS compatibility
function sanitizeFilename(name) {
  if (!name) return `TikTok_Video_${Date.now()}`;
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}

// Normalize various TikTok URLs into standard formats and candidate URLs
function normalizeTikTokUrl(rawUrl) {
  if (!rawUrl) return { id: '', candidates: [] };
  const cleanUrl = rawUrl.trim().split('?')[0];

  // Match numeric video or episode ID
  const idMatch = cleanUrl.match(/\/(\d{15,25})/);
  const videoId = idMatch ? idMatch[1] : '';

  const candidates = [cleanUrl];

  if (videoId) {
    // Generate standard video canonical candidates
    const std1 = `https://www.tiktok.com/@tiktok/video/${videoId}`;
    const std2 = `https://www.tiktok.com/@user/video/${videoId}`;
    const std3 = `https://www.tiktok.com/v/${videoId}`;
    if (!candidates.includes(std1)) candidates.unshift(std1);
    if (!candidates.includes(std2)) candidates.push(std2);
    if (!candidates.includes(std3)) candidates.push(std3);
  }

  return { id: videoId, candidates };
}

// Resolve shortened URLs like vt.tiktok.com or tiktok.com/t/
async function resolveShortUrl(url) {
  try {
    if (url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com') || url.includes('/t/')) {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.url && res.url !== url) {
        return res.url;
      }
    }
  } catch (e) {
    console.warn('[TikTok Downloader] Error resolving short URL:', e);
  }
  return url;
}

// Fetch from TikWM API with candidate URLs
async function fetchFromTikWM(targetUrl) {
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}&hd=1`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const data = await res.json();
    if (data.code === 0 && data.data) {
      const d = data.data;
      return {
        success: true,
        id: d.id,
        title: d.title || 'TikTok Video',
        author: d.author ? (d.author.nickname || d.author.unique_id) : 'TikTok Creator',
        authorId: d.author ? d.author.unique_id : '',
        avatar: d.author ? d.author.avatar : '',
        cover: d.cover || d.origin_cover || '',
        playUrl: d.hdplay || d.play || d.wmplay || '',
        wmPlayUrl: d.wmplay || '',
        musicUrl: d.music || (d.music_info ? d.music_info.play : ''),
        musicTitle: d.music_info ? d.music_info.title : 'TikTok Audio',
        duration: d.duration || 0,
        stats: {
          plays: d.play_count || 0,
          likes: d.digg_count || 0,
          comments: d.comment_count || 0,
          shares: d.share_count || 0
        },
        source: 'TIKWM'
      };
    }
    return { success: false, error: data.msg || 'TikWM parse failed' };
  } catch (err) {
    return { success: false, error: err.message || 'Network error fetching TikWM' };
  }
}

// Fallback: Fetch from Local BT Dubber Server if running
async function fetchFromLocalDubber(targetUrl) {
  try {
    const res = await fetch('http://localhost:3000/api/tiktok/episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && (data.realVideo || (data.episodes && data.episodes.length > 0))) {
        const ep = data.realVideo || data.episodes[0];
        return {
          success: true,
          id: ep.videoId || ep.id || 'dubber_vid',
          title: ep.title || 'TikTok Drama Video',
          author: ep.author || data.channel?.nickname || 'TikTok Creator',
          authorId: ep.authorId || data.channel?.username || '',
          avatar: data.channel?.avatar || '',
          cover: ep.thumbnail || ep.cover || data.channel?.avatar || '',
          playUrl: ep.playUrl || `http://localhost:3000/api/tiktok/download?url=${encodeURIComponent(targetUrl)}`,
          musicUrl: '',
          musicTitle: 'TikTok Audio',
          duration: ep.duration || 0,
          stats: {
            likes: 0,
            comments: 0
          },
          source: 'LOCAL_DUBBER'
        };
      }
    }
  } catch (e) {
    // Local server not reachable, silently continue
  }
  return { success: false, error: 'Local server not available' };
}

// Fallback: Official TikTok oEmbed API for basic metadata
async function fetchFromOEmbed(targetUrl) {
  try {
    const cleanUrl = targetUrl.split('?')[0];
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.title || data.author_name) {
        return {
          success: true,
          id: targetUrl.match(/\/(\d{15,25})/)?.[1] || Date.now().toString(),
          title: data.title || 'TikTok Video',
          author: data.author_name || 'TikTok Creator',
          authorId: data.author_unique_id || '',
          avatar: '',
          cover: data.thumbnail_url || '',
          playUrl: '', // oEmbed doesn't provide direct video stream
          musicUrl: '',
          musicTitle: 'TikTok Audio',
          duration: 0,
          stats: { likes: 0, comments: 0 },
          source: 'OEMBED'
        };
      }
    }
  } catch (e) {
    // Silently continue
  }
  return { success: false, error: 'oEmbed fetch failed' };
}

// Master metadata fetcher with intelligent multi-tier pipeline
async function fetchTikTokMetadata(rawUrl) {
  if (!rawUrl) return { success: false, error: 'សូមបញ្ចូល Link TikTok' };

  // 1. Resolve short links
  const resolvedUrl = await resolveShortUrl(rawUrl);

  // 2. Normalize and get candidate URLs
  const { id, candidates } = normalizeTikTokUrl(resolvedUrl);

  // 3. Try TikWM across candidates
  for (const candidate of candidates) {
    const result = await fetchFromTikWM(candidate);
    if (result.success && result.playUrl) {
      return result;
    }
  }

  // 4. Try Local BT Dubber Server
  const localResult = await fetchFromLocalDubber(resolvedUrl);
  if (localResult.success) {
    return localResult;
  }

  // 5. Try TikTok oEmbed API as metadata fallback
  const oembedResult = await fetchFromOEmbed(resolvedUrl);
  if (oembedResult.success) {
    return oembedResult;
  }

  return {
    success: false,
    error: 'មិនអាចទាញយកព័ត៌មានវីដេអូបានទេ។ សូមប្រាកដថា Link ត្រឹមត្រូវ ឬបើកវីដេអូនោះផ្ទាល់លើ TikTok រួចបើក Extension ម្តងទៀត។'
  };
}

// Message Dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_TIKTOK_DATA') {
    fetchTikTokMetadata(request.url).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (request.action === 'DOWNLOAD_MEDIA') {
    const { url, title, author, isAudio, format } = request;
    if (!url) {
      sendResponse({ success: false, error: 'No download URL provided' });
      return true;
    }

    const ext = isAudio ? 'mp3' : (format || 'mp4');
    const safeTitle = sanitizeFilename(title || 'TikTok_Video');
    const safeAuthor = sanitizeFilename(author || 'creator');
    const filename = `TikTok_${safeAuthor}_${safeTitle}_${Date.now()}.${ext}`;

    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId: downloadId, filename: filename });
      }
    });
    return true;
  }

  if (request.action === 'OPEN_DUBBER_STUDIO') {
    const dubberUrl = request.videoUrl 
      ? `http://localhost:3000/?tiktokUrl=${encodeURIComponent(request.videoUrl)}`
      : 'http://localhost:3000';
    chrome.tabs.create({ url: dubberUrl });
    sendResponse({ success: true });
    return true;
  }
});
