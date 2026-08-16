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
  onFileUpload: (file: File, episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }) => void;
  onUpdateVideoUrl?: (newUrl: string, newFileName: string, convertedFile?: File) => void;
  onSelectSampleVideo?: (url: string, title: string) => void;
  isLoading: boolean;
  isProcessingFile: boolean;
  currentTimeStr: string;
  totalDurationStr: string;
}

const PRESET_SAMPLE_VIDEOS = [
  {
    title: 'Cyberpunk Action (1080p Web Trailer)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
  {
    title: 'Sintel Fantasy Adventure (720p MP4)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
  {
    title: 'Big Buck Bunny Animation (MP4)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    title: 'For Bigger Blazes (Fast Stream)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
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
  onFileUpload,
  onUpdateVideoUrl,
  onSelectSampleVideo,
  isLoading,
  isProcessingFile,
  currentTimeStr,
  totalDurationStr
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [showAudioControls, setShowAudioControls] = useState(false);
  const [showSamplesMenu, setShowSamplesMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
    if (hasAutoTranscodedRef.current === videoUrl) return;

    if (hasVideoError || isPotentiallyUnsupported) {
      hasAutoTranscodedRef.current = videoUrl;
      console.log('⚡ Auto-transcoding video for seamless web preview:', videoFileName);
      handleStartTranscode();
    }
  }, [videoUrl, videoFileName, hasVideoError, isPotentiallyUnsupported, isAudioFile, isTranscoding]);

  // Reset states when video URL changes
  useEffect(() => {
    setHasVideoError(false);
    setIsPlaying(false);
    setTranscodeError(null);
    if (videoRef.current && videoUrl) {
      videoRef.current.load();
    }
  }, [videoUrl, videoRef]);

  // Nudge video frame on load so first frame paints immediately instead of remaining black
  const handleLoadedMetadata = () => {
    setHasVideoError(false);
    if (videoRef.current) {
      try {
        if (videoRef.current.currentTime === 0) {
          videoRef.current.currentTime = 0.001;
        }
      } catch {
        // ignore
      }
    }
  };

  const handleLoadedData = () => {
    setHasVideoError(false);
    if (videoRef.current) {
      try {
        if (videoRef.current.currentTime === 0) {
          videoRef.current.currentTime = 0.001;
        }
      } catch {
        // ignore
      }
    }
  };

  // Convert current video to Web MP4 (H.264) using in-browser FFmpeg WASM
  const handleStartTranscode = async () => {
    if (!rawFile && !videoUrl) return;
    setIsTranscoding(true);
    setTranscodeProgress(0);
    setTranscodeStatus('កំពុងចាប់ផ្តើមប្រព័ន្ធបម្លែង H.264...');
    setTranscodeError(null);

    try {
      let sourceFile: File;
      if (rawFile) {
        sourceFile = rawFile;
      } else if (videoUrl) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        sourceFile = new File([blob], videoFileName || 'video.mp4', { type: blob.type || 'video/mp4' });
      } else {
        throw new Error('No video source available for transcoding');
      }

      const convertedFile = await convertVideoToH264MP4(sourceFile, (percent, statusText) => {
        setTranscodeProgress(percent);
        setTranscodeStatus(statusText);
      });

      const newBlobUrl = URL.createObjectURL(convertedFile);

      if (onUpdateVideoUrl) {
        onUpdateVideoUrl(newBlobUrl, convertedFile.name, convertedFile);
      }

      setHasVideoError(false);
      setIsTranscoding(false);
      setTranscodeProgress(100);

      // Auto-load and play first frame of newly converted video
      if (videoRef.current) {
        videoRef.current.src = newBlobUrl;
        videoRef.current.load();
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0.01;
          }
        }, 300);
      }
    } catch (err: any) {
      console.error('Transcode failed:', err);
      setIsTranscoding(false);
      setTranscodeError(err.message || 'បរាជ័យក្នុងការបម្លែងវីដេអូ។ សូមព្យាយាមម្តងទៀត!');
    }
  };

  const togglePlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!videoRef.current) return;

    if (hasVideoError && isAudioFile) {
      setIsPlaying(prev => !prev);
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
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('Unmuted playback blocked by browser, retrying muted:', err?.message || err);
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch((e) => {
                  console.warn('Muted play failed:', e?.message || e);
                  setIsPlaying(false);
                });
            }
          });
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
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
        return 'aspect-[9/16] max-h-[460px] w-auto';
      case '1:1':
        return 'aspect-square max-h-[460px] w-auto';
      case '16:9':
      default:
        return 'aspect-video w-full max-h-[460px]';
    }
  };

  const getAudioModeBadge = () => {
    switch (audioIsolationMode) {
      case 'remove_vocals_keep_bgm':
        return { label: '🎙️ លុបសំឡេងនិយាយ - រក្សា BGM ភ្លេង', class: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'smart_ducking':
        return { label: '🔉 កាត់សំឡេងដើម 80% (Auto-Ducking)', class: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'mute_all_original':
        return { label: '🔇 បិទសំឡេងដើមទាំងស្រុង', class: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'original_unmodified':
      default:
        return { label: '🔊 សំឡេងដើម 100%', class: 'bg-gray-500/20 text-gray-300 border-gray-500/40' };
    }
  };

  const currentModeBadge = getAudioModeBadge();

  return (
    <div className="relative flex-1 bg-[#0e1117] rounded-xl border border-gray-800 overflow-hidden flex flex-col items-center justify-center p-3 sm:p-4 shadow-xl min-h-[380px]">
      
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
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 z-50 text-center font-khmer animate-fadeIn">
          <div className="w-14 h-14 rounded-full bg-blue-600/20 border-2 border-blue-500/40 flex items-center justify-center text-blue-400 mb-3 animate-pulse">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-400" />
          </div>

          <h3 className="text-sm sm:text-base font-bold text-white mb-1">
            កំពុងបម្លែងវីដេអូ Turbo H.264 (ល្បឿនលឿន)...
          </h3>
          <p className="text-xs text-blue-300 mb-3 max-w-md">
            {transcodeStatus || 'កំពុងដំណើរការបម្លែង Video Codec ឱ្យ Support ជាមួយ Web Browser'}
          </p>

          {/* Progress Bar */}
          <div className="w-full max-w-md bg-gray-800 rounded-full h-3 overflow-hidden p-0.5 border border-gray-700 mb-2">
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
              className="text-[11px] font-bold text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-md transition cursor-pointer border border-white/10"
              title="រំលងការបម្លែងដើម្បីកែស្គ្រីបភ្លាមៗ"
            >
              រំលង (Skip & Edit Script) ⏩
            </button>
          </div>
        </div>
      )}

      {/* Main Video Monitor Stage */}
      <div 
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative w-full flex items-center justify-center transition-all ${
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
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              muted={audioIsolationMode === 'mute_all_original'}
              onClick={togglePlayPause}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onLoadedMetadata={handleLoadedMetadata}
              onLoadedData={handleLoadedData}
              onCanPlay={() => setHasVideoError(false)}
              onError={(e) => {
                const target = e.currentTarget as HTMLVideoElement;
                const err = target?.error;
                console.warn('Video element error:', err ? `Code ${err.code}: ${err.message}` : 'Error loading video');
                setHasVideoError(true);
              }}
              className="w-full h-full object-contain relative z-0 cursor-pointer"
            />

            {/* Smart Banner: Unsupported Codec (HEVC / iPhone Video) or Video Error Alert */}
            {(hasVideoError || (isPotentiallyUnsupported && !isAudioFile)) && !isTranscoding && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute top-12 left-3 right-3 bg-slate-900/95 border border-amber-500/50 rounded-xl p-3 shadow-2xl z-30 font-khmer flex flex-col sm:flex-row items-center justify-between gap-2.5 animate-fadeIn"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-200">
                      វីដេអូទម្រង់ iPhone / HEVC ត្រូវការបម្លែងសម្រាប់ Web Preview
                    </h4>
                    <p className="text-[11px] text-gray-300">
                      ចុចបម្លែងដើម្បីទស្សនារូបភាព Preview វីដេអូបានច្បាស់ 100% លើ Web Browser
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleStartTranscode}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    title="Convert video to H.264 MP4"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>⚡ បម្លែងទៅជា Web MP4</span>
                  </button>
                </div>
              </div>
            )}

            {/* Audio-Only Visualizer (For purely MP3/WAV/Audio files) */}
            {isAudioFile && (
              <div 
                onClick={togglePlayPause}
                className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-6 text-center text-white z-10 font-khmer cursor-pointer select-none"
              >
                <div className="relative mb-3 flex items-center justify-center">
                  <div className={`w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center ${isPlaying ? 'animate-pulse' : ''}`}>
                    <div className={`w-14 h-14 rounded-full bg-blue-600/20 border border-blue-400/40 flex items-center justify-center ${isPlaying ? 'scale-110 transition-transform' : ''}`}>
                      <Music className="w-7 h-7 text-blue-400" />
                    </div>
                  </div>
                  
                  {/* Animated Equalizer Waves */}
                  {isPlaying && (
                    <div className="absolute -bottom-2 flex items-end gap-1 h-5">
                      <span className="w-1 bg-blue-400 rounded-full animate-[bounce_0.6s_infinite_100ms] h-4"></span>
                      <span className="w-1 bg-blue-400 rounded-full animate-[bounce_0.6s_infinite_300ms] h-5"></span>
                      <span className="w-1 bg-blue-400 rounded-full animate-[bounce_0.6s_infinite_200ms] h-3"></span>
                      <span className="w-1 bg-blue-400 rounded-full animate-[bounce_0.6s_infinite_400ms] h-5"></span>
                      <span className="w-1 bg-blue-400 rounded-full animate-[bounce_0.6s_infinite_150ms] h-4"></span>
                    </div>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white mb-1 tracking-wide truncate max-w-xs">
                  {videoFileName || 'Audio Track'}
                </h4>

                <p className="text-[11px] text-blue-300/80 max-w-xs mb-3">
                  របៀបសំឡេង (Audio Mode) - Gemini AI បានបកប្រែ និងសម្រាយរឿងខ្មែរ 100%
                </p>

                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[11px] font-mono text-gray-300">
                  <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
                  <span>{currentTimeStr} / {totalDurationStr}</span>
                </div>
              </div>
            )}

            {/* Big Center Play/Pause Button Overlay on Pause */}
            {!isPlaying && !isTranscoding && (
              <div 
                onClick={togglePlayPause}
                className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition z-10 cursor-pointer"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlayPause(e);
                  }}
                  className="w-16 h-16 rounded-full bg-blue-600/95 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl transition transform group-hover:scale-110 active:scale-95 cursor-pointer border border-white/20"
                  title={isPlaying ? "Pause Video" : "Play Video"}
                >
                  <Play className="w-8 h-8 fill-white translate-x-0.5" />
                </button>
              </div>
            )}

            {/* Top Video Monitor Badge Info */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-20 pointer-events-auto"
            >
              <div className="flex items-center gap-2">
                <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-white flex items-center gap-1.5 border border-white/10 shadow-sm">
                  <VideoIcon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="truncate max-w-[120px] sm:max-w-[180px]">{videoFileName || 'Movie Clip'}</span>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600/90 hover:bg-blue-600 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-khmer font-bold text-white flex items-center gap-1 shadow-md transition active:scale-95 cursor-pointer"
                  title="Upload New Video File"
                >
                  <Upload className="w-3 h-3" />
                  <span>ប្តូរ/Upload វីដេអូ</span>
                </button>

                {/* Quick Sample Video Switcher */}
                {onSelectSampleVideo && (
                  <div className="relative">
                    <button
                      onClick={() => setShowSamplesMenu(!showSamplesMenu)}
                      className="bg-purple-600/85 hover:bg-purple-600 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-khmer font-bold text-white flex items-center gap-1 shadow-md transition active:scale-95 cursor-pointer"
                      title="ជ្រើសរើសវីដេអូគំរូសាកល្បង"
                    >
                      <Film className="w-3 h-3" />
                      <span className="hidden sm:inline">វីដេអូគំរូ</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {showSamplesMenu && (
                      <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#181B22] border border-gray-700 rounded-lg p-1.5 shadow-2xl z-50 text-xs font-khmer space-y-1">
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

              {/* Active Audio Isolation Badge */}
              <div className={`bg-black/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-khmer font-bold border ${currentModeBadge.class}`}>
                {currentModeBadge.label}
              </div>
            </div>

            {/* Bottom Floating Control Bar on Video Canvas */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white text-xs font-mono shadow-md z-20"
            >
              
              {/* Audio Vocal Remover Toggle & Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAudioControls(!showAudioControls)}
                  className="px-2.5 py-1 rounded text-[11px] font-khmer font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="កំណត់មុខងារលុបសំឡេងនិយាយ & រក្សាទុកភ្លេង"
                >
                  <MicOff className="w-3.5 h-3.5 text-amber-300" />
                  <span>លុបសំឡេងនិយាយ / Audio Mode</span>
                  <Sliders className="w-3 h-3 text-gray-300 ml-0.5" />
                </button>

                {/* Dropdown Menu for Vocal Remover & BGM Options */}
                {showAudioControls && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#1A1D24] border border-gray-700 rounded-lg p-3 text-gray-200 text-xs shadow-2xl z-50 space-y-2.5 font-khmer">
                    <div className="font-bold text-white text-[12px] pb-1 border-b border-gray-700 flex items-center justify-between">
                      <span>កំណត់សំឡេងនិយាយដើម (Vocal Isolation)</span>
                      <span className="text-[10px] font-mono text-amber-400">AI DSP Filter</span>
                    </div>

                    <div className="space-y-1.5">
                      <button
                        onClick={() => {
                          onChangeAudioIsolationMode('remove_vocals_keep_bgm');
                          setShowAudioControls(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 transition ${
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
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 transition ${
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
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 transition ${
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
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 transition ${
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

                    {/* BGM Music Volume Slider */}
                    <div className="pt-2 border-t border-gray-700 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <Music className="w-3 h-3" />
                          <span>កម្រិតសំឡេងភ្លេងអម (BGM Volume)</span>
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

              {/* Play / Time Info */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="p-1 hover:bg-white/20 rounded text-white transition flex items-center justify-center cursor-pointer"
                  title={isPlaying ? "Pause Video" : "Play Video"}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white translate-x-0.5" />
                  )}
                </button>
                <div className="text-gray-300 font-semibold text-[11px] font-mono">
                  {currentTimeStr} / {totalDurationStr}
                </div>
              </div>

              {/* Action Buttons: Transcode & Fullscreen */}
              <div className="flex items-center gap-1.5">
                {(rawFile || isPotentiallyUnsupported) && (
                  <button
                    type="button"
                    onClick={handleStartTranscode}
                    className="p-1 hover:bg-white/20 rounded text-amber-300 hover:text-amber-200 transition flex items-center gap-1 text-[11px] font-khmer"
                    title="បម្លែងវីដេអូទៅជា H.264 Web MP4"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span className="hidden md:inline">បម្លែង H.264</span>
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
                  className="p-1 hover:bg-white/20 rounded text-gray-300 hover:text-white transition cursor-pointer"
                  title="Fullscreen Preview"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          </div>
        ) : (
          /* Empty State / Video Dropzone */
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`w-full max-w-xl aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-6 text-center shadow-inner ${
              dragActive 
                ? 'border-blue-500 bg-blue-500/10 text-blue-400 scale-[1.01]' 
                : 'border-gray-700 bg-black/40 hover:bg-black/60 text-gray-400 hover:border-blue-500'
            }`}
          >
            {isProcessingFile || isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-blue-400 animate-pulse font-khmer">
                  {isLoading ? 'Gemini AI កំពុងទស្សនា និងបកប្រែសម្រាយរឿងខ្មែរ...' : 'កំពុងរៀបចំហ្វាយវីដេអូ...'}
                </p>
                <p className="text-xs text-gray-500 font-mono">
                  Processing video frames & transcript...
                </p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 shadow-sm">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white font-khmer mb-1">
                  ទាញទម្លាក់ហ្វាយវីដេអូរឿង ឬចុចទីនេះដើម្បី Upload (Drop Movie Clip)
                </h3>
                <p className="text-xs text-gray-400 font-mono mb-3">
                  Supports MP4, WEBM, MOV, MKV up to 100MB
                </p>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition flex items-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  <span>ជ្រើសរើសវីដេអូរឿង (Select Video File)</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
};
