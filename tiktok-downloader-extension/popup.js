// Popup Logic for TikTok Downloader HD - BT Dubber

document.addEventListener('DOMContentLoaded', async () => {
  const currentVideoSection = document.getElementById('currentVideoSection');
  const cardHeaderTitle = document.getElementById('cardHeaderTitle');
  const activePulse = document.getElementById('activePulse');
  const sourceBadge = document.getElementById('sourceBadge');
  const videoThumb = document.getElementById('videoThumb');
  const videoDuration = document.getElementById('videoDuration');
  const videoTitle = document.getElementById('videoTitle');
  const videoAuthor = document.getElementById('videoAuthor');
  const statLikes = document.getElementById('statLikes');
  const statComments = document.getElementById('statComments');
  const btnDownloadHd = document.getElementById('btnDownloadHd');
  const btnDownloadAudio = document.getElementById('btnDownloadAudio');
  const btnSendDubber = document.getElementById('btnSendDubber');
  const inputUrl = document.getElementById('inputUrl');
  const btnFetchManual = document.getElementById('btnFetchManual');
  const statusBox = document.getElementById('statusBox');

  let currentVideoData = null;

  function showStatus(text, type = 'info') {
    statusBox.textContent = text;
    statusBox.className = `status-box ${type}`;
    statusBox.style.display = 'block';
  }

  function hideStatus() {
    statusBox.style.display = 'none';
  }

  function formatTime(sec) {
    if (!sec) return '00:00';
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateVideoUI(data) {
    currentVideoData = data;
    videoThumb.src = data.cover || 'icons/icon128.png';
    videoDuration.textContent = formatTime(data.duration);
    videoTitle.textContent = data.title || 'TikTok Video';
    videoAuthor.textContent = `@${data.authorId || data.author || 'creator'}`;
    statLikes.textContent = `❤️ ${(data.stats?.likes || 0).toLocaleString()}`;
    statComments.textContent = `💬 ${(data.stats?.comments || 0).toLocaleString()}`;

    btnDownloadHd.disabled = !data.playUrl;
    btnDownloadAudio.disabled = !(data.musicUrl || data.playUrl);
    btnSendDubber.disabled = false;

    if (data.source === 'DOM_EXTRACT') {
      sourceBadge.textContent = '🎯 Tab Stream';
      sourceBadge.style.color = '#10b981';
      sourceBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else if (data.source === 'TIKWM') {
      sourceBadge.textContent = '⚡ HD TikWM';
      sourceBadge.style.color = '#00f2fe';
    } else if (data.source === 'LOCAL_DUBBER') {
      sourceBadge.textContent = '🎬 Local Dubber';
      sourceBadge.style.color = '#f59e0b';
    }
  }

  async function loadVideoByUrl(url) {
    showStatus('កំពុងទាញយកព័ត៌មានវីដេអូ...', 'info');
    btnFetchManual.disabled = true;

    chrome.runtime.sendMessage({ action: 'FETCH_TIKTOK_DATA', url }, (res) => {
      btnFetchManual.disabled = false;
      if (res && res.success) {
        updateVideoUI(res);
        hideStatus();
      } else {
        showStatus(res?.error || 'មិនអាចទាញយកព័ត៌មានវីដេអូបានទេ។', 'error');
      }
    });
  }

  // 1. Detect Active Tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('tiktok.com')) {
      inputUrl.value = tab.url;
      cardHeaderTitle.textContent = 'វីដេអូនៅលើ Tab បច្ចុប្បន្ន';
      showStatus('កំពុងស្វែងរកវីដេអូលើ Tab...', 'info');

      // First attempt: Ask content.js directly for in-page video & metadata
      chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_VIDEO_DATA' }, (pageData) => {
        if (!chrome.runtime.lastError && pageData && pageData.success && (pageData.playUrl || pageData.title !== 'TikTok Video')) {
          updateVideoUI(pageData);
          hideStatus();
        } else {
          // Fallback: Use background service to fetch metadata via API
          loadVideoByUrl(tab.url);
        }
      });
    } else {
      cardHeaderTitle.textContent = 'សូមបញ្ចូល Link វីដេអូ';
      videoTitle.textContent = 'សូមបើកមើលវីដេអូលើ TikTok ឬ Paste Link ខាងក្រោម';
      videoAuthor.textContent = 'មិនទាន់មានវីដេអូ';
      videoThumb.src = 'icons/icon128.png';
      activePulse.style.display = 'none';
      btnDownloadHd.disabled = true;
      btnDownloadAudio.disabled = true;
      btnSendDubber.disabled = true;
    }
  } catch (err) {
    console.warn('[TikTok Downloader] Tab detection warning:', err);
  }

  // 2. Fetch Manual URL
  btnFetchManual.addEventListener('click', () => {
    const val = inputUrl.value.trim();
    if (!val) {
      showStatus('សូមបញ្ចូល Link TikTok ជាមុនសិន', 'error');
      return;
    }
    loadVideoByUrl(val);
  });

  inputUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnFetchManual.click();
    }
  });

  // 3. Download HD Video (No Watermark)
  btnDownloadHd.addEventListener('click', () => {
    if (!currentVideoData || !currentVideoData.playUrl) return;

    showStatus('កំពុងចាប់ផ្តើម Download វីដេអូ HD...', 'info');
    btnDownloadHd.disabled = true;

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MEDIA',
      url: currentVideoData.playUrl,
      title: currentVideoData.title,
      author: currentVideoData.author,
      isAudio: false
    }, (res) => {
      btnDownloadHd.disabled = false;
      if (res && res.success) {
        showStatus('Download បានជោគជ័យ!', 'success');
      } else {
        showStatus(res?.error || 'បរាជ័យក្នុងការ Download', 'error');
      }
    });
  });

  // 4. Download Audio MP3
  btnDownloadAudio.addEventListener('click', () => {
    const targetUrl = currentVideoData?.musicUrl || currentVideoData?.playUrl;
    if (!targetUrl) return;

    showStatus('កំពុងចាប់ផ្តើម Download សំឡេង MP3...', 'info');
    btnDownloadAudio.disabled = true;

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MEDIA',
      url: targetUrl,
      title: `${currentVideoData.title || 'TikTok'}_Audio`,
      author: currentVideoData.author,
      isAudio: true
    }, (res) => {
      btnDownloadAudio.disabled = false;
      if (res && res.success) {
        showStatus('Download Audio បានជោគជ័យ!', 'success');
      } else {
        showStatus(res?.error || 'បរាជ័យក្នុងការ Download សំឡេង', 'error');
      }
    });
  });

  // 5. Send to BT Dubber Studio
  btnSendDubber.addEventListener('click', () => {
    const url = inputUrl.value.trim() || currentVideoData?.pageUrl;
    chrome.runtime.sendMessage({
      action: 'OPEN_DUBBER_STUDIO',
      videoUrl: url
    });
  });

});
