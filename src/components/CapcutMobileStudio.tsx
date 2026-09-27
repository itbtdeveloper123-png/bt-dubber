import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  Play,
  Pause,
  Maximize2,
  Undo2,
  Redo2,
  Volume2,
  VolumeX,
  Edit3,
  Plus,
  Scissors,
  Music,
  Type,
  Star,
  Layers,
  Film,
  Sliders,
  ChevronDown,
  Sparkles,
  Download,
  Trash2,
  CheckCircle,
  RefreshCw,
  Key,
  ShieldCheck,
  Video,
  Server,
  Wifi
} from 'lucide-react';
import { MovieRecapResult, RecapSegment } from '../types';
import { getApiBaseUrl, setApiBaseUrl } from '../utils/apiConfig';

interface CapcutMobileStudioProps {
  recapData: MovieRecapResult | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  aspectRatio: '16:9' | '9:16' | '1:1';
  onChangeAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onUpdateRecap: (updated: MovieRecapResult) => void;
  activeSegmentId: string | null;
  playingSegmentId: string | null;
  onPlaySegment: (seg: RecapSegment) => void;
  onSegmentChange: (id: string, updates: Partial<RecapSegment>) => void;
  onAddSegment: () => void;
  onDeleteSegment: (id: string) => void;
  ttsSpeed: number;
  onSpeedChange: (speed: number) => void;
  globalVoicePersona: string;
  onChangeGlobalVoicePersona: (persona: string) => void;
  onOpenUpload: () => void;
  onOpenSaved: () => void;
  onOpenThumbnailModal: () => void;
  onOpenExport: () => void;
  onOpenSubtitleModal: () => void;
  onOpenWatermarkCleaner: () => void;
  onOpenLipSync: () => void;
  onOpenCompressor: () => void;
  onOpenBgmModal: () => void;
  onOpenApiKeyModal: () => void;
  onOpenTikTokModal?: () => void;
  onOpenUpdateModal?: () => void;
  audioIsolationMode: 'full_mix' | 'isolated_voice' | 'original_only';
  onChangeAudioIsolationMode: (mode: 'full_mix' | 'isolated_voice' | 'original_only') => void;
  bgmVolume: number;
  onChangeBgmVolume: (vol: number) => void;
  hasBgmTrack: boolean;
  onExtractBgm: () => void;
  isExtractingBgm: boolean;
  onBatchGenerateAllAudio: () => void;
  isBatchGeneratingAudio: boolean;
  batchProgress: { current: number; total: number };
  onProofreadScript: () => void;
  isProofreadingScript: boolean;
  onAutoDetectSpeakers: () => void;
  isAutoDetectingSpeakers: boolean;
  subtitleConfig: {
    enabled: boolean;
    karaokeMode: boolean;
    fontFamily: string;
    fontSize: number;
    primaryColor: string;
    outlineColor: string;
    position: 'bottom' | 'middle' | 'top';
  };
  currentActiveSegment?: RecapSegment | null;
  onToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => void;
}

type CapcutActiveTool = 'none' | 'edit' | 'audio' | 'text' | 'effects' | 'overlay' | 'cover' | 'filters';

