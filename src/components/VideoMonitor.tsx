import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize2, Upload, Video as VideoIcon, 
  Sparkles, Wand2, Ratio, AlertCircle, Film, Sliders, MicOff, Music, Volume1,
  RotateCw, RefreshCw, Layers, CheckCircle2, ChevronDown
} from 'lucide-react';
import { convertVideoToH264MP4, isLikelyUnsupportedVideo } from '../utils/videoTranscoder';

export type AudioIsolationMode = 'remove_vocals_keep_bgm' | 'smart_ducking' | 'mute_all_original' | 'original_unmodified';

interface VideoMonitorProps {
  videoUrl?: string;
  videoFileName?: string;
  rawFile?: File;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  aspectRatio: '16:9' | '9:16' | '1:1';
  audioIsolationMode: AudioIsolationMode;
  onChangeAudioIsolationMode: (mode: AudioIsolationMode) => void;
  bgmVolume: number;
  onChangeBgmVolume: (vol: number) => void;
  selectedBgmId?: string;
  onChangeSelectedBgmId?: (id: string) => void;
  onFileUpload: (file: File, episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }) => void;
  onUpdateVideoUrl?: (newUrl: string, newFileName: string, convertedFile?: File) => void;
  onSelectSampleVideo?: (url: string, title: string) => void;
  isLoading: boolean;
  isProcessingFile: boolean;
  currentTimeStr: string;
  totalDurationStr: string;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onExtractBgm?: () => void;
  isExtractingBgm?: boolean;
  bgmExtractProgress?: number;
  bgmExtractStatus?: string;
  hasBgmTrack?: boolean;
  onAutoDetectAspectRatio?: (ratio: '16:9' | '9:16' | '1:1') => void;
}

const PRESET_SAMPLE_VIDEOS = [
  {
    title: 'Sintel Fantasy Adventure (720p HD MP4)',
    url: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
  },
  {
    title: 'Oceans Nature Cinema (Web MP4)',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
  },
  {
    title: 'Flower Macro 4K (Fast Stream MP4)',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  }
];

