// Content script injected into tiktok.com for on-page instant video download buttons
// and direct DOM video extraction for the BT Dubber popup.

(function() {
  console.log('[TikTok Downloader HD] Content script activated on TikTok.');

  const PROCESSED_ATTR = 'data-bt-downloader-attached';

  // Helper: Extract detailed metadata from TikTok internal script tags
  function extractPageJsonMetadata() {
    try {
      // 1. Check __UNIVERSAL_DATA_FOR_REHYDRATION__
      const rehydrationScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydrationScript && rehydrationScript.textContent) {
        const data = JSON.parse(rehydrationScript.textContent);
        const defaultScope = data?.['__DEFAULT_SCOPE__'] || {};

        // Check standard video detail
        const videoDetail = defaultScope['webapp.video-detail'];
        if (videoDetail?.itemInfo?.itemStruct) {
          const item = videoDetail.itemInfo.itemStruct;
          return {
            id: item.id,
            title: item.desc || document.title.replace(' | TikTok', '') || 'TikTok Video',
            author: item.author?.nickname || item.author?.uniqueId || 'TikTok Creator',
            authorId: item.author?.uniqueId || '',
            avatar: item.author?.avatarLarger || item.author?.avatarThumb || '',
            cover: item.video?.cover || item.video?.originCover || item.video?.dynamicCover || '',
            playUrl: item.video?.playAddr || item.video?.downloadAddr || '',
            musicUrl: item.music?.playUrl || '',
            musicTitle: item.music?.title || 'TikTok Audio',
            duration: item.video?.duration || 0,
            stats: {
              plays: item.stats?.playCount || 0,
              likes: item.stats?.diggCount || 0,
              comments: item.stats?.commentCount || 0,
              shares: item.stats?.shareCount || 0
            }
          };
        }

        // Check shortdrama detail
        const shortdramaDetail = defaultScope['webapp.shortdrama-detail'] || defaultScope['webapp.series-detail'];
        if (shortdramaDetail) {
          const epList = shortdramaDetail.episodeList || shortdramaDetail.episodes || [];
          const currentEpId = window.location.pathname.split('/').pop();
          const currentEp = epList.find(e => String(e.id) === String(currentEpId) || String(e.itemId) === String(currentEpId)) || epList[0] || shortdramaDetail;
          
          if (currentEp) {
            return {
              id: currentEp.id || currentEpId || 'shortdrama',
              title: currentEp.title || shortdramaDetail.seriesTitle || document.title.replace(' | TikTok', '') || 'TikTok Shortdrama Episode',
              author: shortdramaDetail.author?.nickname || 'TikTok ShortDrama',
              authorId: shortdramaDetail.author?.uniqueId || 'shortdrama',
              avatar: shortdramaDetail.author?.avatar || '',
              cover: currentEp.cover || currentEp.poster || shortdramaDetail.cover || '',
              playUrl: currentEp.playAddr || currentEp.videoUrl || '',
              musicUrl: '',
              musicTitle: 'Drama Audio',
              duration: currentEp.duration || 0,
              stats: {
                plays: currentEp.playCount || 0,
                likes: currentEp.diggCount || 0,
                comments: currentEp.commentCount || 0,
                shares: 0
              }
            };
          }
        }
      }

      // 2. Check SIGI_STATE
      const sigiScript = document.getElementById('SIGI_STATE');
      if (sigiScript && sigiScript.textContent) {
        const sigiData = JSON.parse(sigiScript.textContent);
        const itemModule = sigiData.ItemModule;
        if (itemModule) {
          const firstKey = Object.keys(itemModule)[0];
          const item = itemModule[firstKey];
          if (item) {
            return {
              id: item.id,
              title: item.desc || document.title || 'TikTok Video',
              author: item.nickname || item.author || 'TikTok Creator',
              authorId: item.author || '',
              avatar: item.author?.avatarLarger || '',
              cover: item.video?.cover || item.video?.originCover || '',
              playUrl: item.video?.playAddr || item.video?.downloadAddr || '',
              musicUrl: item.music?.playUrl || '',
              musicTitle: item.music?.title || 'TikTok Audio',
              duration: item.video?.duration || 0,
              stats: {
                plays: item.stats?.playCount || 0,
                likes: item.stats?.diggCount || 0,
                comments: item.stats?.commentCount || 0,
                shares: item.stats?.shareCount || 0
              }
            };
          }
        }
      }
    } catch (e) {
      console.warn('[TikTok Downloader] Error extracting JSON metadata:', e);
    }
    return null;
  }

  // Extract real video data from the currently visible or playing video on page
  function extractCurrentPageVideoData() {
    // 1. Try script tag metadata first
    const scriptMeta = extractPageJsonMetadata();

    // 2. Find active video element in DOM
    const videos = Array.from(document.querySelectorAll('video'));
    let activeVideo = videos.find(v => !v.paused && v.readyState > 1) || videos[0];

    // Find direct video source URL
    let videoStreamUrl = '';
    if (activeVideo) {
      videoStreamUrl = activeVideo.currentSrc || activeVideo.src || '';
    }

    // Extract title from DOM
    const titleEl = document.querySelector('h1') || 
                    document.querySelector('[data-e2e="browse-video-desc"]') || 
                    document.querySelector('[data-e2e="user-post-item-desc"]') ||
                    document.querySelector('div[class*="DivDescriptionContent"]');
    const title = titleEl ? titleEl.textContent.trim() : (document.title.replace(' | TikTok', '').trim() || 'TikTok Video');

    // Extract author from DOM
    const authorEl = document.querySelector('[data-e2e="user-title"]') || 
                     document.querySelector('[data-e2e="browser-nickname"]') ||
                     document.querySelector('a[href*="/@"]');
    let author = authorEl ? authorEl.textContent.trim() : 'TikTok Creator';
    author = author.replace(/^@/, '');

    // Extract stats from DOM
    const likesEl = document.querySelector('[data-e2e="like-count"]') || document.querySelector('[data-e2e="browse-like-count"]');
    const commentsEl = document.querySelector('[data-e2e="comment-count"]') || document.querySelector('[data-e2e="browse-comment-count"]');

    function parseStatNumber(text) {
      if (!text) return 0;
      const clean = text.trim().toUpperCase();
      if (clean.endsWith('K')) return Math.round(parseFloat(clean) * 1000);
      if (clean.endsWith('M')) return Math.round(parseFloat(clean) * 1000000);
      return parseInt(clean.replace(/[^\d]/g, ''), 10) || 0;
    }

    const likes = likesEl ? parseStatNumber(likesEl.textContent) : 0;
    const comments = commentsEl ? parseStatNumber(commentsEl.textContent) : 0;

    // Get thumbnail poster
    let cover = '';
    if (activeVideo && activeVideo.poster) {
      cover = activeVideo.poster;
    } else if (scriptMeta && scriptMeta.cover) {
      cover = scriptMeta.cover;
    } else {
      const img = document.querySelector('img[src*="tiktokcdn"]') || document.querySelector('img[class*="cover"]');
      if (img) cover = img.src;
    }

    const duration = (activeVideo && activeVideo.duration) ? Math.round(activeVideo.duration) : (scriptMeta?.duration || 0);

    const playUrl = (scriptMeta?.playUrl && !scriptMeta.playUrl.startsWith('blob:')) 
      ? scriptMeta.playUrl 
      : (videoStreamUrl && !videoStreamUrl.startsWith('blob:') ? videoStreamUrl : (scriptMeta?.playUrl || ''));

    // Extract ID from URL
    const idMatch = window.location.pathname.match(/\/(\d{15,25})/);
    const videoId = idMatch ? idMatch[1] : (scriptMeta?.id || Date.now().toString());

    return {
      success: true,
      id: videoId,
      title: scriptMeta?.title || title,
      author: scriptMeta?.author || author,
      authorId: scriptMeta?.authorId || author,
      avatar: scriptMeta?.avatar || '',
      cover: cover || scriptMeta?.cover || '',
      playUrl: playUrl,
      musicUrl: scriptMeta?.musicUrl || '',
      musicTitle: scriptMeta?.musicTitle || 'TikTok Audio',
      duration: duration,
      stats: {
        likes: likes || scriptMeta?.stats?.likes || 0,
        comments: comments || scriptMeta?.stats?.comments || 0
      },
      pageUrl: window.location.href,
      source: 'DOM_EXTRACT'
    };
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_VIDEO_DATA') {
      const data = extractCurrentPageVideoData();
      sendResponse(data);
      return true;
    }
  });

  // Extract TikTok video URL from current page or container
  function getTikTokUrlFromElement(container) {
    const link = container.querySelector('a[href*="/video/"]') || container.querySelector('a[href*="/shortdrama/episode/"]');
    if (link && link.href) return link.href;

    if (window.location.pathname.includes('/video/') || window.location.pathname.includes('/shortdrama/')) {
      return window.location.href.split('?')[0];
    }

    return window.location.href;
  }

  // Create and inject the floating download button bar onto a video card
  function attachDownloadBar(container) {
    if (container.getAttribute(PROCESSED_ATTR)) return;
    container.setAttribute(PROCESSED_ATTR, 'true');

    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    const bar = document.createElement('div');
    bar.className = 'bt-tiktok-downloader-overlay';

    bar.innerHTML = `
      <div class="bt-downloader-btn-group">
        <button class="bt-btn bt-btn-hd" title="ទាញយកវីដេអូ HD គ្មាន Watermark">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
          <span>HD Download</span>
        </button>
        <button class="bt-btn bt-btn-audio" title="ទាញយកសំឡេង MP3">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          <span>Audio MP3</span>
        </button>
        <button class="bt-btn bt-btn-dubber" title="បញ្ជូនទៅ BT Dubber Studio ដើម្បីបកប្រែជាភាសាខ្មែរ">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
          <span>BT Dubber</span>
        </button>
      </div>
      <div class="bt-downloader-status" style="display: none;"></div>
    `;

    const statusEl = bar.querySelector('.bt-downloader-status');
    const hdBtn = bar.querySelector('.bt-btn-hd');
    const audioBtn = bar.querySelector('.bt-btn-audio');
    const dubberBtn = bar.querySelector('.bt-btn-dubber');

    function showStatus(text, isError = false) {
      statusEl.textContent = text;
      statusEl.style.display = 'block';
      statusEl.style.color = isError ? '#ff4d4f' : '#00f2fe';
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 3500);
    }

    // HD Video Download
    hdBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const videoEl = container.querySelector('video') || document.querySelector('video');
      const directSrc = (videoEl && videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) ? videoEl.currentSrc : '';

      showStatus('កំពុងទាញយកទិន្នន័យ HD...');

      // If we have a direct web video stream on page, download it directly!
      if (directSrc) {
        showStatus('ចាប់ផ្តើម Download វីដេអូ...');
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_MEDIA',
          url: directSrc,
          title: document.title.replace(' | TikTok', '') || 'TikTok_Video',
          author: 'TikTok',
          isAudio: false
        }, (dlRes) => {
          if (dlRes && dlRes.success) {
            showStatus('Download បានជោគជ័យ!');
          } else {
            showStatus('បរាជ័យក្នុងការ Download', true);
          }
        });
        return;
      }

      // Otherwise fetch via background service
      const videoUrl = getTikTokUrlFromElement(container);
      chrome.runtime.sendMessage({ action: 'FETCH_TIKTOK_DATA', url: videoUrl }, (res) => {
        if (res && res.success && res.playUrl) {
          showStatus('ចាប់ផ្តើម Download វីដេអូ...');
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_MEDIA',
            url: res.playUrl,
            title: res.title,
            author: res.author,
            isAudio: false
          }, (dlRes) => {
            if (dlRes && dlRes.success) {
              showStatus('Download បានជោគជ័យ!');
            } else {
              showStatus('បរាជ័យក្នុងការ Download', true);
            }
          });
        } else {
          showStatus(res?.error || 'មិនអាចរកឃើញវីដេអូ HD ទេ', true);
        }
      });
    });

    // Audio MP3 Download
    audioBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const videoUrl = getTikTokUrlFromElement(container);
      showStatus('កំពុងទាញយកសំឡេង MP3...');

      chrome.runtime.sendMessage({ action: 'FETCH_TIKTOK_DATA', url: videoUrl }, (res) => {
        if (res && res.success && (res.musicUrl || res.playUrl)) {
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_MEDIA',
            url: res.musicUrl || res.playUrl,
            title: `${res.title || 'TikTok'}_Audio`,
            author: res.author,
            isAudio: true
          }, (dlRes) => {
            if (dlRes && dlRes.success) {
              showStatus('Download MP3 ជោគជ័យ!');
            } else {
              showStatus('បរាជ័យក្នុងការ Download MP3', true);
            }
          });
        } else {
          showStatus('មិនមានសំឡេង Audio ទេ', true);
        }
      });
    });

    // Send to BT Dubber Studio
    dubberBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const videoUrl = getTikTokUrlFromElement(container);
      chrome.runtime.sendMessage({
        action: 'OPEN_DUBBER_STUDIO',
        videoUrl: videoUrl
      });
    });

    container.appendChild(bar);
  }

  // Scan page and attach buttons to all video containers (feed, cards, watch page, shortdrama)
  function scanAndAttach() {
    const selectors = [
      '[data-e2e="feed-item"]',
      '[data-e2e="recommend-list-item-container"]',
      '[data-e2e="user-post-item"]',
      'div[class*="DivItemContainer"]',
      'div[class*="DivVideoWrapper"]',
      'div[class*="DivVideoFeed"]',
      'div.tiktok-web-player',
      'div[data-e2e="browse-video-container"]',
      'div[class*="DivVideoContainer"]',
      'div[class*="DramaPlayer"]',
      'div[class*="ShortdramaPlayer"]',
      'div[class*="EpisodePlayer"]',
      'div[class*="xgplayer"]'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));
    elements.forEach((el) => {
      const hasVideo = el.querySelector('video') || el.querySelector('a[href*="/video/"]') || el.querySelector('a[href*="/shortdrama/"]');
      if (hasVideo && !el.querySelector('.bt-tiktok-downloader-overlay')) {
        attachDownloadBar(el);
      }
    });

    // Standalone video elements
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      const parent = video.closest('div');
      if (parent && !parent.querySelector('.bt-tiktok-downloader-overlay') && !parent.getAttribute(PROCESSED_ATTR)) {
        attachDownloadBar(parent);
      }
    });
  }

  // Initial Scan
  setTimeout(scanAndAttach, 800);
  setTimeout(scanAndAttach, 2500);

  // MutationObserver for dynamic infinite feeds & single-page navigation
  const observer = new MutationObserver(() => {
    scanAndAttach();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();