export const CapcutMobileStudio: React.FC<CapcutMobileStudioProps> = ({
  recapData,
  videoRef,
  aspectRatio,
  onChangeAspectRatio,
  currentTimeSeconds,
  totalDurationSeconds,
  isPlaying,
  onTogglePlay,
  onSeek,
  onUpdateRecap,
  activeSegmentId,
  playingSegmentId,
  onPlaySegment,
  onSegmentChange,
  onAddSegment,
  onDeleteSegment,
  ttsSpeed,
  onSpeedChange,
  globalVoicePersona,
  onChangeGlobalVoicePersona,
  onOpenUpload,
  onOpenSaved,
  onOpenThumbnailModal,
  onOpenExport,
  onOpenSubtitleModal,
  onOpenWatermarkCleaner,
  onOpenLipSync,
  onOpenCompressor,
  onOpenBgmModal,
  onOpenApiKeyModal,
  onOpenTikTokModal,
  onOpenUpdateModal,
  audioIsolationMode,
  onChangeAudioIsolationMode,
  bgmVolume,
  onChangeBgmVolume,
  hasBgmTrack,
  onExtractBgm,
  isExtractingBgm,
  onBatchGenerateAllAudio,
  isBatchGeneratingAudio,
  batchProgress,
  onProofreadScript,
  isProofreadingScript,
  onAutoDetectSpeakers,
  isAutoDetectingSpeakers,
  subtitleConfig,
  currentActiveSegment,
  onToast
}) => {
  const [activeTool, setActiveTool] = useState<CapcutActiveTool>('none');
  const [isClipMuted, setIsClipMuted] = useState<boolean>(false);
  const [resolutionMenuOpen, setResolutionMenuOpen] = useState<boolean>(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('AI UHD');

  // Server PC Connection Settings
  const [serverUrlInput, setServerUrlInput] = useState<string>(() => getApiBaseUrl());
  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  const testServerConnection = async (url: string) => {
    setIsCheckingServer(true);
    try {
      const clean = url.trim().replace(/\/+$/, '');
      const res = await fetch(`${clean}/api/db/recaps`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        setServerStatus('connected');
        setApiBaseUrl(clean);
        onToast('success', '✅ ភ្ជាប់ទៅ Server PC ជោគជ័យ!', 'ឥឡូវនេះទូរស័ព្ទអាចប្រើប្រាស់ Python Render និង Database បានហើយ');
      } else {
        setServerStatus('disconnected');
        onToast('error', '⚠️ មិនអាចភ្ជាប់បានទេ', 'សូមពិនិត្យមើល IP និងធានាថាបានបើក npm run dev លើកុំព្យូទ័រ');
      }
    } catch {
      setServerStatus('disconnected');
      onToast('error', '⚠️ បរាជ័យក្នុងការភ្ជាប់', 'សូមប្រាកដថាទូរស័ព្ទ និងកុំព្យូទ័រភ្ជាប់ WiFi តែមួយ');
    } finally {
      setIsCheckingServer(false);
    }
  };

  // Toggle clip audio mute
  const toggleMuteClip = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsClipMuted(videoRef.current.muted);
      onToast('info', videoRef.current.muted ? '🔇 បានបិទសំឡេងឃ្លីបដើម' : '🔊 បានបើកសំឡេងឃ្លីប');
    }
  };

  // Format time MM:SS
  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // ⚡ CAPCUT FLUID TOUCH TIMELINE SCRUBBER MECHANICS
  // -------------------------------------------------------------
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const isUserTouchingRef = useRef<boolean>(false);
  const touchStartXRef = useRef<number>(0);
  const scrollStartRef = useRef<number>(0);

  // Scale: 40 pixels per second gives a smooth, tactile scrubbing feel
  const PIXELS_PER_SECOND = 40;

  const effectiveDuration = Math.max(3, totalDurationSeconds || 30);
  const timelineContentWidth = Math.round(effectiveDuration * PIXELS_PER_SECOND);

  // Time ruler ticks spaced neatly (every 5s or 10s depending on duration)
  const timeTicks = useMemo(() => {
    const step = effectiveDuration > 300 ? 10 : effectiveDuration > 60 ? 5 : 2;
    const ticks: number[] = [];
    for (let s = 0; s <= effectiveDuration + step; s += step) {
      ticks.push(s);
    }
    return ticks;
  }, [effectiveDuration]);

  // Touch Drag: User puts finger down on timeline
  const handleTouchStart = (e: React.TouchEvent) => {
    isUserTouchingRef.current = true;
    touchStartXRef.current = e.touches[0].clientX;
    if (timelineScrollRef.current) {
      scrollStartRef.current = timelineScrollRef.current.scrollLeft;
    }
  };

  // Touch Move: User drags timeline horizontally across center needle
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isUserTouchingRef.current || !timelineScrollRef.current) return;
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchStartXRef.current;
    
    // Move scroll in opposite direction of finger drag
    const newScrollLeft = Math.max(0, scrollStartRef.current - deltaX);
    timelineScrollRef.current.scrollLeft = newScrollLeft;

    // Calculate exact time in seconds
    const targetSeconds = Math.max(0, Math.min(effectiveDuration, newScrollLeft / PIXELS_PER_SECOND));

    // Seek video in real-time
    if (videoRef.current) {
      videoRef.current.currentTime = targetSeconds;
    }
  };

  // Touch End: User lifts finger
  const handleTouchEnd = () => {
    if (!isUserTouchingRef.current || !timelineScrollRef.current) return;
    isUserTouchingRef.current = false;
    const finalSeconds = Math.max(0, Math.min(effectiveDuration, timelineScrollRef.current.scrollLeft / PIXELS_PER_SECOND));
    onSeek(finalSeconds);
  };

  // Native onScroll listener for momentum flicking
  const handleTimelineScroll = useCallback(() => {
    if (!timelineScrollRef.current || isPlaying) return;
    const targetSeconds = Math.max(0, Math.min(effectiveDuration, timelineScrollRef.current.scrollLeft / PIXELS_PER_SECOND));
    if (videoRef.current && Math.abs(videoRef.current.currentTime - targetSeconds) > 0.15) {
      videoRef.current.currentTime = targetSeconds;
    }
  }, [effectiveDuration, isPlaying, videoRef]);

  // Sync scroll position with video playback
  useEffect(() => {
    if (!timelineScrollRef.current || isUserTouchingRef.current) return;
    if (isPlaying) {
      const targetScroll = currentTimeSeconds * PIXELS_PER_SECOND;
      timelineScrollRef.current.scrollLeft = targetScroll;
    }
  }, [currentTimeSeconds, isPlaying]);

  return (
    <div className="flex md:hidden flex-col h-[100dvh] w-full bg-[#000000] text-white font-khmer select-none overflow-hidden">
      
      {/* 1. TOP CAPCUT NAVIGATION BAR */}
      <header
        className="h-11 px-3 flex items-center justify-between bg-[#0a0a0a] border-b border-white/10 shrink-0 z-30"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 4px)' }}
      >
        {/* Left: Close & Search */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSaved}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 active:scale-90 transition hover:bg-white/10"
            title="បិទ / បញ្ជីរឿង"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenSaved}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 active:scale-90 transition hover:bg-white/10"
            title="ស្វែងរក"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Resolution Selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setResolutionMenuOpen(!resolutionMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 transition text-[11px] font-bold text-gray-200 border border-white/10"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>{selectedQuality}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {resolutionMenuOpen && (
              <div className="absolute top-9 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/15 rounded-xl shadow-2xl py-1 w-32 z-50 text-xs">
                {['AI UHD', '1080P', '2K 60FPS', '720P'].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setSelectedQuality(q);
                      setResolutionMenuOpen(false);
                      onToast('info', `បានជ្រើសគុណភាព ${q}`);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center justify-between ${
                      selectedQuality === q ? 'text-cyan-400 font-bold' : 'text-gray-300'
                    }`}
                  >
                    <span>{q}</span>
                    {selectedQuality === q && <CheckCircle className="w-3 h-3 text-cyan-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: High-contrast Cyan/Turquoise [ 📺 នាំចេញ ] Export Pill Button */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#00E5FF] hover:bg-[#00cbe2] active:scale-95 transition shadow-md shadow-[#00e5ff]/25 text-black font-black text-xs cursor-pointer"
        >
          <Film className="w-3.5 h-3.5 fill-black" />
          <span>នាំចេញ</span>
        </button>
      </header>

      {/* 2. VIDEO PREVIEW PLAYER AREA */}
      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center bg-[#000000] p-1.5 overflow-hidden">
        {/* Video Box with Controlled Height */}
        <div
          className={`relative max-w-full flex items-center justify-center bg-black rounded-lg overflow-hidden border border-white/10 shadow-2xl ${
            aspectRatio === '9:16'
              ? 'aspect-[9/16] h-full max-h-[35vh]'
              : aspectRatio === '1:1'
              ? 'aspect-square h-full max-h-[35vh]'
              : 'aspect-video w-full max-w-sm max-h-[35vh]'
          }`}
        >
          {recapData?.videoUrl ? (
            <video
              ref={videoRef}
              src={recapData.videoUrl}
              playsInline
              className="w-full h-full object-contain pointer-events-auto"
              onClick={onTogglePlay}
            />
          ) : (
            <div
              onClick={onOpenUpload}
              className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center cursor-pointer hover:bg-white/5 transition"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-cyan-400">
                <Plus className="w-5 h-5" />
              </div>
              <p className="text-xs text-gray-300 font-bold">ចុចដើម្បី Upload វីដេអូ</p>
              <p className="text-[10px] text-gray-500">គាំទ្រ MP4, MOV iPhone</p>
            </div>
          )}

          {/* Subtitles Overlay */}
          {subtitleConfig.enabled && currentActiveSegment?.khmer_script && (
            <div
              className={`absolute inset-x-2 pointer-events-none text-center px-2 py-1 ${
                subtitleConfig.position === 'top'
                  ? 'top-3'
                  : subtitleConfig.position === 'middle'
                  ? 'top-1/2 -translate-y-1/2'
                  : 'bottom-3'
              }`}
            >
              <span
                style={{
                  fontFamily: subtitleConfig.fontFamily || 'sans-serif',
                  fontSize: `${Math.max(13, subtitleConfig.fontSize * 0.7)}px`,
                  color: subtitleConfig.primaryColor || '#FFFFFF',
                  textShadow: `0 0 4px ${subtitleConfig.outlineColor || '#000000'}, 0 2px 4px rgba(0,0,0,0.8)`
                }}
                className="font-bold leading-relaxed px-2 py-0.5 rounded bg-black/50 backdrop-blur-2xs inline-block max-w-[95%]"
              >
                {currentActiveSegment.khmer_script}
              </span>
            </div>
          )}
        </div>

        {/* Player Transport Controls Strip (Under Video) */}
        <div className="w-full max-w-sm px-3 pt-1.5 pb-0.5 flex items-center justify-between text-gray-400 text-xs shrink-0">
          {/* Left: Fullscreen */}
          <button
            onClick={() => {
              if (videoRef.current) {
                if (videoRef.current.requestFullscreen) videoRef.current.requestFullscreen();
                else if ((videoRef.current as any).webkitEnterFullscreen) (videoRef.current as any).webkitEnterFullscreen();
              }
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 hover:text-white"
            title="ពេញអេក្រង់"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Center: Big Play/Pause Button */}
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center active:scale-90 shadow-md shadow-white/20 transition cursor-pointer"
            title="Play / Pause"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black ml-0.5" />}
          </button>

          {/* Right: Undo & Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSeek(Math.max(0, currentTimeSeconds - 3))}
              className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 hover:text-white"
              title="ថយ 3s"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSeek(Math.min(effectiveDuration, currentTimeSeconds + 3))}
              className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 hover:text-white"
              title="ទៅមុខ 3s"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Timecode Indicators: 00:00 / 02:48 */}
        <div className="w-full max-w-sm px-3 flex items-center justify-between text-[11px] font-mono text-gray-400 font-bold shrink-0">
          <span>{formatTime(currentTimeSeconds)} / {formatTime(effectiveDuration)}</span>
          <span className="text-[10px] text-gray-500 font-sans">
            {recapData?.recap_segments?.length || 0} វគ្គសម្រាយ
          </span>
        </div>
      </div>

      {/* 3. CAPCUT MULTI-TRACK TIMELINE (TOUCH SCRUBBER & NO OVERLAP) */}
      <div className="relative h-40 bg-[#121212] border-y border-white/10 flex shrink-0 overflow-hidden select-none">
        
        {/* Fixed Center White Playhead Needle (z-30) */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white z-30 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.9)]">
          <div className="w-3 h-2 bg-white rounded-b -translate-x-[5px] shadow-md" />
        </div>

        {/* Left Column: Fixed Track Headers (w-18) */}
        <div className="w-18 bg-[#181818] border-r border-white/10 flex flex-col z-20 shrink-0 shadow-md">
          {/* Row 0: Ruler spacer */}
          <div className="h-6 border-b border-white/5 flex items-center justify-center text-[9px] font-mono text-gray-500">
            SEC
          </div>

          {/* Row 1: Video Controls (Mute & Cover) */}
          <div className="h-10 flex items-center justify-around px-1 border-b border-white/5">
            <button
              onClick={toggleMuteClip}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition active:scale-95 ${
                isClipMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-300'
              }`}
              title="បិទ/បើកសំឡេងឃ្លីប"
            >
              {isClipMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onOpenThumbnailModal}
              className="w-7 h-7 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 flex items-center justify-center active:scale-95 transition"
              title="ក្រប Reels AI"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            </button>
          </div>

          {/* Row 2: Audio Icon */}
          <div className="h-9 flex items-center justify-center border-b border-white/5">
            <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Music className="w-3 h-3" />
            </div>
          </div>

          {/* Row 3: Text Icon */}
          <div className="h-9 flex items-center justify-center">
            <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Type className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* Right Column: Horizontally Scrollable Lanes with Touch Dragging */}
        <div
          ref={timelineScrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onScroll={handleTimelineScroll}
          className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-none relative touch-pan-x cursor-grab active:cursor-grabbing"
          style={{ paddingLeft: '50%', paddingRight: '50%' }}
        >
          {/* Inner Content Sized to Timeline Duration */}
          <div
            className="flex flex-col justify-between py-0.5 space-y-1"
            style={{ width: `${timelineContentWidth}px` }}
          >
            
            {/* ROW 0: SCROLLABLE TIME RULER (NEVER OVERLAPS!) */}
            <div className="h-6 relative border-b border-white/5 select-none pointer-events-none">
              {timeTicks.map((sec) => (
                <div
                  key={sec}
                  className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${sec * PIXELS_PER_SECOND}px` }}
                >
                  <span className="text-[9px] font-mono text-gray-400 font-bold leading-tight">
                    {formatTime(sec)}
                  </span>
                  <div className="w-0.5 h-1.5 bg-white/20 mt-0.5" />
                </div>
              ))}
            </div>

            {/* ROW 1: MAIN VIDEO TRACK */}
            <div className="h-10 flex items-center gap-1.5">
              {recapData?.videoUrl ? (
                <div
                  className="h-9 px-3 rounded-lg bg-[#252525] border border-white/20 flex items-center justify-between gap-2 shadow-inner"
                  style={{ width: `${Math.max(160, timelineContentWidth)}px` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-[11px] font-bold text-gray-200 truncate">
                      {recapData.videoFileName || 'វីដេអូចម្បង'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">
                    {formatTime(effectiveDuration)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={onOpenUpload}
                  className="h-9 px-3 rounded-lg bg-white/5 border border-dashed border-white/20 flex items-center gap-1.5 text-xs text-gray-400 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>បញ្ចូលវីដេអូ</span>
                </button>
              )}

              {/* Plus Button at end of Video */}
              <button
                onClick={onOpenUpload}
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center text-white transition cursor-pointer shrink-0"
                title="បន្ថែមវីដេអូថ្មី"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* ROW 2: AUDIO TRACK */}
            <div className="h-9 flex items-center">
              <button
                onClick={() => setActiveTool('audio')}
                className="h-7 px-3 rounded-lg bg-[#1c2920] border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5 text-[11px] font-bold active:scale-95 transition"
              >
                <Plus className="w-3 h-3" />
                <span>+ បញ្ចូលសំឡេង (AI Dubbing / BGM)</span>
              </button>
            </div>

            {/* ROW 3: TEXT / SUBTITLE TRACK */}
            <div className="h-9 flex items-center">
              <button
                onClick={() => setActiveTool('text')}
                className="h-7 px-3 rounded-lg bg-[#2b2417] border border-amber-500/30 text-amber-300 flex items-center gap-1.5 text-[11px] font-bold active:scale-95 transition"
              >
                <Plus className="w-3 h-3" />
                <span>+ បញ្ចូលអក្សរ (ស្គ្រីប & Subtitle)</span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* 4. BOTTOM CAPCUT TOOLBAR DOCK (CLEANLY SPACED & NOT CUT OFF) */}
      <footer
        className="h-14 px-1 bg-[#0c0c0c] border-t border-white/10 flex items-center justify-around shrink-0 z-30"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      >
        {/* 1. កែ (Edit) */}
        <button
          onClick={() => setActiveTool(activeTool === 'edit' ? 'none' : 'edit')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'edit' ? 'text-cyan-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Scissors className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">កែ</span>
        </button>

        {/* 2. សំឡេង (Audio) */}
        <button
          onClick={() => setActiveTool(activeTool === 'audio' ? 'none' : 'audio')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'audio' ? 'text-emerald-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Music className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">សំឡេង</span>
        </button>

        {/* 3. អត្ថបទ (Text) */}
        <button
          onClick={() => setActiveTool(activeTool === 'text' ? 'none' : 'text')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'text' ? 'text-amber-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Type className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">អត្ថបទ</span>
        </button>

        {/* 4. បែបផែន (Effects) */}
        <button
          onClick={() => setActiveTool(activeTool === 'effects' ? 'none' : 'effects')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'effects' ? 'text-purple-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Star className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">បែបផែន</span>
        </button>

        {/* 5. វីដេអូត្រួតគ្នា (Overlay) */}
        <button
          onClick={() => setActiveTool(activeTool === 'overlay' ? 'none' : 'overlay')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'overlay' ? 'text-blue-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Layers className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">ត្រួតគ្នា</span>
        </button>

        {/* 6. ចំណងជើង (Cover) */}
        <button
          onClick={() => setActiveTool(activeTool === 'cover' ? 'none' : 'cover')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'cover' ? 'text-rose-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Film className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">ចំណងជើង</span>
        </button>

        {/* 7. តម្រង (Settings) */}
        <button
          onClick={() => setActiveTool(activeTool === 'filters' ? 'none' : 'filters')}
          className={`w-12 flex flex-col items-center justify-center transition active:scale-90 ${
            activeTool === 'filters' ? 'text-orange-400 font-bold' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Sliders className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] leading-tight">តម្រង</span>
        </button>
      </footer>

      {/* 5. CAPCUT INTERACTIVE SUB-SHEETS / DRAWERS */}
      {activeTool !== 'none' && (
        <div className="fixed inset-x-0 bottom-14 max-h-[58vh] bg-[#161616] border-t border-white/15 rounded-t-2xl shadow-2xl flex flex-col z-40 animate-in slide-in-from-bottom duration-200">
          
          {/* Header of Sheet with Close */}
          <div className="h-10 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="w-8 h-1 bg-white/20 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            <span className="text-xs font-bold text-gray-200 mt-2">
              {activeTool === 'edit' && '✂️ ឧបករណ៍កែវីដេអូ (Edit & Cut)'}
              {activeTool === 'audio' && '🎵 សំឡេង & AI Dubbing'}
              {activeTool === 'text' && `📝 អត្ថបទស្គ្រីប (${recapData?.recap_segments?.length || 0} វគ្គ)`}
              {activeTool === 'effects' && '⭐ បែបផែន AI & Smart Tools'}
              {activeTool === 'overlay' && '🖼️ បណ្ណាល័យវីដេអូ & រឿងភាគ'}
              {activeTool === 'cover' && '🎞️ ក្រប Reels & ទំហំវីដេអូ'}
              {activeTool === 'filters' && '⚙️ ការកំណត់ & កម្មវិធីសម្រួល'}
            </span>
            <button
              onClick={() => setActiveTool('none')}
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white active:scale-90 mt-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content of Sheet */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
            
            {/* SUB-SHEET 1: EDIT (កែ) */}
            {activeTool === 'edit' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      onOpenUpload();
                      setActiveTool('none');
                    }}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-1 active:scale-95"
                  >
                    <Plus className="w-5 h-5 text-cyan-400" />
                    <span className="font-bold">បញ្ចូលវីដេអូថ្មី</span>
                    <span className="text-[10px] text-gray-400">Select Video</span>
                  </button>
                  <button
                    onClick={toggleMuteClip}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-1 active:scale-95"
                  >
                    {isClipMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
                    <span className="font-bold">{isClipMuted ? 'បើកសំឡេងដើម' : 'បិទសំឡេងដើម'}</span>
                    <span className="text-[10px] text-gray-400">Clip Audio</span>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-300">⚡ ល្បឿនអាន TTS</span>
                    <span className="font-mono text-cyan-400 font-bold">{ttsSpeed}x</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1.0, 1.15, 1.25, 1.35, 1.5].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => onSpeedChange(spd)}
                        className={`flex-1 py-1.5 rounded-lg font-mono font-bold active:scale-95 transition ${
                          ttsSpeed === spd ? 'bg-cyan-500 text-black' : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SUB-SHEET 2: AUDIO (សំឡេង) */}
            {activeTool === 'audio' && (
              <div className="space-y-3">
                {/* Voice Persona Selector */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <span className="font-bold text-emerald-400 block">🎙️ សំឡេងអ្នកសម្រាយ (Voice Persona)</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'auto', label: '🤖 Auto (ឆ្លាស់តួ)' },
                      { id: 'piseth', label: '👨 ប្រុស (ពិសិដ្ឋ)' },
                      { id: 'sreymom', label: '👩 ស្រី (ស្រីមុំ)' },
                      { id: 'male_elder', label: '👴 លោកតា' }
                    ].map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          onChangeGlobalVoicePersona(v.id);
                          onToast('success', `បានជ្រើស ${v.label}`);
                        }}
                        className={`py-2 px-2.5 rounded-lg text-left text-xs font-bold transition active:scale-95 flex items-center justify-between ${
                          globalVoicePersona === v.id ? 'bg-emerald-600 text-white' : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        <span>{v.label}</span>
                        {globalVoicePersona === v.id && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* BGM Separator & Volume */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-300">🎵 សំឡេងភ្លេង BGM Track</span>
                    <button
                      onClick={onOpenBgmModal}
                      className="text-[11px] text-cyan-400 hover:underline font-bold"
                    >
                      បំបែក AI BGM
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-gray-400" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={bgmVolume}
                      onChange={(e) => onChangeBgmVolume(parseFloat(e.target.value))}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="font-mono text-[11px] text-gray-300 w-8 text-right">
                      {Math.round(bgmVolume * 100)}%
                    </span>
                  </div>
                </div>

                {/* Batch Audio Generator */}
                <button
                  onClick={onBatchGenerateAllAudio}
                  disabled={isBatchGeneratingAudio}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition font-bold flex items-center justify-center gap-2 text-white shadow-lg shadow-emerald-900/30"
                >
                  {isBatchGeneratingAudio ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>កំពុងបង្កើតសំឡេង ({batchProgress.current}/{batchProgress.total})...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>⚡ បង្កើតសំឡេងគ្រប់វគ្គទាំងអស់ (0ms Instant)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* SUB-SHEET 3: TEXT / SCRIPT (អត្ថបទ) */}
            {activeTool === 'text' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <button
                    onClick={onAddSegment}
                    className="py-1.5 px-3 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold active:scale-95 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>បន្ថែមវគ្គថ្មី</span>
                  </button>
                  <button
                    onClick={onProofreadScript}
                    disabled={isProofreadingScript}
                    className="py-1.5 px-3 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold active:scale-95 flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>កែអក្ខរាវិរុទ្ធ AI</span>
                  </button>
                </div>

                {/* Segments List */}
                <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                  {(recapData?.recap_segments || []).map((seg, idx) => (
                    <div
                      key={seg.id || idx}
                      className={`p-2.5 rounded-xl border transition ${
                        activeSegmentId === seg.id
                          ? 'bg-amber-950/30 border-amber-500/50'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-white/10 font-bold text-[10px] flex items-center justify-center text-amber-400">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-[11px] text-gray-300">
                            {seg.speaker_name || 'អ្នកសម្រាយ'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onPlaySegment(seg)}
                            className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center active:scale-90"
                            title="ស្តាប់"
                          >
                            <Play className="w-3 h-3 fill-emerald-400" />
                          </button>
                          <button
                            onClick={() => onDeleteSegment(seg.id)}
                            className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center active:scale-90"
                            title="លុប"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={seg.khmer_script || ''}
                        onChange={(e) => onSegmentChange(seg.id, { khmer_script: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-gray-200 leading-relaxed focus:border-amber-400 focus:outline-none resize-none"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-SHEET 4: EFFECTS (បែបផែន) */}
            {activeTool === 'effects' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onOpenLipSync();
                    setActiveTool('none');
                  }}
                  className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 text-center"
                >
                  <Sparkles className="w-6 h-6 text-purple-400" />
                  <span className="font-bold text-gray-200">AI Lip Sync</span>
                  <span className="text-[10px] text-gray-400">ធ្វើឱ្យមាត់តួសមនឹងសំឡេង</span>
                </button>

                <button
                  onClick={() => {
                    onOpenWatermarkCleaner();
                    setActiveTool('none');
                  }}
                  className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 text-center"
                >
                  <ShieldCheck className="w-6 h-6 text-blue-400" />
                  <span className="font-bold text-gray-200">លុប Watermark</span>
                  <span className="text-[10px] text-gray-400">Smart Watermark Eraser</span>
                </button>

                <button
                  onClick={() => {
                    onOpenSubtitleModal();
                    setActiveTool('none');
                  }}
                  className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 text-center"
                >
                  <Type className="w-6 h-6 text-amber-400" />
                  <span className="font-bold text-gray-200">ស្ទីល Subtitle Karaoke</span>
                  <span className="text-[10px] text-gray-400">ពណ៌ & ទីតាំងអក្សរ</span>
                </button>

                <button
                  onClick={() => {
                    onOpenThumbnailModal();
                    setActiveTool('none');
                  }}
                  className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 text-center"
                >
                  <Film className="w-6 h-6 text-rose-400" />
                  <span className="font-bold text-gray-200">Reels Cover AI</span>
                  <span className="text-[10px] text-gray-400">បង្កើតរូបក្របទាក់ទាញ</span>
                </button>
              </div>
            )}

            {/* SUB-SHEET 5: OVERLAY & LIBRARY (វីដេអូត្រួតគ្នា) */}
            {activeTool === 'overlay' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-300">📁 រឿងភាគ & វីដេអូដែលបានរក្សាទុក</span>
                  <button
                    onClick={onOpenSaved}
                    className="text-cyan-400 font-bold flex items-center gap-1"
                  >
                    <span>មើលទាំងអស់</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      onOpenUpload();
                      setActiveTool('none');
                    }}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-1 active:scale-95"
                  >
                    <Video className="w-5 h-5 text-cyan-400" />
                    <span className="font-bold">Upload វីដេអូ</span>
                  </button>
                  {onOpenTikTokModal && (
                    <button
                      onClick={() => {
                        onOpenTikTokModal();
                        setActiveTool('none');
                      }}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-1 active:scale-95"
                    >
                      <Download className="w-5 h-5 text-pink-400" />
                      <span className="font-bold">នាំចូលពី TikTok</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* SUB-SHEET 6: COVER & ASPECT RATIO (ចំណងជើង / ក្រប) */}
            {activeTool === 'cover' && (
              <div className="space-y-3">
                {/* Project Title Input */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                  <span className="font-bold text-gray-300 block">ចំណងជើងវីដេអូ / រឿង</span>
                  <input
                    type="text"
                    value={recapData?.movie_title || ''}
                    onChange={(e) => {
                      if (recapData) {
                        onUpdateRecap({ ...recapData, movie_title: e.target.value });
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    placeholder="បញ្ចូលចំណងជើងរឿង..."
                  />
                </div>

                {/* Aspect Ratio Selector */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <span className="font-bold text-gray-300 block">ទម្រង់អេក្រង់ (Aspect Ratio)</span>
                  <div className="flex items-center gap-2">
                    {[
                      { id: '16:9', label: '16:9 ទេសភាព' },
                      { id: '9:16', label: '9:16 បញ្ឈរ (Reels)' },
                      { id: '1:1', label: '1:1 ការ៉េ' }
                    ].map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onChangeAspectRatio(r.id as any)}
                        className={`flex-1 py-2 px-2 rounded-lg text-center font-bold active:scale-95 transition ${
                          aspectRatio === r.id ? 'bg-cyan-500 text-black' : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {r.id}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Open Reels Cover Modal Button */}
                <button
                  onClick={() => {
                    onOpenThumbnailModal();
                    setActiveTool('none');
                  }}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 transition font-bold text-white flex items-center justify-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  <span>បើកផ្ទាំងបង្កើតរូបក្រប Reels Cover Master</span>
                </button>
              </div>
            )}

            {/* SUB-SHEET 7: FILTERS & SETTINGS (តម្រង) */}
            {activeTool === 'filters' && (
              <div className="space-y-2.5">
                {/* Server Connection Card */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-gray-200">ភ្ជាប់ទៅកាន់ Server PC (Python)</span>
                    </div>
                    {serverStatus === 'connected' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center gap-1">
                        <Wifi className="w-3 h-3" /> បានភ្ជាប់
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 font-bold">
                        Standalone
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    បញ្ចូល IP របស់កុំព្យូទ័រ (ឧទាហរណ៍ <code className="text-cyan-300">http://192.168.0.xxx:3000</code>) ដើម្បី Render វីដេអូតាម Python & SQLite DB ពីចម្ងាយ៖
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={serverUrlInput}
                      onChange={(e) => setServerUrlInput(e.target.value)}
                      placeholder="http://192.168.0.xxx:3000"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-emerald-400 focus:outline-none"
                    />
                    <button
                      onClick={() => testServerConnection(serverUrlInput)}
                      disabled={isCheckingServer}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-bold text-white transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {isCheckingServer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'ភ្ជាប់'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onOpenCompressor();
                    setActiveTool('none');
                  }}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between active:scale-98"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-5 h-5 text-orange-400" />
                    <div className="text-left">
                      <span className="font-bold block">កម្មវិធីបង្ហាប់វីដេអូ (Video Compressor)</span>
                      <span className="text-[10px] text-gray-400">កាត់បន្ថយទំហំ File ឱ្យស្រាល</span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />
                </button>

                <button
                  onClick={() => {
                    onOpenApiKeyModal();
                    setActiveTool('none');
                  }}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between active:scale-98"
                >
                  <div className="flex items-center gap-2.5">
                    <Key className="w-5 h-5 text-cyan-400" />
                    <div className="text-left">
                      <span className="font-bold block">កំណត់ Gemini API Key</span>
                      <span className="text-[10px] text-gray-400">កូនសោរបកប្រែ និងបង្កើតរូបភាព</span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />
                </button>

                {onOpenUpdateModal && (
                  <button
                    onClick={() => {
                      onOpenUpdateModal();
                      setActiveTool('none');
                    }}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-5 h-5 text-emerald-400" />
                      <div className="text-left">
                        <span className="font-bold block">ពិនិត្យមើលកំណែ Update</span>
                        <span className="text-[10px] text-gray-400">ស្វែងរកកំណែថ្មី</span>
                      </div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