export const VideoMonitor: React.FC<VideoMonitorProps> = ({
  videoUrl,
  videoFileName,
  rawFile,
  videoRef,
  aspectRatio,
  audioIsolationMode,
  onChangeAudioIsolationMode,
  bgmVolume,
  onChangeBgmVolume,
  selectedBgmId = 'epic_action',
  onChangeSelectedBgmId,
  onFileUpload,
  onUpdateVideoUrl,
  onSelectSampleVideo,
  isLoading,
  isProcessingFile,
  currentTimeStr,
  totalDurationStr,
  isPlaying: externalIsPlaying,
  onTogglePlay,
  onExtractBgm,
  isExtractingBgm,
  bgmExtractProgress = 0,
  bgmExtractStatus = '',
  hasBgmTrack = false,
  onAutoDetectAspectRatio
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [showAudioControls, setShowAudioControls] = useState(false);
  const [showSamplesMenu, setShowSamplesMenu] = useState(false);
  const [isPlayingInternal, setIsPlayingInternal] = useState(false);
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : isPlayingInternal;

  const [hasVideoError, setHasVideoError] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [transcodeStatus, setTranscodeStatus] = useState('');
  const [transcodeError, setTranscodeError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current file is purely an audio file
  const isAudioFile = useMemo(() => {
    if (!videoFileName) return false;
    return /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(videoFileName);
  }, [videoFileName]);

  // Check if video is likely HEVC / iOS iPhone recorded video or unsupported format
  const isPotentiallyUnsupported = useMemo(() => {
    if (isAudioFile) return false;
    if (rawFile) return isLikelyUnsupportedVideo(rawFile);
    if (videoFileName) return isLikelyUnsupportedVideo(videoFileName);
    return false;
  }, [rawFile, videoFileName, isAudioFile]);

  const hasAutoTranscodedRef = useRef<string>('');

  // Automatically trigger transcoding for iPhone / HEVC / unsupported videos or when video error occurs
  useEffect(() => {
    if (!videoUrl || isAudioFile || isTranscoding) return;
    
    // If filename has _web_h264.mp4, it is already transcoded
    if (videoFileName && videoFileName.includes('_web_h264')) return;

    // If we have already auto-transcoded this file, skip
    if (hasAutoTranscodedRef.current === videoUrl) return;

    if (hasVideoError && rawFile) {
      console.log('Video decode failed. Auto-triggering FFmpeg H.264 web transcoding...');
      hasAutoTranscodedRef.current = videoUrl;
      handleStartTranscode();
    }
  }, [hasVideoError, videoUrl, rawFile, isAudioFile, videoFileName, isTranscoding]);

  const handleStartTranscode = async () => {
    if (!rawFile) {
      setTranscodeError('មិនមានហ្វាយវីដេអូដើមសម្រាប់បម្លែងទេ។ សូម Upload ហ្វាយម្តងទៀត។');
      return;
    }

    try {
      setIsTranscoding(true);
      setTranscodeProgress(0);
      setTranscodeStatus('កំពុងរៀបចំ FFmpeg Turbo Transcoder...');
      setTranscodeError(null);

      const convertedFile = await convertVideoToH264MP4(
        rawFile,
        (progress, status) => {
          setTranscodeProgress(progress);
          setTranscodeStatus(status);
        }
      );

      const newBlobUrl = URL.createObjectURL(convertedFile);
      setHasVideoError(false);
      setIsTranscoding(false);

      if (onUpdateVideoUrl) {
        onUpdateVideoUrl(newBlobUrl, convertedFile.name, convertedFile);
      }
    } catch (err: any) {
      console.error('Transcode failed:', err);
      setIsTranscoding(false);
      setTranscodeError(err.message || 'បរាជ័យក្នុងការបម្លែងវីដេអូ');
    }
  };

  const handleLoadedMetadata = () => {
    setHasVideoError(false);
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.0;
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoWidth && videoHeight && onAutoDetectAspectRatio) {
        if (videoHeight > videoWidth * 1.15) {
          onAutoDetectAspectRatio('9:16');
        } else if (Math.abs(videoWidth - videoHeight) < 60) {
          onAutoDetectAspectRatio('1:1');
        } else if (videoWidth > videoHeight * 1.15) {
          onAutoDetectAspectRatio('16:9');
        }
      }
    }
  };

  const handleLoadedData = () => {
    setHasVideoError(false);
  };

  const togglePlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!videoRef.current) return;

    if (hasVideoError && isAudioFile) {
      setIsPlayingInternal(prev => !prev);
      return;
    }

    const video = videoRef.current;
    if (video.paused) {
      if (audioIsolationMode === 'mute_all_original') {
        video.muted = true;
      } else {
        video.muted = false;
      }

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlayingInternal(true))
          .catch((err) => {
            console.warn('Unmuted playback blocked by browser, retrying muted:', err?.message || err);
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play()
                .then(() => setIsPlayingInternal(true))
                .catch((e) => {
                  console.warn('Muted play failed:', e?.message || e);
                  setIsPlayingInternal(false);
                });
            }
          });
      }
    } else {
      video.pause();
      setIsPlayingInternal(false);
    }
  };

  const handleTogglePlay = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (onTogglePlay) {
      onTogglePlay();
      return;
    }
    togglePlayPause(e);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        onFileUpload(file);
      }
    }
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16] max-h-[260px] sm:max-h-[320px] md:max-h-[360px] lg:max-h-[390px] xl:max-h-[450px] 2xl:max-h-[490px] w-auto';
      case '1:1':
        return 'aspect-square max-h-[260px] sm:max-h-[320px] md:max-h-[360px] lg:max-h-[390px] xl:max-h-[450px] 2xl:max-h-[490px] w-auto';
      case '16:9':
      default:
        return 'aspect-video w-full max-h-[260px] sm:max-h-[320px] md:max-h-[360px] lg:max-h-[390px] xl:max-h-[450px] 2xl:max-h-[490px]';
    }
  };

  const getAudioModeBadge = () => {
    switch (audioIsolationMode) {
      case 'remove_vocals_keep_bgm':
        return { 
          label: '🎙️ លុបសំឡេងនិយាយ - រក្សា BGM', 
          shortLabel: '🎙️ No Vocal + BGM',
          class: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
        };
      case 'smart_ducking':
        return { 
          label: '🔉 កាត់សំឡេងដើម 80% (Auto-Ducking)', 
          shortLabel: '🔉 Ducking 80%',
          class: 'bg-blue-500/20 text-blue-300 border-blue-500/40' 
        };
      case 'mute_all_original':
        return { 
          label: '🔇 បិទសំឡេងដើមទាំងស្រុង', 
          shortLabel: '🔇 Muted',
          class: 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
        };
      case 'original_unmodified':
      default:
        return { 
          label: '🔊 សំឡេងដើម 100%', 
          shortLabel: '🔊 100%',
          class: 'bg-gray-500/20 text-gray-300 border-gray-500/40' 
        };
    }
  };

  const currentModeBadge = getAudioModeBadge();

  return (
    <div className="relative flex-1 bg-[#0e1117] rounded-xl border border-gray-800 overflow-hidden flex flex-col items-center justify-center p-2 sm:p-3 xl:p-4 shadow-xl min-h-[260px] sm:min-h-[300px] md:min-h-[340px] lg:min-h-[390px] xl:min-h-[450px] 2xl:min-h-[490px]">
      
      {/* Hidden File Input for Video Drag & Drop */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* Transcoding Progress Overlay Modal */}
      {isTranscoding && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 z-50 text-center font-khmer animate-fadeIn">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-blue-600/20 border-2 border-blue-500/40 flex items-center justify-center text-blue-400 mb-2 sm:mb-3 animate-pulse">
            <RefreshCw className="w-5 h-5 sm:w-7 sm:h-7 animate-spin text-blue-400" />
          </div>

          <h3 className="text-xs sm:text-base font-bold text-white mb-1">
            កំពុងបម្លែងវីដេអូ Turbo H.264 (ល្បឿនលឿន)...
          </h3>
          <p className="text-[10px] sm:text-xs text-blue-300 mb-2 sm:mb-3 max-w-md">
            {transcodeStatus || 'កំពុងដំណើរការបម្លែង Video Codec ឱ្យ Support ជាមួយ Web Browser'}
          </p>

          {/* Progress Bar */}
          <div className="w-full max-w-md bg-gray-800 rounded-full h-2.5 sm:h-3 overflow-hidden p-0.5 border border-gray-700 mb-2">
            <div 
              className="bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${Math.max(transcodeProgress, 5)}%` }}
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-emerald-400">
              {transcodeProgress}%
            </span>

            {/* Skip / Dismiss Button */}
            <button
              type="button"
              onClick={() => setIsTranscoding(false)}
              className="text-[10px] sm:text-[11px] font-bold text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 sm:px-3 py-1 rounded-md transition cursor-pointer border border-white/10"
              title="រំលងការបម្លែងដើម្បីកែស្គ្រីបភ្លាមៗ"
            >
              រំលង (Skip & Edit Script) ⏩
            </button>
          </div>
        </div>
      )}

      {/* AI Vocal Removal / BGM Extraction Progress Overlay */}
      {isExtractingBgm && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none font-khmer animate-fadeIn">
          <div className="relative mb-3 sm:mb-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
            <Music className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
          </div>

          <h3 className="text-sm sm:text-base font-bold text-white mb-1">
            AI កំពុងលុបសំឡេងនិយាយ និងញែកយកតែភ្លេង BGM...
          </h3>

          <p className="text-xs text-emerald-300 max-w-sm mb-3">
            {bgmExtractStatus || 'កាត់បន្ថយសំឡេងនិយាយតួអង្គដើម រក្សាភ្លេងអម និង Sound Effects 100%'}
          </p>

          <div className="w-full max-w-md bg-gray-800 rounded-full h-2.5 sm:h-3 overflow-hidden p-0.5 border border-gray-700 mb-2">
            <div 
              className="bg-gradient-to-r from-emerald-500 via-teal-400 to-green-400 h-full rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${Math.max(bgmExtractProgress, 5)}%` }}
            />
          </div>

          <span className="text-xs font-mono font-bold text-emerald-400">
            {bgmExtractProgress}%
          </span>
        </div>
      )}

      {/* 1. Dedicated Top Toolbar (Above Video Canvas - Never overlaps video) */}
      <div className="w-full flex items-center justify-between gap-2 pb-2 border-b border-gray-800 shrink-0 z-20">
        {/* Left: Video file badge, Upload button, Sample videos */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="bg-black/60 px-2 py-1 rounded text-[10px] sm:text-[11px] font-mono text-gray-200 flex items-center gap-1.5 border border-white/10 shrink-0">
            <VideoIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate max-w-[85px] sm:max-w-[140px] md:max-w-[180px]">
              {videoFileName || 'Movie Clip'}
            </span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-500 px-2 sm:px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-khmer font-bold text-white flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
            title="Upload New Video File"
          >
            <Upload className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Upload វីដេអូ</span>
            <span className="sm:hidden">Upload</span>
          </button>

          {onSelectSampleVideo && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowSamplesMenu(!showSamplesMenu)}
                className="bg-purple-600/80 hover:bg-purple-600 px-2 sm:px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-khmer font-bold text-white flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                title="ជ្រើសរើសវីដេអូគំរូសាកល្បង"
              >
                <Film className="w-3 h-3 shrink-0" />
                <span className="hidden md:inline">វីដេអូគំរូ</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>

              {showSamplesMenu && (
                <div className="absolute top-full left-0 mt-1.5 w-60 sm:w-64 bg-[#181B22] border border-gray-700 rounded-lg p-1.5 shadow-2xl z-50 text-xs font-khmer space-y-1">
                  <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider">
                    ជ្រើសរើសវីដេអូគំរូ Web MP4
                  </div>
                  {PRESET_SAMPLE_VIDEOS.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectSampleVideo(sample.url, sample.title);
                        setShowSamplesMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-purple-600/30 text-gray-200 hover:text-white flex items-center gap-2 transition"
                    >
                      <Play className="w-3 h-3 text-purple-400 shrink-0" />
                      <span className="truncate text-[11px]">{sample.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: BGM status badge & Audio Mode selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onExtractBgm && (
            <button
              type="button"
              onClick={onExtractBgm}
              disabled={isExtractingBgm}
              className={`px-2 sm:px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-khmer font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer shrink-0 border ${
                hasBgmTrack
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-300/40'
              }`}
              title="លុបសំឡេងនិយាយក្នុងវីដេអូដើមចេញ ទុកតែភ្លេង BGM"
            >
              <Sparkles className={`w-3 h-3 ${isExtractingBgm ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{hasBgmTrack ? '🎵 BGM បានញែករួច' : '🪄 ញែកភ្លេង BGM'}</span>
              <span className="md:hidden">BGM</span>
            </button>
          )}

          {/* Audio Mode Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowAudioControls(!showAudioControls)}
              className={`px-2 sm:px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-khmer font-bold border truncate flex items-center gap-1 transition cursor-pointer ${currentModeBadge.class}`}
            >
              <MicOff className="w-3 h-3 shrink-0" />
              <span className="hidden xl:inline">{currentModeBadge.label}</span>
              <span className="xl:hidden">{currentModeBadge.shortLabel}</span>
              <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
            </button>

            {/* Dropdown Menu for Vocal Remover & BGM Options */}
            {showAudioControls && (
              <div className="absolute top-full right-0 mt-1.5 w-64 sm:w-72 bg-[#1A1D24] border border-gray-700 rounded-lg p-2.5 sm:p-3 text-gray-200 text-xs shadow-2xl z-50 space-y-2 font-khmer">
                <div className="font-bold text-white text-[11px] pb-1 border-b border-gray-700 flex items-center justify-between">
                  <span>កំណត់សំឡេងនិយាយដើម (Audio Mode)</span>
                  <span className="text-[10px] font-mono text-amber-400">AI DSP Filter</span>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => {
                      onChangeAudioIsolationMode('remove_vocals_keep_bgm');
                      setShowAudioControls(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition ${
                      audioIsolationMode === 'remove_vocals_keep_bgm'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    <MicOff className="w-4 h-4 text-emerald-300 shrink-0" />
                    <div>
                      <div className="text-[11px]">🎙️ លុបសំឡេងនិយាយដើម (Keep BGM)</div>
                      <div className="text-[9px] text-gray-300 font-sans">បិទសំឡេងនិយាយបរទេស - រក្សាទុកតែភ្លេងផ្ទៃខាងក្រោយ</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onChangeAudioIsolationMode('smart_ducking');
                      setShowAudioControls(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition ${
                      audioIsolationMode === 'smart_ducking'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    <Volume1 className="w-4 h-4 text-blue-300 shrink-0" />
                    <div>
                      <div className="text-[11px]">🔉 កាត់សំឡេងដើម 80% (Auto-Ducking)</div>
                      <div className="text-[9px] text-gray-300 font-sans">បន្ថយសំឡេងដើមស្វ័យប្រវត្តិនៅពេល AI ខ្មែរកំពុងនិយាយ</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onChangeAudioIsolationMode('mute_all_original');
                      setShowAudioControls(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition ${
                      audioIsolationMode === 'mute_all_original'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    <VolumeX className="w-4 h-4 text-amber-300 shrink-0" />
                    <div>
                      <div className="text-[11px]">🔇 បិទសំឡេងដើមទាំងស្រុង</div>
                      <div className="text-[9px] text-gray-300 font-sans">លឺតែសំឡេង AI សម្រាយរឿងខ្មែរ + BGM ភ្លេងអម</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onChangeAudioIsolationMode('original_unmodified');
                      setShowAudioControls(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition ${
                      audioIsolationMode === 'original_unmodified'
                        ? 'bg-gray-700 text-white font-bold'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    <Volume2 className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <div className="text-[11px]">🔊 បើកសំឡេងដើម 100%</div>
                      <div className="text-[9px] text-gray-400 font-sans">រក្សាសំឡេងដើមនៃវីដេអូដោយមិនផ្លាស់ប្តូរ</div>
                    </div>
                  </button>
                </div>

                {/* BGM Music Volume Slider in Dropdown */}
                <div className="pt-2 border-t border-gray-700 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <Music className="w-3 h-3" />
                      <span>កម្រិតសំឡេងភ្លេងអម (BGM)</span>
                    </span>
                    <span className="font-mono text-emerald-300 font-bold">{bgmVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={bgmVolume}
                    onChange={(e) => onChangeBgmVolume(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Video Monitor Stage (Center Unobstructed Canvas) */}
      <div 
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative flex-1 w-full my-1.5 flex items-center justify-center transition-all min-h-0 ${
          dragActive ? 'ring-4 ring-blue-500 bg-blue-900/20' : ''
        }`}
      >
        {videoUrl ? (
          <div 
            className={`relative rounded-lg overflow-hidden bg-black shadow-2xl border border-gray-800 flex items-center justify-center group ${getAspectRatioClass()}`}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              muted={audioIsolationMode === 'mute_all_original'}
              onClick={handleTogglePlay}
              onPlay={() => setIsPlayingInternal(true)}
              onPause={() => setIsPlayingInternal(false)}
              onEnded={() => setIsPlayingInternal(false)}
              onLoadedMetadata={handleLoadedMetadata}
              onLoadedData={handleLoadedData}
              onCanPlay={() => setHasVideoError(false)}
              onError={(e) => {
                const target = e.currentTarget as HTMLVideoElement;
                const err = target?.error;
                console.warn('Video element format error:', err ? `Code ${err.code}: ${err.message}` : 'Format not natively supported by browser');
                setHasVideoError(true);
                
                // If it's a format error (Code 4 / HEVC / iPhone clip) and we have the raw file, auto-transcode to Web H.264
                if (rawFile && !isTranscoding && hasAutoTranscodedRef.current !== videoUrl) {
                  hasAutoTranscodedRef.current = videoUrl || '';
                  handleStartTranscode();
                }
              }}
              className="w-full h-full object-contain relative z-0 cursor-pointer"
            />

            {/* Smart Banner: Unsupported Codec (HEVC / iPhone Video) or Video Error Alert */}
            {(hasVideoError || (isPotentiallyUnsupported && !isAudioFile)) && !isTranscoding && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute top-4 left-2 right-2 bg-slate-900/95 border border-amber-500/50 rounded-xl p-2.5 shadow-2xl z-30 font-khmer flex flex-col sm:flex-row items-center justify-between gap-2 animate-fadeIn"
              >
                <div className="flex items-center gap-2 text-left min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[11px] font-bold text-amber-200 truncate">
                      វីដេអូទម្រង់ iPhone / HEVC ត្រូវការបម្លែងសម្រាប់ Web Preview
                    </h4>
                    <p className="text-[10px] text-gray-300 truncate">
                      ចុចបម្លែងដើម្បីទស្សនារូបភាព Preview វីដេអូបានច្បាស់ 100% លើ Web
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleStartTranscode}
                    className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-[10px] shadow-md transition active:scale-95 flex items-center gap-1 cursor-pointer"
                    title="Convert video to H.264 MP4"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>⚡ បម្លែងទៅជា Web MP4</span>
                  </button>
                </div>
              </div>
            )}

            {/* Audio-Only Visualizer (For purely MP3/WAV/Audio files) */}
            {isAudioFile && (
              <div 
                onClick={handleTogglePlay}
                className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-4 text-center text-white z-10 font-khmer cursor-pointer select-none"
              >
                <div className="relative mb-2 flex items-center justify-center">
                  <div className={`w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center ${isPlaying ? 'animate-pulse' : ''}`}>
                    <div className={`w-10 h-10 rounded-full bg-blue-600/20 border border-blue-400/40 flex items-center justify-center ${isPlaying ? 'scale-110 transition-transform' : ''}`}>
                      <Music className="w-5 h-5 text-blue-400" />
                    </div>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-white mb-1 tracking-wide truncate max-w-xs">
                  {videoFileName || 'Audio Track'}
                </h4>

                <p className="text-[10px] text-blue-300/80 max-w-xs mb-2">
                  របៀបសំឡេង (Audio Mode) - Gemini AI បានបកប្រែសម្រាយរឿងខ្មែរ 100%
                </p>
              </div>
            )}

            {/* Big Center Play/Pause Button Overlay on Pause */}
            {!isPlaying && !isTranscoding && (
              <div 
                onClick={handleTogglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition z-10 cursor-pointer"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay(e);
                  }}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-600/95 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl transition transform group-hover:scale-110 active:scale-95 cursor-pointer border border-white/20"
                  title={isPlaying ? "Pause Video" : "Play Video"}
                >
                  <Play className="w-6 h-6 fill-white translate-x-0.5" />
                </button>
              </div>
            )}

          </div>
        ) : (
          /* Empty State / Video Dropzone */
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`w-full max-w-xl aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-4 sm:p-6 text-center shadow-inner ${
              dragActive 
                ? 'border-blue-500 bg-blue-500/10 text-blue-400 scale-[1.01]' 
                : 'border-gray-700 bg-black/40 hover:bg-black/60 text-gray-400 hover:border-blue-500'
            }`}
          >
            {isProcessingFile || isLoading ? (
              <div className="flex flex-col items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-xs sm:text-sm font-semibold text-blue-400 animate-pulse font-khmer">
                  {isLoading ? 'Gemini AI កំពុងទស្សនា និងបកប្រែសម្រាយរឿងខ្មែរ...' : 'កំពុងរៀបចំហ្វាយវីដេអូ...'}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 font-mono">
                  Processing video frames & transcript...
                </p>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-2 sm:mb-3 shadow-sm">
                  <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-white font-khmer mb-1">
                  ទាញទម្លាក់ហ្វាយវីដេអូរឿង ឬចុចទីនេះដើម្បី Upload
                </h3>
                <p className="text-[10px] sm:text-xs text-gray-400 font-mono mb-2 sm:mb-3">
                  Supports MP4, WEBM, MOV, MKV up to 100MB
                </p>
                <button
                  type="button"
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>ជ្រើសរើសវីដេអូរឿង (Select Video)</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. Dedicated Bottom Playback Bar (Clean layout below video) */}
      <div className="w-full flex items-center justify-between pt-2 border-t border-gray-800 shrink-0 z-20 text-white text-xs font-mono">
        {/* Play/Pause Button & Time Display */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-white transition flex items-center justify-center cursor-pointer shadow-xs"
            title={isPlaying ? "Pause Video" : "Play Video"}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-white" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />
            )}
          </button>

          <div className="text-gray-300 font-semibold text-[10px] sm:text-[11px]">
            {currentTimeStr} / {totalDurationStr}
          </div>
        </div>

        {/* BGM Preset & Volume Slider */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-black/40 px-2 sm:px-2.5 py-1 rounded-md border border-white/10">
          <Music className="w-3 h-3 text-emerald-400 shrink-0" />
          
          {/* BGM Select: Exclusively Extracted Movie BGM */}
          {onChangeSelectedBgmId && (
            <select
              value={selectedBgmId}
              onChange={(e) => onChangeSelectedBgmId(e.target.value)}
              className="bg-slate-900/90 text-emerald-300 font-khmer text-[10px] sm:text-[11px] rounded px-1.5 py-0.5 border border-emerald-500/30 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[170px] truncate"
              title="សំឡេងភ្លេង BGM ញែកចេញពីរឿងដើម"
            >
              <option value="extracted">🪄 ភ្លេង AI ញែកពីរឿង</option>
              <option value="none">🔇 បិទភ្លេង BGM</option>
            </select>
          )}

          <span className="text-[10px] text-gray-400 font-khmer hidden md:inline">កម្រិត:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={bgmVolume}
            onChange={(e) => onChangeBgmVolume(parseInt(e.target.value))}
            className="w-14 sm:w-18 accent-emerald-500 cursor-pointer h-1.5"
            title={`កម្រិតសំឡេងភ្លេងអម (BGM): ${bgmVolume}%`}
          />
          <span className="text-[10px] text-emerald-400 font-mono font-bold w-6 text-right">{bgmVolume}%</span>
        </div>

        {/* Action Buttons: Transcode & Fullscreen */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(rawFile || isPotentiallyUnsupported) && (
            <button
              type="button"
              onClick={handleStartTranscode}
              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center gap-1 text-[10px] font-khmer cursor-pointer"
              title="បម្លែងវីដេអូទៅជា H.264 Web MP4"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden xl:inline">បម្លែង H.264</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                if (videoRef.current.requestFullscreen) {
                  videoRef.current.requestFullscreen();
                }
              }
            }}
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition cursor-pointer"
            title="Fullscreen Preview"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};
