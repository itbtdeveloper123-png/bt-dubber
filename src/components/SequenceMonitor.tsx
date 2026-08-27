import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw, 
  Sparkles, Layers, Ratio, Film, CheckCircle2, ChevronRight, ChevronLeft, Mic, Music, UserCheck, ShieldCheck
} from 'lucide-react';
import { EpisodeClip, RecapSegment, AntiCopyrightConfig, WatermarkConfig, SubtitleStyleConfig } from '../types';
import { getSafeMediaUrl } from '../utils/mediaUtils';
import { AnimatedKaraokeOverlay } from './AnimatedKaraokeOverlay';
import { 
  formatTimecode, 
  parseTimecode,
  getClipEffectiveDuration, 
  getTotalSequenceDuration, 
  mapGlobalTimeToClip,
  findActiveSubtitle
} from '../utils/sequenceUtils';

interface SequenceMonitorProps {
  clips: EpisodeClip[];
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  globalCurrentTime: number;
  onSeekGlobalTime: (time: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  aspectRatio: '16:9' | '9:16' | '1:1';
  onChangeAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  globalVoicePersona?: string;
  onChangeGlobalVoicePersona?: (persona: string) => void;
  ttsSpeed?: number;
  onChangeTtsSpeed?: (speed: number) => void;
  watermark?: WatermarkConfig;
  subtitleConfig?: SubtitleStyleConfig;
}

const cleanKhmerSpeech = (text: string): string => {
  if (!text) return '';
  const cleaned = text
    .replace(/Orig\s*:\s*["'].*?["']/gi, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/^(តួប្រុស|តួស្រី|អ្នកសម្រាយ|អ្នកសម្រាយរឿង|តាចាស់|យាយចាស់|កុមារ|កូនក្មេង|មេក្រុម|មេបញ្ជាការ|Marcus|Elena|[^\s:៖]{2,15})\s*[:៖-]\s*/gi, '')
    .replace(/\bMarcus\b/gi, 'ម៉ាកុស')
    .replace(/\bElena\b/gi, 'អេលេណា')
    .replace(/\bSWAT\b/gi, 'ស្វាត')
    .replace(/\bCyber\b/gi, 'សាយប័រ')
    .replace(/\bVault\b/gi, 'វ៉ូល')
    .replace(/\bPolice\b/gi, 'ប៉ូលីស')
    .replace(/\bHeist\b/gi, 'ហាយស៍')
    .replace(/\bFlash\b/gi, 'ហ្វ្លាស')
    .replace(/\bLaser\b/gi, 'ឡាស៊ែរ')
    .replace(/\bHackers?\b/gi, 'ហេកឃ័រ')
    .replace(/\bTeam\b/gi, 'ក្រុម')
    .replace(/\bMonaco\b/gi, 'ម៉ូណាកូ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[a-zA-Z\u4e00-\u9fa5]+/g, ' ')
    // Allow all Khmer letters, sub-scripts, vowels, punctuation, quotes, numbers
    .replace(/[^\u1780-\u17FF\u19E0-\u19FF0-9\s.,!?«»""''()\-—៖។ៗ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text.trim();
};

export const SequenceMonitor: React.FC<SequenceMonitorProps> = ({
  clips,
  selectedClipId,
  onSelectClip,
  globalCurrentTime,
  onSeekGlobalTime,
  isPlaying,
  onTogglePlay,
  aspectRatio,
  onChangeAspectRatio,
  globalVoicePersona = 'auto',
  onChangeGlobalVoicePersona,
  ttsSpeed = 1.25,
  onChangeTtsSpeed,
  watermark,
  subtitleConfig
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [activeSubtitle, setActiveSubtitle] = useState<RecapSegment | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpokenSubIdRef = useRef<string | null>(null);

  const totalDuration = useMemo(() => getTotalSequenceDuration(clips), [clips]);

  // Current active clip determined by global time
  const currentPos = useMemo(() => {
    return mapGlobalTimeToClip(clips, globalCurrentTime);
  }, [clips, globalCurrentTime]);

  const activeClip = currentPos?.clip;

  const ttsAudioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Initialize audio elements
  useEffect(() => {
    if (!bgmAudioRef.current) {
      bgmAudioRef.current = new Audio();
      bgmAudioRef.current.loop = true;
      bgmAudioRef.current.preload = 'auto';
    }
    if (!ttsAudioRef.current) {
      ttsAudioRef.current = new Audio();
      ttsAudioRef.current.preload = 'auto';
    }
  }, []);

  // Proactive Audio Pre-Caching for Sequence Clips
  useEffect(() => {
    if (!clips || clips.length === 0) return;

    clips.forEach((clip) => {
      if (!clip.segments) return;
      clip.segments.forEach((seg) => {
        const cleanText = cleanKhmerSpeech(seg.khmer_script);
        if (!cleanText) return;

        const effectiveGender = (
          globalVoicePersona !== 'auto'
            ? globalVoicePersona
            : (seg.speaker_gender || 'female')
        ).toLowerCase();

        const cacheKey = `${effectiveGender}_${cleanText}`;
        if (!ttsAudioCacheRef.current.has(cacheKey)) {
          let edgeRate = '+25%';
          if (ttsSpeed >= 1.45) edgeRate = '+45%';
          else if (ttsSpeed >= 1.30) edgeRate = '+36%';
          else if (ttsSpeed >= 1.20) edgeRate = '+30%';
          else if (ttsSpeed >= 1.10) edgeRate = '+25%';
          else if (ttsSpeed <= 0.95) edgeRate = '+12%';

          const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}`;
          const audio = new Audio();
          audio.src = ttsUrl;
          audio.preload = 'auto';
          ttsAudioCacheRef.current.set(cacheKey, audio);
        }
      });
    });
  }, [clips, globalVoicePersona, ttsSpeed]);

  // Full-Sentence Speech Dubbing Engine with 0ms Latency & Visual Duration Alignment
  const speakSequenceScript = (text: string, speakerGender?: string, onEnd?: () => void, targetDurationSec?: number) => {
    const cleanText = cleanKhmerSpeech(text);
    if (!cleanText) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (onEnd) onEnd();
      return;
    }

    isSpeakingRef.current = true;
    setIsSpeaking(true);

    // Determine effective gender / voice identical to Dubbing Studio
    const effectiveGender = (
      globalVoicePersona !== 'auto'
        ? globalVoicePersona
        : (speakerGender || 'female')
    ).toLowerCase();

    // Convert speed to Microsoft Edge Neural speech rate
    let edgeRate = '+25%';
    if (ttsSpeed >= 1.45) edgeRate = '+45%';
    else if (ttsSpeed >= 1.30) edgeRate = '+36%';
    else if (ttsSpeed >= 1.20) edgeRate = '+30%';
    else if (ttsSpeed >= 1.10) edgeRate = '+25%';
    else if (ttsSpeed <= 0.95) edgeRate = '+12%';

    const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}`;
    const cacheKey = `${effectiveGender}_${cleanText}`;

    let tts: HTMLAudioElement;
    if (ttsAudioCacheRef.current.has(cacheKey)) {
      tts = ttsAudioCacheRef.current.get(cacheKey)!;
      try {
        tts.currentTime = 0;
      } catch (e) {}
    } else {
      if (!ttsAudioRef.current) {
        ttsAudioRef.current = new Audio();
      }
      tts = ttsAudioRef.current;
      tts.src = ttsUrl;
      ttsAudioCacheRef.current.set(cacheKey, tts);
    }
    ttsAudioRef.current = tts;

    // Dynamic Duration Fitting to keep voice locked to character action
    const applyDynamicSpeed = () => {
      if (targetDurationSec && targetDurationSec > 0 && tts.duration && !isNaN(tts.duration)) {
        const requiredSpeed = tts.duration / targetDurationSec;
        tts.playbackRate = Math.min(1.40, Math.max(0.95, requiredSpeed));
      } else {
        tts.playbackRate = 1.0;
      }
    };

    if (tts.readyState >= 1) {
      applyDynamicSpeed();
    } else {
      tts.onloadedmetadata = applyDynamicSpeed;
    }

    tts.volume = isMuted ? 0 : volume;

    tts.onended = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };

    tts.onerror = (e) => {
      console.warn('TTS playback notice:', e);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };

    const playPromise = tts.play();
    if (playPromise !== undefined) {
      playPromise.catch((err: any) => {
        if (err?.name === 'AbortError') return;
        console.warn('TTS sequence play rejected:', err);
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      });
    }
  };

  // 1. Sync Video Element src and currentTime when global position changes
  useEffect(() => {
    if (!videoRef.current || !activeClip) return;

    const safeUrl = getSafeMediaUrl(activeClip.videoUrl);
    if (videoRef.current.src !== safeUrl && !videoRef.current.src.endsWith(safeUrl)) {
      videoRef.current.src = safeUrl;
      videoRef.current.playbackRate = activeClip.speed || 1;
      videoRef.current.currentTime = currentPos.clipRawTime;
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    } else {
      // Small drift check (> 0.3s) before forcing seek
      if (Math.abs(videoRef.current.currentTime - currentPos.clipRawTime) > 0.3) {
        videoRef.current.currentTime = currentPos.clipRawTime;
      }
      videoRef.current.playbackRate = activeClip.speed || 1;
      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else if (!isPlaying && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }

    // When activeClip has isolated BGM or sequence is playing, ALWAYS mute raw video audio so foreign speech NEVER leaks!
    if (activeClip.bgmTrackUrl) {
      videoRef.current.muted = true;
    } else {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = isSpeaking ? volume * 0.15 : volume * (activeClip.volume || 1);
    }

    // Find active subtitle
    const sub = findActiveSubtitle(activeClip.segments, currentPos.clipRawTime);
    setActiveSubtitle(sub);
  }, [currentPos?.clipIndex, currentPos?.clipRawTime, isPlaying, activeClip?.videoUrl, activeClip?.speed, activeClip?.bgmTrackUrl, isMuted, volume, isSpeaking]);

  // 2. Synchronize Isolated BGM Audio Player
  useEffect(() => {
    const bgm = bgmAudioRef.current;
    if (!bgm) return;

    const bgmUrl = activeClip?.bgmTrackUrl || '';
    if (bgmUrl) {
      if (bgm.src !== bgmUrl && !bgm.src.endsWith(bgmUrl)) {
        bgm.src = bgmUrl;
        bgm.load();
      }
      bgm.currentTime = currentPos?.clipRawTime || 0;
      bgm.playbackRate = activeClip?.speed || 1;
      bgm.muted = isMuted;
      bgm.volume = isSpeaking ? volume * 0.45 : volume * 1.0;

      if (isPlaying) {
        bgm.play().catch(() => {});
      } else {
        bgm.pause();
      }
    } else {
      bgm.pause();
      bgm.src = '';
    }
  }, [activeClip?.bgmTrackUrl, currentPos?.clipIndex, isPlaying, isMuted, volume, isSpeaking]);

  // Handle Play/Pause toggle
  useEffect(() => {
    if (!isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      if (bgmAudioRef.current) bgmAudioRef.current.pause();
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.currentTime = 0;
        } catch (e) {}
      }
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      lastSpokenSubIdRef.current = null;
    }
  }, [isPlaying]);

  // Time update event from video element to advance global timeline and trigger full Khmer dubbing speech
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !activeClip || !currentPos || !isPlaying) return;

    const rawTime = videoRef.current.currentTime;
    const clipStartRaw = activeClip.trimStart || 0;
    const clipEndRaw = (activeClip.duration || 10) - (activeClip.trimEnd || 0);

    // Calculate elapsed time within current clip
    const localElapsed = Math.max(0, rawTime - clipStartRaw) / (activeClip.speed || 1);

    // Calculate global start of current clip
    let clipGlobalStart = 0;
    for (let i = 0; i < currentPos.clipIndex; i++) {
      clipGlobalStart += getClipEffectiveDuration(clips[i]);
    }

    const newGlobalTime = clipGlobalStart + localElapsed;

    // ATOMIC SENTENCE COMPLETION LOCK: Never interrupt an actively speaking sentence!
    if (!isSpeakingRef.current) {
      const currentSub = findActiveSubtitle(activeClip.segments, rawTime);
      if (currentSub) {
        setActiveSubtitle(currentSub);
        const subKey = `${activeClip.id}_${currentSub.segment_id}`;
        if (
          subKey !== lastSpokenSubIdRef.current &&
          !videoRef.current.paused
        ) {
          lastSpokenSubIdRef.current = subKey;
          const targetSec = Math.max(0.5, parseTimecode(currentSub.end_time) - parseTimecode(currentSub.start_time));
          speakSequenceScript(currentSub.khmer_script, currentSub.speaker_gender, () => {
            triggerNextSequenceDueSubtitle();
          }, targetSec);
        }
      } else {
        setActiveSubtitle(null);
      }
    }

    // Check if reached end of current clip -> only transition when narration has finished speaking!
    if (rawTime >= clipEndRaw - 0.05) {
      if (isSpeakingRef.current) {
        // Hold on current frame until speech completes so sentence is NEVER cut off!
        videoRef.current.pause();
        return;
      }

      if (currentPos.clipIndex < clips.length - 1) {
        // Advance to next clip
        const nextClip = clips[currentPos.clipIndex + 1];
        onSelectClip(nextClip.id);
        const nextClipGlobalStart = clipGlobalStart + getClipEffectiveDuration(activeClip);
        onSeekGlobalTime(nextClipGlobalStart);
      } else {
        // Finished entire series sequence
        onSeekGlobalTime(totalDuration);
        if (isPlaying) onTogglePlay();
      }
    } else {
      onSeekGlobalTime(newGlobalTime);
    }
  };

  const triggerNextSequenceDueSubtitle = () => {
    const vid = videoRef.current;
    if (!vid || !isPlaying || !activeClip) return;
    const rawT = vid.currentTime;
    const nextSub = findActiveSubtitle(activeClip.segments, rawT);
    if (nextSub) {
      const subKey = `${activeClip.id}_${nextSub.segment_id}`;
      if (subKey !== lastSpokenSubIdRef.current) {
        setActiveSubtitle(nextSub);
        lastSpokenSubIdRef.current = subKey;
        const targetSec = Math.max(0.5, parseTimecode(nextSub.end_time) - parseTimecode(nextSub.start_time));
        speakSequenceScript(nextSub.khmer_script, nextSub.speaker_gender, () => {
          triggerNextSequenceDueSubtitle();
        }, targetSec);
      }
    }
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16] max-h-[70vh] w-auto mx-auto';
      case '1:1':
        return 'aspect-square max-h-[70vh] w-auto mx-auto';
      case '16:9':
      default:
        return 'aspect-video w-full';
    }
  };

  return (
    <div 
      ref={containerRef}
      className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative select-none"
    >
      {/* Top Monitor Bar: Voice Persona, Speed, Aspect Ratio & Clip Tag */}
      <div className="bg-slate-950/80 px-3 sm:px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 z-20">
        
        {/* Left: Active Clip & Live Badges */}
        <div className="flex items-center gap-2 min-w-0">
          {activeClip ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold px-2 py-0.5 rounded-lg font-khmer flex items-center gap-1">
                <Film className="w-3 h-3 text-blue-400" />
                <span className="truncate max-w-[160px] sm:max-w-[220px]">ភាគ {activeClip.episodeNumber}: {activeClip.title}</span>
              </span>
              {activeClip.bgmTrackUrl && (
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md font-khmer flex items-center gap-1">
                  <Music className="w-2.5 h-2.5" />
                  <span>BGM 100%</span>
                </span>
              )}
              {activeClip.antiCopyright?.enabled && (
                <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 text-[10px] font-bold px-2 py-0.5 rounded-md font-khmer flex items-center gap-1 animate-pulse shadow-xs">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>🛡️ Shield Active</span>
                </span>
              )}
              {isSpeaking && (
                <span className="bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-md font-khmer flex items-center gap-1 animate-pulse">
                  <Mic className="w-2.5 h-2.5 text-purple-400" />
                  <span>TTS Dubbing</span>
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-500 font-khmer">គ្មាន Clip ត្រូវបានជ្រើសរើស</span>
          )}
        </div>

        {/* Right Controls: Voice Persona Selector, Speed Selector & Aspect Ratio */}
        <div className="flex items-center gap-1.5 ml-auto">
          
          {/* Voice Persona Dropdown (Piseth / Sreymom / Auto) */}
          {onChangeGlobalVoicePersona && (
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono gap-1 shadow-2xs">
              <UserCheck className="w-3 h-3 text-blue-400 shrink-0" />
              <select
                value={globalVoicePersona}
                onChange={(e) => onChangeGlobalVoicePersona(e.target.value)}
                className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer text-[10px] sm:text-[11px] font-khmer max-w-[110px] sm:max-w-[140px] truncate"
                title="ជ្រើសរើសប្រភេទសំឡេងនិយាយខ្មែរ (Khmer Voice Persona)"
              >
                <option value="auto" className="bg-slate-900 text-white">🤖 តាមតួអង្គ (Auto Characters)</option>
                <optgroup label="🇰🇭 KiriTTS AI & Clone" className="bg-slate-900 text-amber-300">
                  <option value="kiri_ff" className="bg-slate-900 text-white">🌟 Kiri: ff (Cloud Clone)</option>
                  <option value="kiri_Chanda" className="bg-slate-900 text-white">👨‍🦱 Kiri: Chanda (ប្រុស)</option>
                  <option value="kiri_Neary" className="bg-slate-900 text-white">👩‍🦰 Kiri: Neary (ស្រី)</option>
                  <option value="kiri_Maly" className="bg-slate-900 text-white">👩‍🦰 Kiri: Maly (ស្រី)</option>
                  <option value="kiri_Bora" className="bg-slate-900 text-white">👨‍🦱 Kiri: Bora (ប្រុស)</option>
                </optgroup>
                <optgroup label="🎙️ Microsoft Neural" className="bg-slate-900 text-slate-400">
                  <option value="male" className="bg-slate-900 text-white">👨‍🦱 Piseth (ពិសិដ្ឋ)</option>
                  <option value="female" className="bg-slate-900 text-white">👩‍🦰 Sreymom (ស្រីមុំ)</option>
                  <option value="narrator" className="bg-slate-900 text-white">🎙️ Piseth (អ្នកសម្រាយ)</option>
                  <option value="male_elder" className="bg-slate-900 text-white">👴 Piseth (តាចាស់)</option>
                  <option value="child" className="bg-slate-900 text-white">👶 Sreymom (កុមារ)</option>
                </optgroup>
              </select>
            </div>
          )}

          {/* Speed Selector */}
          {onChangeTtsSpeed && (
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-xs font-mono gap-1 shadow-2xs">
              <span className="text-amber-400 font-bold text-[10px]">⚡</span>
              <select
                value={ttsSpeed}
                onChange={(e) => onChangeTtsSpeed(parseFloat(e.target.value))}
                className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer text-[10px] sm:text-[11px]"
                title="ល្បឿននៃការនិយាយ (Speech Speed Rate)"
              >
                <option value="1.0" className="bg-slate-900 text-white">1.0x</option>
                <option value="1.15" className="bg-slate-900 text-white">1.15x</option>
                <option value="1.25" className="bg-slate-900 text-white">1.25x</option>
                <option value="1.35" className="bg-slate-900 text-white">1.35x</option>
                <option value="1.5" className="bg-slate-900 text-white">1.5x</option>
              </select>
            </div>
          )}

          {/* Aspect Ratio Switcher */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => onChangeAspectRatio('16:9')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                aspectRatio === '16:9' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="16:9 Landscape (YouTube / Cinema)"
            >
              16:9
            </button>
            <button
              onClick={() => onChangeAspectRatio('9:16')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                aspectRatio === '9:16' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="9:16 Portrait (TikTok / Reels)"
            >
              9:16
            </button>
            <button
              onClick={() => onChangeAspectRatio('1:1')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                aspectRatio === '1:1' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="1:1 Square"
            >
              1:1
            </button>
          </div>

        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative flex-1 flex items-center justify-center bg-black min-h-[280px] sm:min-h-[380px] overflow-hidden">
        {clips.length > 0 && activeClip ? (
          <div className={`relative flex items-center justify-center ${getAspectRatioClass()} overflow-hidden`}>
            {/* Real-time Anti-Copyright Video */}
            {(() => {
              const ac = activeClip.antiCopyright;
              const isAcEnabled = ac?.enabled;
              const scaleX = isAcEnabled && ac.flipHorizontal ? -1 : 1;
              const zoom = isAcEnabled && ac.zoomScale ? ac.zoomScale : 1.0;
              const transformStyle = isAcEnabled ? `scale(${zoom}) scaleX(${scaleX})` : undefined;

              let filterStyle = undefined;
              if (isAcEnabled) {
                switch (ac.colorFilter) {
                  case 'cinematic_warm':
                    filterStyle = 'contrast(1.08) saturate(1.18) brightness(1.02) sepia(0.08)';
                    break;
                  case 'cinematic_cool':
                    filterStyle = 'contrast(1.06) saturate(1.1) hue-rotate(12deg)';
                    break;
                  case 'golden_hour':
                    filterStyle = 'contrast(1.12) saturate(1.3) brightness(1.05) sepia(0.16)';
                    break;
                  case 'film_noir':
                    filterStyle = 'grayscale(1) contrast(1.25) brightness(0.92)';
                    break;
                  case 'vibrant_boost':
                    filterStyle = 'contrast(1.15) saturate(1.35) brightness(1.02)';
                    break;
                  case 'none':
                  default:
                    filterStyle = 'contrast(1.04) saturate(1.06)';
                    break;
                }
              }

              return (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    crossOrigin="anonymous"
                    muted={Boolean(activeClip.bgmTrackUrl) || isMuted}
                    onClick={onTogglePlay}
                    onTimeUpdate={handleVideoTimeUpdate}
                    style={{
                      transform: transformStyle,
                      filter: filterStyle,
                      transition: 'transform 0.25s ease, filter 0.25s ease'
                    }}
                    className="w-full h-full object-contain cursor-pointer"
                  />

                  {/* Cinematic Vignette Overlay */}
                  {isAcEnabled && ac.vignette && (
                    <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(0,0,0,0.7)] z-10" />
                  )}

                  {/* Micro Film Grain Overlay */}
                  {isAcEnabled && ac.filmGrain && (
                    <div className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] z-10" />
                  )}
                </>
              );
            })()}

            {/* Live Single-Line Animated Subtitle Overlay */}
            {activeSubtitle && (
              <AnimatedKaraokeOverlay
                config={subtitleConfig}
                currentSegment={activeSubtitle}
                currentTimeSec={videoRef.current?.currentTime || 0}
              />
            )}

            {/* Live Channel Watermark Overlay */}
            {watermark?.enabled && watermark?.text && (
              <div
                className={`absolute ${
                  watermark.position === 'top-left' ? 'top-3 left-3' :
                  watermark.position === 'bottom-left' ? 'bottom-12 left-3' :
                  watermark.position === 'bottom-right' ? 'bottom-12 right-3' :
                  watermark.position === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
                  'top-3 right-3'
                } px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs font-bold text-xs shadow-md border border-white/10 select-none z-20 pointer-events-none`}
                style={{
                  color: watermark.color || '#FFFFFF',
                  opacity: watermark.opacity ?? 0.85
                }}
              >
                {watermark.text}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 font-khmer space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
              <Film className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-sm font-bold text-slate-300">មិនទាន់មានវីដេអូភាគក្នុង Timeline នៅឡើយទេ</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              សូមជ្រើសរើសភាគដែលបានបកប្រែរួចពី Clip Library ខាងស្តាំ ឬចុចប៊ូតុង "➕ បន្ថែមភាគ" ខាងក្រោម
            </p>
          </div>
        )}
      </div>

      {/* Bottom Sequence Player Controls Bar */}
      <div className="bg-slate-900/95 border-t border-slate-800/80 px-4 py-2.5 flex items-center justify-between gap-4 z-20">
        {/* Left: Play / Pause & Timecode */}
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            disabled={clips.length === 0}
            className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 ml-0.5 fill-white" />}
          </button>

          <button
            onClick={() => onSeekGlobalTime(0)}
            disabled={clips.length === 0}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition hover:bg-slate-800 cursor-pointer"
            title="Reset to Start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Timecode display */}
          <div className="font-mono text-xs text-slate-300 flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-blue-400 font-bold">{formatTimecode(globalCurrentTime, true)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTimecode(totalDuration, true)}</span>
          </div>
        </div>

        {/* Center: Quick navigation across clips */}
        {clips.length > 1 && currentPos && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-khmer">
            <button
              onClick={() => {
                if (currentPos.clipIndex > 0) {
                  let prevStart = 0;
                  for (let i = 0; i < currentPos.clipIndex - 1; i++) {
                    prevStart += getClipEffectiveDuration(clips[i]);
                  }
                  onSeekGlobalTime(prevStart);
                }
              }}
              disabled={currentPos.clipIndex === 0}
              className="p-1 hover:text-white disabled:opacity-30 cursor-pointer"
              title="Previous Clip"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span>Clip {currentPos.clipIndex + 1} / {clips.length}</span>

            <button
              onClick={() => {
                if (currentPos.clipIndex < clips.length - 1) {
                  let nextStart = 0;
                  for (let i = 0; i <= currentPos.clipIndex; i++) {
                    nextStart += getClipEffectiveDuration(clips[i]);
                  }
                  onSeekGlobalTime(nextStart);
                }
              }}
              disabled={currentPos.clipIndex === clips.length - 1}
              className="p-1 hover:text-white disabled:opacity-30 cursor-pointer"
              title="Next Clip"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right: Volume & Fullscreen */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="w-16 sm:w-20 accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <button
            onClick={handleFullscreen}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
