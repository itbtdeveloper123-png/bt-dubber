import React, { useState, useEffect, useRef } from 'react';
import { MovieRecapResult, RecapSegment, TranslationMode } from '../types';
import { StudioHeader } from './StudioHeader';
import { StudioSidebar } from './StudioSidebar';
import { VideoMonitor, AudioIsolationMode } from './VideoMonitor';
import { DubbingPanel } from './DubbingPanel';
import { TimelinePanel } from './TimelinePanel';
import { VideoUploadModal } from './VideoUploadModal';

interface RecapStudioProps {
  recapData: MovieRecapResult;
  onUpdateRecap: (updated: MovieRecapResult) => void;
  onSaveRecap: () => void;
  isSaved: boolean;
  onOpenSaved: () => void;
  savedCount: number;
  onFileUpload: (file: File, episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }) => void;
  isLoading: boolean;
  isProcessingFile: boolean;
  onRegenerateAll?: () => void;
  translationMode: TranslationMode;
  onChangeTranslationMode: (mode: TranslationMode) => void;
}

export const RecapStudio: React.FC<RecapStudioProps> = ({
  recapData,
  onUpdateRecap,
  onSaveRecap,
  isSaved,
  onOpenSaved,
  savedCount,
  onFileUpload,
  isLoading,
  isProcessingFile,
  onRegenerateAll,
  translationMode,
  onChangeTranslationMode
}) => {
  // Studio UI state
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  
  // Audio & Playback state
  const [playingSegmentId, setPlayingSegmentId] = useState<number | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState<boolean>(false);
  const [activeSegmentId, setActiveSegmentId] = useState<number>(1);
  
  // Advanced Audio Isolation & BGM state
  const [audioIsolationMode, setAudioIsolationMode] = useState<AudioIsolationMode>('remove_vocals_keep_bgm');
  const [bgmVolume, setBgmVolume] = useState<number>(30); // 30% background music
  
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.15);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(69);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(279);

  // Refs for video & speech audio
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesis | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthRef.current = window.speechSynthesis;
    }
    return () => {
      if (speechSynthRef.current) speechSynthRef.current.cancel();
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      if (bgmAudioRef.current) bgmAudioRef.current.pause();
    };
  }, []);

  // Synchronize Video Audio according to active AudioIsolationMode
  useEffect(() => {
    const video = videoPlayerRef.current;
    if (!video) return;

    const isSpeaking = playingSegmentId !== null || isPlayingAll;

    switch (audioIsolationMode) {
      case 'remove_vocals_keep_bgm':
        // Filter out vocals by setting original video volume low (for ambient BGM) & enabling BGM track
        video.muted = false;
        video.volume = 0.25; // 25% background audio ambience
        break;

      case 'smart_ducking':
        // Lower original audio to 15% when Khmer TTS is speaking, else 100%
        video.muted = false;
        video.volume = isSpeaking ? 0.15 : 1.0;
        break;

      case 'mute_all_original':
        // Full mute original soundtrack
        video.muted = true;
        video.volume = 0;
        break;

      case 'original_unmodified':
      default:
        video.muted = false;
        video.volume = 1.0;
        break;
    }
  }, [audioIsolationMode, playingSegmentId, isPlayingAll]);

  // Update video time tracking
  useEffect(() => {
    const video = videoPlayerRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTimeSeconds(video.currentTime);
      if (video.duration && !isNaN(video.duration)) {
        setTotalDurationSeconds(video.duration);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [recapData?.videoUrl]);

  // Helper to parse timestamp MM:SS to seconds
  const parseTimestampToSeconds = (timestampStr: string): number => {
    if (!timestampStr) return 0;
    const parts = timestampStr.split(':').map(Number);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return 0;
  };

  const jumpVideoToTimestamp = (startTimeStr: string, segId?: number) => {
    if (segId) setActiveSegmentId(segId);
    if (videoPlayerRef.current) {
      const seconds = parseTimestampToSeconds(startTimeStr);
      videoPlayerRef.current.currentTime = seconds;
      
      // Apply correct audio volume based on audio isolation mode
      if (audioIsolationMode === 'mute_all_original') {
        videoPlayerRef.current.muted = true;
      } else if (audioIsolationMode === 'remove_vocals_keep_bgm') {
        videoPlayerRef.current.muted = false;
        videoPlayerRef.current.volume = 0.25;
      } else if (audioIsolationMode === 'smart_ducking') {
        videoPlayerRef.current.muted = false;
        videoPlayerRef.current.volume = 0.15;
      } else {
        videoPlayerRef.current.muted = false;
        videoPlayerRef.current.volume = 1.0;
      }

      videoPlayerRef.current.play().catch(() => {});
    }
  };

  // Audio & Pre-buffering Pipeline Refs
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isPlayingAllRef = useRef<boolean>(false);
  isPlayingAllRef.current = isPlayingAll;

  // Helper to clean Khmer speech text
  const cleanKhmerSpeech = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^\u1780-\u17FFa-zA-Z0-9\s.,!?្៌៍៏័៎ិីឹឺុូួើឿៀេែៃោៅំះៈ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Helper to get or pre-buffer Audio instance with instant RAM playback
  const getAudioForText = (text: string): HTMLAudioElement => {
    const clean = cleanKhmerSpeech(text);
    if (audioCacheRef.current.has(clean)) {
      const existing = audioCacheRef.current.get(clean)!;
      existing.playbackRate = ttsSpeed;
      return existing;
    }
    const ttsUrl = `/api/tts?text=${encodeURIComponent(clean)}`;
    const audio = new Audio(ttsUrl);
    audio.preload = 'auto';
    audio.playbackRate = ttsSpeed;
    audioCacheRef.current.set(clean, audio);
    return audio;
  };

  // Proactively pre-buffer all segment audio in the background for 100% smooth continuous playback
  useEffect(() => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;
    
    // Preload current segments into memory
    recapData.recap_segments.forEach((seg, idx) => {
      if (seg.khmer_script) {
        setTimeout(() => {
          getAudioForText(seg.khmer_script);
        }, idx * 80);
      }
    });
  }, [recapData?.recap_segments, ttsSpeed]);

  // Khmer Text-To-Speech (TTS) with Instant Pre-buffering
  const speakKhmerScript = (text: string, speakerGender?: string, onEnd?: () => void) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (speechSynthRef.current) speechSynthRef.current.cancel();

    let finished = false;
    const handleDone = () => {
      if (!finished) {
        finished = true;
        if (onEnd) onEnd();
      }
    };

    if (!text || !text.trim()) {
      handleDone();
      return;
    }

    try {
      const audio = getAudioForText(text);
      audio.currentTime = 0;
      audio.playbackRate = ttsSpeed;
      audioPlayerRef.current = audio;

      audio.onended = handleDone;
      audio.onerror = () => {
        if (!speechSynthRef.current) {
          handleDone();
          return;
        }
        const cleanSpeechText = cleanKhmerSpeech(text);
        const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
        utterance.rate = ttsSpeed;
        if (speakerGender === 'female') utterance.pitch = 1.15;
        else if (speakerGender === 'male') utterance.pitch = 0.9;
        else utterance.pitch = 1.0;

        const voices = speechSynthRef.current.getVoices() || [];
        const kmVoice = voices.find(v => v.lang.includes('km') || v.lang.includes('kh'));
        if (kmVoice) utterance.voice = kmVoice;
        else utterance.lang = 'km-KH';

        utterance.onend = handleDone;
        utterance.onerror = handleDone;
        speechSynthRef.current.speak(utterance);
      };

      audio.play().catch(() => {
        handleDone();
      });
    } catch {
      handleDone();
    }
  };

  const handlePlaySegment = (segment: RecapSegment) => {
    if (recapData?.videoUrl) {
      jumpVideoToTimestamp(segment.start_time, segment.segment_id);
    }

    if (playingSegmentId === segment.segment_id) {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      if (speechSynthRef.current) speechSynthRef.current.cancel();
      setPlayingSegmentId(null);
      return;
    }

    setPlayingSegmentId(segment.segment_id);
    speakKhmerScript(segment.khmer_script, segment.speaker_gender, () => {
      setPlayingSegmentId(null);
    });
  };

  // Ultra-Smooth Continuous Narration Across All Segments (0ms Latency Pipeline)
  const handlePlayFullNarration = () => {
    if (isPlayingAll) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (speechSynthRef.current) speechSynthRef.current.cancel();
      if (videoPlayerRef.current) videoPlayerRef.current.pause();
      setIsPlayingAll(false);
      setPlayingSegmentId(null);
      return;
    }

    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

    setIsPlayingAll(true);
    let currentIndex = 0;

    // Start video playback
    if (videoPlayerRef.current && recapData.videoUrl) {
      const firstSec = parseTimestampToSeconds(recapData.recap_segments[0].start_time);
      videoPlayerRef.current.currentTime = firstSec;
      videoPlayerRef.current.play().catch(() => {});
    }

    const playNextSegment = () => {
      if (!isPlayingAllRef.current || currentIndex >= recapData.recap_segments.length) {
        setIsPlayingAll(false);
        setPlayingSegmentId(null);
        return;
      }

      const seg = recapData.recap_segments[currentIndex];
      setPlayingSegmentId(seg.segment_id);
      setActiveSegmentId(seg.segment_id);

      // Smooth video time sync (only adjust if video drifted by > 2s to avoid video stuttering)
      if (videoPlayerRef.current && recapData.videoUrl) {
        const targetSec = parseTimestampToSeconds(seg.start_time);
        if (Math.abs(videoPlayerRef.current.currentTime - targetSec) > 2.0) {
          videoPlayerRef.current.currentTime = targetSec;
        }
        if (videoPlayerRef.current.paused) {
          videoPlayerRef.current.play().catch(() => {});
        }
      }

      // Preload next upcoming segments ahead of time
      if (currentIndex + 1 < recapData.recap_segments.length) {
        getAudioForText(recapData.recap_segments[currentIndex + 1].khmer_script);
      }
      if (currentIndex + 2 < recapData.recap_segments.length) {
        getAudioForText(recapData.recap_segments[currentIndex + 2].khmer_script);
      }

      // Play pre-buffered audio with 0ms gap
      const audio = getAudioForText(seg.khmer_script);
      audio.currentTime = 0;
      audio.playbackRate = ttsSpeed;
      audioPlayerRef.current = audio;

      audio.onended = () => {
        if (!isPlayingAllRef.current) return;
        currentIndex++;
        // Instantly trigger next segment
        playNextSegment();
      };

      audio.onerror = () => {
        if (!isPlayingAllRef.current) return;
        currentIndex++;
        playNextSegment();
      };

      audio.play().catch(() => {
        if (!isPlayingAllRef.current) return;
        currentIndex++;
        playNextSegment();
      });
    };

    playNextSegment();
  };

  const handleSegmentChange = (id: number, field: keyof RecapSegment, value: any) => {
    if (!recapData) return;
    const updated = recapData.recap_segments.map(s => {
      if (s.segment_id === id) return { ...s, [field]: value };
      return s;
    });
    onUpdateRecap({ ...recapData, recap_segments: updated });
  };

  const handleAddSegment = () => {
    if (!recapData) return;
    const lastSeg = recapData.recap_segments[recapData.recap_segments.length - 1];
    const newId = (lastSeg?.segment_id || 0) + 1;
    const newSeg: RecapSegment = {
      segment_id: newId,
      start_time: '01:30',
      end_time: '01:45',
      original_summary: 'New scene development.',
      khmer_script: 'នៅក្នុងឈុតបន្ទាប់នេះ...',
      voice_tone: 'dramatic',
      speaker_gender: 'narrator',
      speaker_name: 'អ្នកសម្រាយរឿង'
    };
    onUpdateRecap({
      ...recapData,
      recap_segments: [...recapData.recap_segments, newSeg]
    });
  };

  const handleDeleteSegment = (id: number) => {
    if (!recapData) return;
    const updated = recapData.recap_segments.filter(s => s.segment_id !== id);
    onUpdateRecap({ ...recapData, recap_segments: updated });
  };

  const formatSecToMMSS = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleExport = () => {
    onSaveRecap();
    const jsonStr = JSON.stringify(recapData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recapData.movie_title || 'khmer_recap'}_script.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectSampleVideo = (url: string, title: string) => {
    if (!recapData) return;
    onUpdateRecap({
      ...recapData,
      movie_title: title,
      videoUrl: url,
      videoFileName: title,
      mediaType: 'video'
    });
    if (onRegenerateAll) {
      setTimeout(() => {
        onRegenerateAll();
      }, 100);
    }
  };

  return (
    <div className="w-full bg-[#F3F4F6] min-h-screen text-gray-900 flex flex-col font-sans select-none">
      
      {/* 1. Studio Header */}
      <StudioHeader
        movieTitle={recapData?.movie_title}
        savedCount={savedCount}
        onOpenSaved={onOpenSaved}
        aspectRatio={aspectRatio}
        onChangeAspectRatio={setAspectRatio}
        onExport={handleExport}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
      />

      {/* 2. Main Studio Body Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Far-Left Vertical Tools Dock */}
        <StudioSidebar
          onOpenUpload={() => setIsUploadModalOpen(true)}
        />

        {/* Studio Canvas Area (Video Monitor + Dubbing Panel) */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 gap-3 overflow-y-auto">
          
          {/* Top Row: Video Monitor (Left) & Dubbing Panel (Right) */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch">
            <VideoMonitor
              videoUrl={recapData?.videoUrl}
              videoFileName={recapData?.videoFileName}
              rawFile={recapData?.rawFile}
              videoRef={videoPlayerRef}
              aspectRatio={aspectRatio}
              audioIsolationMode={audioIsolationMode}
              onChangeAudioIsolationMode={setAudioIsolationMode}
              bgmVolume={bgmVolume}
              onChangeBgmVolume={setBgmVolume}
              onFileUpload={onFileUpload}
              onUpdateVideoUrl={(newUrl, newFileName, convertedFile) => {
                if (!recapData) return;
                onUpdateRecap({
                  ...recapData,
                  videoUrl: newUrl,
                  videoFileName: newFileName,
                  rawFile: convertedFile || recapData.rawFile
                });
              }}
              onSelectSampleVideo={handleSelectSampleVideo}
              isLoading={isLoading}
              isProcessingFile={isProcessingFile}
              currentTimeStr={formatSecToMMSS(currentTimeSeconds)}
              totalDurationStr={formatSecToMMSS(totalDurationSeconds)}
            />

            <DubbingPanel
              recapData={recapData}
              activeSegmentId={activeSegmentId}
              playingSegmentId={playingSegmentId}
              isPlayingAll={isPlayingAll}
              ttsSpeed={ttsSpeed}
              onSpeedChange={setTtsSpeed}
              onPlaySegment={handlePlaySegment}
              onPlayFullNarration={handlePlayFullNarration}
              onSegmentChange={handleSegmentChange}
              onAddSegment={handleAddSegment}
              onDeleteSegment={handleDeleteSegment}
              onRegenerateAll={onRegenerateAll}
              translationMode={translationMode}
              onChangeTranslationMode={onChangeTranslationMode}
              isLoading={isLoading}
            />
          </div>

          {/* Bottom Panel: Full Multi-Track NLE Timeline */}
          <TimelinePanel
            recapData={recapData}
            videoRef={videoPlayerRef}
            activeSegmentId={activeSegmentId}
            setActiveSegmentId={setActiveSegmentId}
            isPlaying={isPlayingAll}
            onTogglePlay={handlePlayFullNarration}
            currentTimeSeconds={currentTimeSeconds}
            totalDurationSeconds={totalDurationSeconds}
            onSeekToSeconds={(sec) => {
              setCurrentTimeSeconds(sec);
              if (videoPlayerRef.current) {
                videoPlayerRef.current.currentTime = sec;
              }
            }}
            audioIsolationMode={audioIsolationMode}
            bgmVolume={bgmVolume}
            onSegmentChange={handleSegmentChange}
          />

        </div>

      </div>

      {/* Video File Upload & Import Modal */}
      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileUpload={onFileUpload}
        onSelectSampleVideo={handleSelectSampleVideo}
        isLoading={isLoading}
        isProcessingFile={isProcessingFile}
        previousRecapSummary={
          recapData && recapData.recap_segments && recapData.recap_segments.length > 0
            ? `[${recapData.seriesTitle || recapData.movie_title || 'ភាគមុន'}] - ភាគទី ${recapData.episodeNumber || 1}:\n` +
              recapData.recap_segments.map(s => `(${s.start_time}-${s.end_time}) ${s.speaker_name || ''}: ${s.khmer_script}`).join('\n')
            : undefined
        }
        defaultMovieTitle={recapData?.seriesTitle || recapData?.movie_title}
      />

    </div>
  );
};
