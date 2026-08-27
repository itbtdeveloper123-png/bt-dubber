import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Search,
  Eye,
  ArrowRight,
  Tv,
  Clock,
  Sparkles,
  UserCheck,
  Video,
  ListVideo,
  ExternalLink,
  Film,
  Link as LinkIcon,
  Code
} from 'lucide-react';
import { getSafeMediaUrl } from '../utils/mediaUtils';

export interface TikTokEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  duration: number;
  views?: string;
  cover: string;
  videoUrl: string;
  playUrl?: string;
}

export interface TikTokSeries {
  id: string;
  title: string;
  titleKh?: string;
  subtitle?: string;
  cover: string;
  totalEpisodes: number;
  views: string;
  genre?: string;
  description?: string;
  episodes: TikTokEpisode[];
}

export interface TikTokChannelInfo {
  username: string;
  nickname: string;
  avatar: string;
  followers: string;
  following: string;
  likes: string;
  description: string;
}

interface TikTokImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEpisode: (episode: TikTokEpisode, channel: TikTokChannelInfo, seriesTitle?: string) => void;
}

export const TikTokImporterModal: React.FC<TikTokImporterModalProps> = ({
  isOpen,
  onClose,
  onSelectEpisode,
}) => {
  const [activeTab, setActiveTab] = useState<'series' | 'direct' | 'auth'>('series');
  const [tiktokUrl, setTiktokUrl] = useState('https://www.tiktok.com/@i0gfjdyh95/video/7659905632551603457?_r=1&_t=ZS-98wyv8AFZXZ');
  const [directVideoUrl, setDirectVideoUrl] = useState('');
  const [directEpisodeNum, setDirectEpisodeNum] = useState('1');
  const [directDramaTitle, setDirectDramaTitle] = useState('The Prince\'s Avenging Bride');
  const [isLoading, setIsLoading] = useState(false);
  const [channelInfo, setChannelInfo] = useState<TikTokChannelInfo | null>(null);
  const [seriesList, setSeriesList] = useState<TikTokSeries[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('series_prince_40');
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [searchEpisodeQuery, setSearchEpisodeQuery] = useState('');
  const [episodeRangeTab, setEpisodeRangeTab] = useState<'all' | '1-24' | '25-40'>('all');
  const [customEpisodeLink, setCustomEpisodeLink] = useState<{ epId: string; url: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Focused Video Preview Modal state
  const [previewingEpisode, setPreviewingEpisode] = useState<TikTokEpisode | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(true);

  // TikTok Cookies / Login State
  const [cookieInput, setCookieInput] = useState('');
  const [authStatus, setAuthStatus] = useState<{ isLoggedIn: boolean; cookieCount: number; hasSessionId: boolean }>({
    isLoggedIn: false,
    cookieCount: 0,
    hasSessionId: false,
  });
  const [isSavingCookies, setIsSavingCookies] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<string | null>(null);

  const fetchAuthStatus = async () => {
    try {
      const res = await fetch('/api/tiktok/auth-status');
      const data = await res.json();
      setAuthStatus(data);
    } catch (e) {
      console.warn('Auth status check notice:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuthStatus();
      if (!channelInfo) {
        handleFetchEpisodes();
      }
    }
  }, [isOpen]);

  const handleFetchEpisodes = async () => {
    if (!tiktokUrl.trim()) return;
    setErrorMessage(null);
    
    if (!tiktokUrl.includes('/video/') && tiktokUrl.includes('@')) {
      setErrorMessage('សូមបញ្ចូល Link វីដេអូជាក់លាក់ ឬបញ្ជី Link វីដេអូ។ ការដាក់ Link Profile មិនអាចទាញយកបានទេ។ សូមប្រើប្រាស់មុខងារ "Copy កូដទាញយក Link" ខាងក្រោមដើម្បីស្រង់ Link ទាំងអស់ពី Profile។');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/tiktok/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tiktokUrl.trim() }),
      });
      const data = await res.json();
      if (data.channel) {
        setChannelInfo(data.channel);
      }
      if (data.series && Array.isArray(data.series)) {
        setSeriesList(data.series);
        if (data.series.length > 0) {
          setSelectedSeriesId(data.series[0].id);
        }
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to fetch TikTok episodes:', err);
      setIsLoading(false);
    }
  };

  const currentSeries = seriesList.find((s) => s.id === selectedSeriesId) || seriesList[0];

  const copyExtractionScript = () => {
    const script = `let videoIds = new Set();
let visited = new WeakSet();
function searchObj(obj, depth) {
    if (depth > 15 || !obj || typeof obj !== 'object' || visited.has(obj)) return;
    visited.add(obj);
    if (Array.isArray(obj)) {
        obj.forEach(item => searchObj(item, depth + 1));
    } else {
        for (let key in obj) {
            try {
                let val = obj[key];
                if (typeof val === 'string' && /^[67]\\d{17,19}$/.test(val)) {
                    let k = key.toLowerCase();
                    if (k.includes('itemid') || k.includes('aweme') || k.includes('videoid') || k === 'id') {
                        videoIds.add(val);
                    }
                } else if (typeof val === 'object') {
                    searchObj(val, depth + 1);
                }
            } catch(e){}
        }
    }
}
document.querySelectorAll('*').forEach(el => {
    let keys = Object.keys(el).filter(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    keys.forEach(k => searchObj(el[k], 0));
});
document.querySelectorAll('a').forEach(a => {
    try {
        let m = a.href.match(/\\/video\\/(\\d{18,20})/);
        if(m) videoIds.add(m[1]);
    }catch(e){}
});
let uniqueIds = Array.from(videoIds).slice(0, 200);
if(uniqueIds.length > 0) {
    let links = uniqueIds.map(id => 'https://www.tiktok.com/@tiktok/video/' + id);
    let tempInput = document.createElement('textarea');
    tempInput.value = links.join('\\n');
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    alert('✅ បាន Copy Link ចំនួន ' + links.length + ' រួចរាល់!\\n\\nសូម Paste ចូលប្រអប់ Bulk Import។ បើនៅខ្វះភាគ សូមចុចលើ Tab ផ្សេងៗ (ឧ. 25-40) រួចដំណើរការកូដនេះម្តងទៀត។');
} else {
    alert('❌ រកមិនឃើញ Link ទេ! សូមប្រាកដថាអ្នកកំពុងបើកមើលវីដេអូ ឬបញ្ជីរឿង (Playlist) រួចសឹមដំណើរការកូដនេះ។');
}`;
    navigator.clipboard.writeText(script);
    alert('✅ កូដត្រូវបាន Copy!\n\nរបៀបប្រើ៖\n១. បើកទំព័រ TikTok របស់រឿងនោះ\n២. ចុច F12 (ឬ Right-Click > Inspect) យកពាក្យ Console\n៣. Paste កូដនេះចូល រួចចុច Enter!');
  };

  const handleInsertEpisode = (ep: TikTokEpisode, seriesTitle?: string) => {
    if (!channelInfo) return;
    setInsertingId(ep.id);
    onSelectEpisode(ep, channelInfo, seriesTitle || currentSeries?.title);
    onClose();
  };

  const handleInsertDirectVideo = () => {
    if (!directVideoUrl.trim()) return;
    const epNum = parseInt(directEpisodeNum) || 1;
    const dummyChannel: TikTokChannelInfo = channelInfo || {
      username: 'i0gfjdyh95',
      nickname: 'damao_ShortDrama',
      avatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80',
      followers: '298.7K',
      following: '0',
      likes: '3.9M',
      description: 'TikTok Drama Video'
    };

    const directEp: TikTokEpisode = {
      id: `direct_ep_${Date.now()}`,
      episodeNumber: epNum,
      title: `${directDramaTitle} - ភាគ ${epNum}`,
      duration: 90,
      cover: dummyChannel.avatar,
      videoUrl: directVideoUrl.trim(),
      playUrl: directVideoUrl.trim()
    };

    onSelectEpisode(directEp, dummyChannel, directDramaTitle);
    onClose();
  };

  const handleSaveCookies = async () => {
    if (!cookieInput.trim()) return;
    try {
      setIsSavingCookies(true);
      setCookieMsg(null);
      const res = await fetch('/api/tiktok/save-cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieInput.trim() }),
      });
      const data = await res.json();
      setIsSavingCookies(false);
      if (data.success) {
        setCookieMsg('✅ បានរក្សាទុក TikTok Cookies ដោយជោគជ័យ!');
        fetchAuthStatus();
        setCookieInput('');
      } else {
        setCookieMsg('⚠️ បរាជ័យក្នុងការរក្សាទុក: ' + (data.error || 'Invalid cookies'));
      }
    } catch (err: any) {
      setIsSavingCookies(false);
      setCookieMsg('⚠️ Error: ' + err.message);
    }
  };

  const handleClearCookies = async () => {
    try {
      await fetch('/api/tiktok/clear-cookies', { method: 'POST' });
      setAuthStatus({ isLoggedIn: false, cookieCount: 0, hasSessionId: false });
      setCookieMsg('🗑️ បានផ្តាច់ការភ្ជាប់ TikTok Cookies រួចរាល់');
    } catch (e) {}
  };

  if (!isOpen) return null;

  // Filter episodes for current series
  const allCurrentEpisodes = currentSeries?.episodes || [];
  const filteredEpisodes = allCurrentEpisodes.filter((ep) => {
    // Range tab filter
    if (episodeRangeTab === '1-24' && ep.episodeNumber > 24) return false;
    if (episodeRangeTab === '25-40' && ep.episodeNumber <= 24) return false;

    // Search query filter
    if (!searchEpisodeQuery.trim()) return true;
    const query = searchEpisodeQuery.toLowerCase().trim();
    return (
      ep.title.toLowerCase().includes(query) ||
      ep.episodeNumber.toString() === query ||
      `ep.${ep.episodeNumber}`.toLowerCase().includes(query) ||
      `ភាគ ${ep.episodeNumber}`.includes(query)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
      
      {/* Main Clean Modal Container */}
      <div className="relative w-full max-w-6xl max-h-[92vh] bg-[#0C1017] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* 1. Header Navigation Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#080B11] shrink-0">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FE2C55] via-[#25F4EE] to-[#FE2C55] p-[2px] shadow-lg shadow-rose-500/20 shrink-0">
              <div className="w-full h-full bg-black rounded-[10px] flex items-center justify-center">
                <Tv className="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2 font-khmer">
                ទាញយកភាគរឿងខ្លីពី TikTok
                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  ទាញយកវីដេអូពិត
                </span>
              </h2>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('series')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-khmer transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'series'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span>📺 បញ្ជីភាគរឿង</span>
            </button>

            <button
              onClick={() => setActiveTab('direct')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-khmer transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'direct'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>🔗 ដាក់ Link ផ្ទាល់</span>
            </button>

            <button
              onClick={() => setActiveTab('auth')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-khmer transition cursor-pointer flex items-center gap-1.5 border ${
                activeTab === 'auth'
                  ? 'bg-amber-600 text-white border-amber-400'
                  : authStatus.isLoggedIn
                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/60'
                  : 'bg-slate-900 text-amber-300 border-amber-500/40'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>
                {authStatus.isLoggedIn ? '✅ គណនី TikTok (ភ្ជាប់រួច)' : '🔑 ភ្ជាប់ Cookies'}
              </span>
            </button>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Tab 1: Series Mode Search & Filter Bar */}
        {activeTab === 'series' && (
          <div className="px-5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-col items-start gap-3 shrink-0">
            <div className="flex items-center justify-between w-full">
              <p className="text-[11px] text-slate-400 font-khmer flex items-center gap-1.5">
                💡 <span className="text-amber-400 font-bold">ថ្មី (Bulk Import):</span> បងអាច Paste Link វីដេអូច្រើនបញ្ចូលគ្នាម្តង (១០០+ ក៏បាន) ដោយដកឃ្លា ឬតម្រៀបគ្នា!
              </p>
              <button
                onClick={copyExtractionScript}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 transition cursor-pointer flex items-center gap-1"
                title="ចុចយកកូដសម្រាប់ទៅស្រង់ Link ពី TikTok ដោយស្វ័យប្រវត្តិ"
              >
                <Code className="w-3 h-3" />
                Copy កូដទាញយក Link
              </button>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3 w-full">
              {/* URL Textarea */}
              <div className="relative flex-1 w-full">
                <textarea
                  rows={3}
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="Paste Link វីដេអូ TikTok ទាំងអស់នៅទីនេះ... (ឧ. https://www.tiktok.com/@i0gfjdyh95/video/765... https://...)"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono resize-y min-h-[60px]"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>

              <button
                onClick={handleFetchEpisodes}
                disabled={isLoading || !tiktokUrl.trim()}
                className="w-full sm:w-auto h-[60px] px-5 bg-gradient-to-r from-[#FE2C55] to-rose-600 hover:from-rose-500 hover:to-rose-600 disabled:opacity-50 text-white font-khmer font-bold text-sm rounded-xl shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition shrink-0 cursor-pointer active:scale-95"
              >
              {isLoading ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>កំពុងទាញយក...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ទាញយករឿង</span>
                </>
              )}
            </button>
            </div>
          </div>
        )}

        {/* Error Message Display */}
        {activeTab === 'series' && errorMessage && (
          <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs font-khmer flex items-center gap-2">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Tab 2: Direct Video Link Tab */}
        {activeTab === 'direct' && (
          <div className="p-6 bg-slate-950/80 border-b border-slate-800 space-y-3 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-300 font-khmer mb-1">
                  🔗 Link វីដេអូ TikTok / Douyin / MP4 Video URL:
                </label>
                <input
                  type="text"
                  value={directVideoUrl}
                  onChange={(e) => setDirectVideoUrl(e.target.value)}
                  placeholder="Paste TikTok video link (ឧ. https://vt.tiktok.com/... ឬ video URL)"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 font-khmer mb-1">
                  🎬 ឈ្មោះរឿង (Drama Title):
                </label>
                <input
                  type="text"
                  value={directDramaTitle}
                  onChange={(e) => setDirectDramaTitle(e.target.value)}
                  placeholder="ឧ. The Prince's Avenging Bride"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-khmer"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-300 font-khmer">ភាគទី (Episode #):</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={directEpisodeNum}
                  onChange={(e) => setDirectEpisodeNum(e.target.value)}
                  className="w-20 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-center text-rose-400 focus:outline-none focus:border-rose-500"
                />
              </div>

              <button
                onClick={handleInsertDirectVideo}
                disabled={!directVideoUrl.trim()}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold font-khmer flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>⚡ បញ្ចូលទៅ Dubbing Studio ភ្លាមៗ</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Cookies Manager */}
        {activeTab === 'auth' && (
          <div className="p-5 bg-slate-950/80 border-b border-slate-800 space-y-3 shrink-0">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${authStatus.isLoggedIn ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2 font-khmer">
                    ស្ថានភាពគណនី TikTok:
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${authStatus.isLoggedIn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                      {authStatus.isLoggedIn ? '✅ បានភ្ជាប់ Session រួចរាល់ (Connected)' : '⚠️ មិនទាន់ភ្ជាប់ (Guest Mode)'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 font-khmer mt-0.5">
                    {authStatus.isLoggedIn
                      ? `បានផ្ទុក ${authStatus.cookieCount} Cookies (${authStatus.hasSessionId ? 'មាន sessionid' : 'Standard Cookies'}) សម្រាប់ទាញយកវីដេអូ HD No-Watermark គ្មានដែនកំណត់`
                      : 'ភ្ជាប់ Cookie ឬ SessionID ដើម្បីឱ្យប្រព័ន្ធអាចទាញយកគ្រប់រឿងភាគពី TikTok បានទាំងអស់ដោយគ្មានការ Block'}
                  </p>
                </div>
              </div>

              {authStatus.isLoggedIn && (
                <button
                  onClick={handleClearCookies}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold font-khmer transition shrink-0 cursor-pointer"
                >
                  🗑️ ផ្តាច់ការភ្ជាប់ (Clear)
                </button>
              )}
            </div>

            {cookieMsg && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-khmer text-slate-200">
                {cookieMsg}
              </div>
            )}

            <div className="space-y-2">
              <textarea
                rows={3}
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                placeholder="Paste TikTok Cookie String (sessionid=...)..."
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-khmer">
                  💡 ព័ត៌មាន Cookies ត្រូវបានរក្សាទុកក្នុងកុំព្យូទ័ររបស់អ្នកដោយសុវត្ថិភាព
                </span>

                <button
                  onClick={handleSaveCookies}
                  disabled={isSavingCookies || !cookieInput.trim()}
                  className="px-5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold font-khmer flex items-center gap-1 shadow-md shadow-orange-600/20 active:scale-95 transition cursor-pointer"
                >
                  {isSavingCookies ? 'កំពុងរក្សាទុក...' : '💾 រក្សាទុក & ភ្ជាប់គណនី'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Main Content Stage: Scrollable Drama Episodes Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Drama Title & Pagination Control Bar */}
          {currentSeries && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              
              {/* Left: Poster + Title + Views */}
              <div className="flex items-center gap-3.5 min-w-0">
                <img
                  src={currentSeries.cover}
                  alt={currentSeries.title}
                  className="w-14 h-18 rounded-xl object-cover border border-slate-700 shadow-md shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-white">
                      {currentSeries.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white">
                      {currentSeries.totalEpisodes} ភាគ
                    </span>
                  </div>
                  {currentSeries.subtitle && (
                    <p className="text-xs text-rose-400 font-khmer font-bold">{currentSeries.subtitle}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 font-khmer">
                    <span className="flex items-center gap-1 text-slate-300 font-mono">
                      <Eye className="w-3.5 h-3.5 text-rose-400" />
                      ▷ {currentSeries.views} ទស្សនា
                    </span>
                    <span>•</span>
                    <span className="text-slate-300">{currentSeries.genre || 'Romance / Royal Court'}</span>
                  </div>
                </div>
              </div>

              {/* Right: Pagination Filter Tabs (All, 1-24, 25-40) + Search */}
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    onClick={() => setEpisodeRangeTab('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold font-khmer transition cursor-pointer ${
                      episodeRangeTab === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ទាំងអស់
                  </button>
                  <button
                    onClick={() => setEpisodeRangeTab('1-24')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                      episodeRangeTab === '1-24' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    1-24
                  </button>
                  <button
                    onClick={() => setEpisodeRangeTab('25-40')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                      episodeRangeTab === '25-40' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    25-40
                  </button>
                </div>

                <div className="relative flex-1 md:w-44">
                  <input
                    type="text"
                    value={searchEpisodeQuery}
                    onChange={(e) => setSearchEpisodeQuery(e.target.value)}
                    placeholder="ស្វែងរកភាគ..."
                    className="w-full pl-8 pr-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-khmer"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                </div>
              </div>

            </div>
          )}

          {/* Clean Responsive Episode Cards Grid (2 to 6 columns, Scrollable naturally) */}
          {filteredEpisodes.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pb-6">
              {filteredEpisodes.map((ep) => {
                const isInserting = insertingId === ep.id;

                return (
                  <div
                    key={ep.id}
                    className="group relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-rose-500/80 transition-all duration-200 shadow-lg flex flex-col justify-between aspect-[9/13] hover:shadow-rose-500/15 hover:-translate-y-0.5"
                  >
                    {/* Background Vertical Poster */}
                    <img
                      src={ep.cover || currentSeries?.cover}
                      alt={ep.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/70 pointer-events-none" />

                    {/* Top Episode Number Badge & Quick Preview Play Button */}
                    <div className="relative z-10 p-2.5 flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-black/85 text-white border border-white/20 tracking-wider shadow">
                        EP.{ep.episodeNumber}
                      </span>

                      {/* Click to Preview Video Button */}
                      <button
                        onClick={() => {
                          setPreviewingEpisode(ep);
                          setIsPlayingPreview(true);
                        }}
                        className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-md transition cursor-pointer hover:scale-110 active:scale-95"
                        title="ចុចមើលវីដេអូសាកល្បង (Play Preview)"
                      >
                        <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                      </button>
                    </div>

                    {/* Bottom Info & 1-Click Insert Button */}
                    <div className="relative z-10 p-2 sm:p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                        <span>▷ {ep.views}</span>
                        <span className="flex items-center gap-0.5 text-slate-400">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {Math.floor(ep.duration / 60)}:{(ep.duration % 60).toString().padStart(2, '0')}
                        </span>
                      </div>

                      {customEpisodeLink?.epId === ep.id ? (
                        <div className="space-y-1 animate-fadeIn">
                          <input
                            type="text"
                            placeholder="Paste Link ភាគនេះ..."
                            value={customEpisodeLink.url}
                            onChange={(e) => setCustomEpisodeLink({ epId: ep.id, url: e.target.value })}
                            className="w-full px-2 py-1 text-[11px] bg-slate-950 border border-rose-500 rounded-lg text-slate-200 focus:outline-none font-mono"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                handleInsertEpisode({
                                  ...ep,
                                  videoUrl: customEpisodeLink.url.trim() || ep.videoUrl
                                }, currentSeries?.title);
                                setCustomEpisodeLink(null);
                              }}
                              className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold font-khmer cursor-pointer"
                            >
                              ✓ ដាក់
                            </button>
                            <button
                              onClick={() => setCustomEpisodeLink(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-400 rounded-lg text-[11px] cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleInsertEpisode(ep, currentSeries?.title)}
                            disabled={isInserting}
                            className="flex-1 py-1.5 px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold font-khmer flex items-center justify-center gap-1 shadow-md shadow-emerald-600/30 active:scale-95 transition cursor-pointer"
                          >
                            {isInserting ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>ដាក់...</span>
                              </>
                            ) : (
                              <>
                                <ArrowRight className="w-3.5 h-3.5" />
                                <span>បញ្ចូល Studio</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => setCustomEpisodeLink({ epId: ep.id, url: '' })}
                            title="ដាក់ Link វីដេអូភាគនេះផ្ទាល់"
                            className="p-1.5 bg-slate-800/90 hover:bg-rose-500/30 hover:text-rose-400 text-slate-400 rounded-lg text-xs transition shrink-0 cursor-pointer"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
              <Film className="w-10 h-10 text-slate-600" />
              <p className="text-xs font-medium text-slate-300 font-khmer">
                រកមិនឃើញភាគរឿងដែលត្រូវនឹង "{searchEpisodeQuery}" ទេ
              </p>
            </div>
          )}

        </div>

        {/* 3. Modal Bottom Footer */}
        <div className="px-5 py-2.5 border-t border-slate-800 bg-[#080B11] flex items-center justify-between text-xs text-slate-400 font-khmer shrink-0">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            បង្ហាញវីដេអូពិតប្រាកដ — ចុចរូប Play លើភាគណាមួយដើម្បីមើល Preview ឬចុច "បញ្ចូល Studio"!
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            បិទ
          </button>
        </div>

      </div>

      {/* 4. Focused Clean Video Preview Modal */}
      {previewingEpisode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/90 backdrop-blur-xl animate-fadeIn">
          <div className="relative w-full max-w-md bg-[#0C1017] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scaleUp">
            
            {/* Preview Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#080B11]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2.5 py-0.5 rounded-lg bg-rose-600 text-white text-xs font-black shrink-0">
                  EP.{previewingEpisode.episodeNumber}
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-white truncate font-khmer">
                  {previewingEpisode.title}
                </h4>
              </div>
              <button
                onClick={() => setPreviewingEpisode(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player Box: Real HTML5 Video Player */}
            <div className="relative w-full aspect-[9/13] max-h-[55vh] bg-black flex items-center justify-center overflow-hidden">
              <video
                src={getSafeMediaUrl(previewingEpisode.playUrl || (previewingEpisode.videoUrl.endsWith('.mp4') ? previewingEpisode.videoUrl : undefined))}
                poster={previewingEpisode.cover || currentSeries?.cover}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />

              {/* In case video URL is a web page, show poster with direct TikTok link */}
              {(!previewingEpisode.playUrl && !previewingEpisode.videoUrl.endsWith('.mp4')) && (
                <div className="absolute inset-0 flex flex-col items-center justify-between p-4 bg-gradient-to-t from-black/90 via-black/30 to-black/70 pointer-events-auto">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-slate-300 font-mono">▷ {previewingEpisode.views} views</span>
                    <a
                      href={previewingEpisode.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-black/70 hover:bg-rose-600 text-white rounded-lg text-xs font-bold font-khmer flex items-center gap-1 border border-white/20 transition shadow"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>បើកមើលលើ TikTok</span>
                    </a>
                  </div>

                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-full bg-rose-600/90 text-white flex items-center justify-center mx-auto shadow-2xl ring-4 ring-rose-500/30">
                      <Play className="w-7 h-7 fill-white ml-0.5" />
                    </div>
                    <p className="text-xs text-slate-200 font-khmer font-medium">
                      ភាគទី {previewingEpisode.episodeNumber} នៃរឿង {currentSeries?.title}
                    </p>
                  </div>

                  <div className="w-full text-center">
                    <span className="text-[11px] text-slate-400 font-khmer">
                      ចុច "បញ្ចូលទៅ Studio" ខាងក្រោមដើម្បីដំណើរការ Dubbing
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Actions Footer */}
            <div className="p-3.5 border-t border-slate-800 bg-[#080B11] flex items-center justify-between gap-2">
              <button
                onClick={() => setPreviewingEpisode(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold font-khmer cursor-pointer"
              >
                បិទ
              </button>

              <button
                onClick={() => {
                  handleInsertEpisode(previewingEpisode, currentSeries?.title);
                  setPreviewingEpisode(null);
                }}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs sm:text-sm font-bold font-khmer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 active:scale-95 transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>⚡ បញ្ចូលភាគទី {previewingEpisode.episodeNumber} ទៅ Studio</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
