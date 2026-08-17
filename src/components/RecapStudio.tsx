import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MovieRecapResult, RecapSegment, TranslationMode } from '../types';
import { StudioHeader } from './StudioHeader';
import { StudioSidebar } from './StudioSidebar';
import { VideoMonitor, AudioIsolationMode } from './VideoMonitor';
import { DubbingPanel } from './DubbingPanel';
import { TimelinePanel } from './TimelinePanel';
import { VideoUploadModal } from './VideoUploadModal';
import { extractBgmInstrumentalTrack } from '../utils/vocalRemover';
import { ToastContainer, ToastMessage, ToastType } from './ToastNotification';

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
  onOpenApiKeyModal?: () => void;
  hasCustomApiKey?: boolean;
  onOpenTikTokModal?: () => void;
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
  onChangeTranslationMode,
  onOpenApiKeyModal,
  hasCustomApiKey,
  onOpenTikTokModal
}) => {
  // Studio UI state
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastType, title: string, message?: string) => {
    const newToast: ToastMessage = {
      id: `toast_${Date.now()}_${Math.random()}`,
      type,
      title,
      message,
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };
  
  // Audio & Playback state
  const [playingSegmentId, setPlayingSegmentId] = useState<number | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState<boolean>(false);
  const [activeSegmentId, setActiveSegmentId] = useState<number>(1);
  
  // Advanced Audio Isolation & BGM state
  const [audioIsolationMode, setAudioIsolationMode] = useState<AudioIsolationMode>('remove_vocals_keep_bgm');
  const [bgmVolume, setBgmVolume] = useState<number>(45); // 45% background music
  const [selectedBgmId, setSelectedBgmId] = useState<string>('extracted');
  const [isExtractingBgm, setIsExtractingBgm] = useState<boolean>(false);
  const [bgmExtractProgress, setBgmExtractProgress] = useState<number>(0);
  const [bgmExtractStatus, setBgmExtractStatus] = useState<string>('');
  
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.25); // Default 1.25x for fast, lively recap delivery!
  const [globalVoicePersona, setGlobalVoicePersona] = useState<string>('auto');
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(69);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(279);

  // Active BGM Audio URL: Exclusively uses the AI-extracted instrumental track from the movie
  const activeBgmUrl = useMemo(() => {
    if (selectedBgmId === 'none') return '';
    return recapData?.bgmTrackUrl || '';
  }, [selectedBgmId, recapData?.bgmTrackUrl]);

  // Refs for video & speech audio
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesis | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferCache = useRef<Map<string, AudioBuffer>>(new Map());

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthRef.current = window.speechSynthesis;
    }

    // Pre-unlock audio subsystem on user interaction
    const unlockAudio = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      if (!bgmAudioRef.current) {
        bgmAudioRef.current = new Audio();
      }
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      if (speechSynthRef.current) speechSynthRef.current.cancel();
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      if (bgmAudioRef.current) bgmAudioRef.current.pause();
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch (e) {}
      }
    };
  }, []);

  // Synchronize BGM Audio Element with extracted or selected cinematic BGM track
  useEffect(() => {
    if (!bgmAudioRef.current) {
      bgmAudioRef.current = new Audio();
      bgmAudioRef.current.loop = true;
      bgmAudioRef.current.preload = 'auto';
    }
    const bgm = bgmAudioRef.current;
    if (activeBgmUrl && bgm.src !== activeBgmUrl) {
      bgm.src = activeBgmUrl;
      bgm.load();
    }
  }, [activeBgmUrl]);

  // Synchronize Video & BGM Soundtrack Audio Volume & Play State
  useEffect(() => {
    const video = videoPlayerRef.current;
    const bgm = bgmAudioRef.current;
    const isCurrentlySpeaking = playingSegmentId !== null;

    // 1. Play Isolated BGM Soundtrack with Smart Dynamic Volume
    if (bgm && activeBgmUrl) {
      const duckMultiplier = isCurrentlySpeaking ? 0.60 : 1.0;
      const effectiveBgmVol = (bgmVolume / 100) * duckMultiplier;
      bgm.volume = Math.max(0, Math.min(1, effectiveBgmVol));

      if (isPlayingAll || playingSegmentId !== null || (video && !video.paused)) {
        if (
          video && 
          !isNaN(video.currentTime) && 
          bgm.readyState >= 2 &&
          Math.abs(bgm.currentTime - video.currentTime) > 0.4
        ) {
          try {
            bgm.currentTime = video.currentTime;
          } catch (e) {}
        }
        bgm.play().catch(() => {});
      } else {
        bgm.pause();
      }
    } else if (bgm) {
      bgm.pause();
    }

    // 2. Manage Raw Video Audio Volume
    if (video) {
      if (
        (recapData?.bgmTrackUrl && selectedBgmId === 'extracted') ||
        audioIsolationMode === 'remove_vocals_keep_bgm' ||
        audioIsolationMode === 'mute_all_original' ||
        bgmVolume === 0
      ) {
        // When in vocal removal mode or playing isolated BGM, ALWAYS mute raw video audio
        // to prevent foreign dialogue from leaking or playing in the background
        video.muted = true;
        video.volume = 0.0;
      } else {
        // Fallback only if user explicitly disables vocal removal
        video.muted = false;
        const duckRatio = isCurrentlySpeaking ? 0.30 : 1.0;
        video.volume = Math.max(0, Math.min(1, (bgmVolume / 100) * duckRatio));
      }
    }
  }, [audioIsolationMode, playingSegmentId, isPlayingAll, activeBgmUrl, recapData?.bgmTrackUrl, bgmVolume, selectedBgmId]);

  // AI Vocal Remover & Instrumental BGM Extraction Handler
  const handleExtractBgm = async () => {
    if (!recapData) return;

    let sourceFile = recapData.rawFile;
    if (!sourceFile && recapData.videoUrl) {
      try {
        setIsExtractingBgm(true);
        setBgmExtractProgress(5);
        setBgmExtractStatus('កំពុងរៀបចំហ្វាយវីដេអូសម្រាប់ញែក...');
        const fetchUrl = recapData.videoUrl.startsWith('http') && !recapData.videoUrl.startsWith('blob:') && !recapData.videoUrl.includes('localhost:3000')
          ? `/api/proxy-media?url=${encodeURIComponent(recapData.videoUrl)}`
          : recapData.videoUrl;
        const res = await fetch(fetchUrl);
        const blob = await res.blob();
        sourceFile = new File([blob], recapData.videoFileName || 'video.mp4', { type: blob.type || 'video/mp4' });
      } catch (e) {
        console.warn('Could not fetch source video blob for vocal extraction:', e);
      }
    }

    if (!sourceFile) {
      showToast('warning', 'សូម Upload វីដេអូដើម', 'សូមជ្រើសរើស ឬ Upload វីដេអូដើម្បីដំណើរការ AI Vocal Remover');
      return;
    }

    try {
      setIsExtractingBgm(true);
      setBgmExtractProgress(15);
      setBgmExtractStatus('កំពុងដំណើរការ AI Vocal Remover...');

      const { file: bgmFile, blobUrl: bgmUrl } = await extractBgmInstrumentalTrack(
        sourceFile,
        (progress, status) => {
          setBgmExtractProgress(progress);
          setBgmExtractStatus(status);
        }
      );

      // Save to recapData
      onUpdateRecap({
        ...recapData,
        bgmTrackUrl: bgmUrl,
        bgmFileName: bgmFile.name,
      });

      setSelectedBgmId('extracted');
      setAudioIsolationMode('remove_vocals_keep_bgm');
      setIsExtractingBgm(false);
    } catch (err: any) {
      console.error('Failed to extract BGM track:', err);
      setIsExtractingBgm(false);
    }
  };

  // Automatically Trigger Python AI Vocal Removal in background when video is loaded!
  const hasAutoExtractedRef = useRef<string>('');
  useEffect(() => {
    if (!recapData || isExtractingBgm) return;
    if (recapData.bgmTrackUrl) return; // already extracted
    if (!recapData.rawFile && !recapData.videoUrl) return;

    const videoId = recapData.videoFileName || recapData.videoUrl || '';
    if (!videoId || hasAutoExtractedRef.current === videoId) return;

    hasAutoExtractedRef.current = videoId;
    console.log('⚡ Auto-triggering Python AI Vocal Removal for video:', videoId);
    handleExtractBgm();
  }, [recapData?.videoUrl, recapData?.videoFileName, recapData?.rawFile, recapData?.bgmTrackUrl]);

  // References for live timeline tracking & speech coordination
  const activeSegmentIdRef = useRef<number>(activeSegmentId);
  activeSegmentIdRef.current = activeSegmentId;
  const lastSpokenSegmentIdRef = useRef<number | null>(null);
  const isPlayingAllRef = useRef<boolean>(false);
  isPlayingAllRef.current = isPlayingAll;
  const isSpeakingRef = useRef<boolean>(false);

  // Helper to parse timestamp MM:SS or HH:MM:SS to seconds
  const parseTimestampToSeconds = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map(Number);
    if (parts.length === 2) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    if (parts.length === 3) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    return 0;
  };

  // Helper to format seconds into MM:SS
  const formatSecToMMSS = (sec: number): string => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Video Time Update & Segment Tracking Loop
  useEffect(() => {
    const video = videoPlayerRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const current = Math.floor(video.currentTime);
      setCurrentTimeSeconds(current);

      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setTotalDurationSeconds(Math.floor(video.duration));
      }

      if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

      // Find matching segment for current video second
      const currentSegment = recapData.recap_segments.find((seg) => {
        const start = parseTimestampToSeconds(seg.start_time);
        const end = parseTimestampToSeconds(seg.end_time);
        return current >= start && current < end;
      });

      if (currentSegment && currentSegment.segment_id !== activeSegmentIdRef.current) {
        setActiveSegmentId(currentSegment.segment_id);
      }

      // Trigger automatic segment speech in real-time sync with video!
      // Guarantees each character line speaks completely without cutting off in mid-sentence
      if (
        currentSegment &&
        currentSegment.segment_id !== lastSpokenSegmentIdRef.current &&
        !video.paused &&
        !isSpeakingRef.current
      ) {
        lastSpokenSegmentIdRef.current = currentSegment.segment_id;
        setPlayingSegmentId(currentSegment.segment_id);
        speakKhmerScript(currentSegment.khmer_script, currentSegment.speaker_gender, () => {
          setPlayingSegmentId((prev) => (prev === currentSegment.segment_id ? null : prev));
        });
      }
    };

    const handlePause = () => {
      // Pause speech if video pauses
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
        } catch (e) {}
      }
      if (bgmAudioRef.current) {
        try {
          bgmAudioRef.current.pause();
        } catch (e) {}
      }
      setIsPlayingAll(false);
      isPlayingAllRef.current = false;
      setPlayingSegmentId(null);
    };

    const handlePlay = () => {
      // Play BGM in sync with video
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = video.currentTime;
          bgmAudioRef.current.play().catch(() => {});
        } catch (e) {}
      }
      handleTimeUpdate();
    };

    const handleSeek = () => {
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = video.currentTime;
        } catch (e) {}
      }
      handleTimeUpdate();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    video.addEventListener('seeked', handleSeek);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('seeked', handleSeek);
    };
  }, [recapData?.videoUrl, recapData?.recap_segments, activeBgmUrl]);

  const jumpVideoToTimestamp = (startTimeStr: string, segId?: number) => {
    if (segId) {
      setActiveSegmentId(segId);
      lastSpokenSegmentIdRef.current = segId;
    } else {
      lastSpokenSegmentIdRef.current = null;
    }
    const seconds = parseTimestampToSeconds(startTimeStr);

    if (bgmAudioRef.current && recapData?.bgmTrackUrl) {
      bgmAudioRef.current.currentTime = seconds;
    }

    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = seconds;
      
      // Control video volume dynamically
      if (recapData?.bgmTrackUrl) {
        videoPlayerRef.current.muted = true;
        videoPlayerRef.current.volume = 0.0;
      } else if (audioIsolationMode === 'mute_all_original' || bgmVolume === 0) {
        videoPlayerRef.current.muted = true;
        videoPlayerRef.current.volume = 0.0;
      } else if (audioIsolationMode === 'original_unmodified') {
        videoPlayerRef.current.muted = false;
        videoPlayerRef.current.volume = 1.0;
      } else {
        // Play original movie audio ducked slightly while Khmer voice prepares
        videoPlayerRef.current.muted = false;
        videoPlayerRef.current.volume = Math.max(0, Math.min(1, (bgmVolume / 100) * 0.20));
      }

      videoPlayerRef.current.play().catch(() => {});
    }
  };

  // Helper to clean Khmer speech text, strip speaker prefixes, and transliterate foreign words
  const cleanKhmerSpeech = (text: string): string => {
    if (!text) return '';
    let cleaned = text
      // Strip leading speaker label prefixes like "តួប្រុស:", "តួស្រី:", "អ្នកសម្រាយ:"
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
      .replace(/[\r\n]+/g, ' ')
      // Strip any remaining Latin letters to prevent TTS English glitches
      .replace(/[a-zA-Z]+/g, '')
      .replace(/[^\u1780-\u17FF0-9\s.,!?្៌៍៏័៎ិីឹឺុូួើឿៀេែៃោៅំះៈ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned;
  };

  // Khmer Text-To-Speech (TTS) with Male/Female Pitch Modulation & Multi-Tier Fallback
  const speakKhmerScript = (text: string, speakerGender?: string, onEnd?: () => void) => {
    // 1. Stop any currently active audio or speech synthesis without destroying the persistent player instance
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch (e) {}
    }
    if (speechSynthRef.current) {
      try {
        speechSynthRef.current.cancel();
      } catch (e) {}
    }

    let finished = false;
    const handleDone = () => {
      if (!finished) {
        finished = true;
        isSpeakingRef.current = false;
        if (onEnd) onEnd();
      }
    };

    if (!text || !text.trim()) {
      handleDone();
      return;
    }

    const cleanText = cleanKhmerSpeech(text);
    if (!cleanText) {
      handleDone();
      return;
    }

    isSpeakingRef.current = true;

    // Determine effective persona: either globally selected or auto-detected from scene
    const effectiveGender = (
      globalVoicePersona !== 'auto' 
        ? globalVoicePersona 
        : (speakerGender || 'female')
    ).toLowerCase();

    // Helper to calculate character voice pitch for Web Speech fallback
    const getCharacterPitch = (gender: string): number => {
      switch (gender) {
        case 'child':
          return 1.40; // Cute energetic child voice
        case 'female':
          return 1.18; // Sweet, bright female heroine voice
        case 'female_elder':
          return 1.05; // Grandmother voice
        case 'narrator':
          return 0.95; // Balanced narrator voice
        case 'male':
          return 0.82; // Deep resonant male hero voice
        case 'male_elder':
          return 0.72; // Deep elder grandfather voice
        case 'villain':
          return 0.68; // Dark menacing villain voice
        default:
          return 1.0;
      }
    };

    // Stop any previously playing Web Audio buffer source
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {}
      currentSourceRef.current = null;
    }

    // Convert speed to energetic Microsoft Neural Speech rate
    let edgeRate = '+25%';
    if (ttsSpeed >= 1.45) edgeRate = '+45%';
    else if (ttsSpeed >= 1.30) edgeRate = '+36%';
    else if (ttsSpeed >= 1.20) edgeRate = '+30%';
    else if (ttsSpeed >= 1.10) edgeRate = '+25%';
    else if (ttsSpeed <= 0.95) edgeRate = '+12%';

    const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}`;

    // Reuse persistent pre-unlocked Audio element so Chrome never blocks playback during timeupdate events
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }
    const audio = audioPlayerRef.current;
    audio.src = ttsUrl;
    audio.preload = 'auto';
    audio.volume = 1.0;
    audio.playbackRate = 1.0;

    audio.onended = () => {
      handleDone();
    };

    audio.onerror = (e) => {
      console.warn('Audio playback error:', e);
      handleDone();
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((playErr) => {
        console.warn('Audio play() rejected:', playErr);
        handleDone();
      });
    }
  };

  const handlePlaySegment = (segment: RecapSegment) => {
    // If currently playing this segment, stop it
    if (playingSegmentId === segment.segment_id) {
      isSpeakingRef.current = false;
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch (e) {}
        currentSourceRef.current = null;
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch (e) {}
      }
      if (speechSynthRef.current) {
        try {
          speechSynthRef.current.cancel();
        } catch (e) {}
      }
      if (videoPlayerRef.current) {
        try {
          videoPlayerRef.current.pause();
        } catch (e) {}
      }
      setPlayingSegmentId(null);
      setIsPlayingAll(false);
      isPlayingAllRef.current = false;
      return;
    }

    setIsPlayingAll(false);
    isPlayingAllRef.current = false;
    setPlayingSegmentId(segment.segment_id);
    setActiveSegmentId(segment.segment_id);
    lastSpokenSegmentIdRef.current = segment.segment_id;

    // Jump video to segment start time and play
    if (videoPlayerRef.current && recapData?.videoUrl) {
      const seconds = parseTimestampToSeconds(segment.start_time);
      videoPlayerRef.current.currentTime = seconds;
      videoPlayerRef.current.play().catch(() => {});
    }

    speakKhmerScript(segment.khmer_script, segment.speaker_gender, () => {
      setPlayingSegmentId((prev) => (prev === segment.segment_id ? null : prev));
    });
  };

  // Continuous Movie Dubbing Playback from start to finish without skipping scenes
  const handlePlayFullNarration = () => {
    if (isPlayingAll) {
      isSpeakingRef.current = false;
      isPlayingAllRef.current = false;
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch (e) {}
      }
      if (videoPlayerRef.current) {
        try {
          videoPlayerRef.current.pause();
        } catch (e) {}
      }
      setIsPlayingAll(false);
      setPlayingSegmentId(null);
      return;
    }

    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

    setIsPlayingAll(true);
    isPlayingAllRef.current = true;
    lastSpokenSegmentIdRef.current = null;

    if (videoPlayerRef.current) {
      // Play continuously from start to finish in real-time (no jumping/skipping!)
      if (videoPlayerRef.current.currentTime >= (videoPlayerRef.current.duration || 9999) - 0.5) {
        videoPlayerRef.current.currentTime = 0;
      }
      videoPlayerRef.current.play().catch(() => {});
    }
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
        onOpenApiKeyModal={onOpenApiKeyModal}
        hasCustomApiKey={hasCustomApiKey}
        onOpenTikTokModal={onOpenTikTokModal}
        onToast={showToast}
      />

      {/* 2. Main Studio Body Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Far-Left Vertical Tools Dock */}
        <StudioSidebar
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenApiKeyModal={onOpenApiKeyModal}
          hasCustomApiKey={hasCustomApiKey}
        />

        {/* Studio Canvas Area (Video Monitor + Dubbing Panel) */}
        <div className="flex-1 flex flex-col p-2 sm:p-2.5 lg:p-3 xl:p-4 gap-2 lg:gap-2.5 xl:gap-3 overflow-y-auto">
          
          {/* Top Row: Video Monitor (Left) & Dubbing Panel (Right) */}
          <div className="flex flex-col lg:flex-row gap-2 lg:gap-2.5 xl:gap-3 items-stretch">
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
              selectedBgmId={selectedBgmId}
              onChangeSelectedBgmId={setSelectedBgmId}
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
              isPlaying={isPlayingAll || playingSegmentId !== null}
              onTogglePlay={handlePlayFullNarration}
              onExtractBgm={handleExtractBgm}
              isExtractingBgm={isExtractingBgm}
              bgmExtractProgress={bgmExtractProgress}
              bgmExtractStatus={bgmExtractStatus}
              hasBgmTrack={!!recapData?.bgmTrackUrl}
              onAutoDetectAspectRatio={setAspectRatio}
            />

            <DubbingPanel
              recapData={recapData}
              activeSegmentId={activeSegmentId}
              playingSegmentId={playingSegmentId}
              isPlayingAll={isPlayingAll}
              ttsSpeed={ttsSpeed}
              onSpeedChange={setTtsSpeed}
              globalVoicePersona={globalVoicePersona}
              onChangeGlobalVoicePersona={setGlobalVoicePersona}
              onPlaySegment={handlePlaySegment}
              onPlayFullNarration={handlePlayFullNarration}
              onTestVoice={() => speakKhmerScript("សួស្តី! នេះគឺជាការសាកល្បងសំឡេងបកប្រែជាភាសាខ្មែរ។", globalVoicePersona !== 'auto' ? globalVoicePersona : "male")}
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
              lastSpokenSegmentIdRef.current = null;
              if (videoPlayerRef.current) {
                videoPlayerRef.current.currentTime = sec;
              }
              if (bgmAudioRef.current && recapData?.bgmTrackUrl) {
                bgmAudioRef.current.currentTime = sec;
              }
            }}
            audioIsolationMode={audioIsolationMode}
            bgmVolume={bgmVolume}
            onChangeBgmVolume={setBgmVolume}
            onExtractBgm={handleExtractBgm}
            isExtractingBgm={isExtractingBgm}
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

      {/* Floating Modern Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
};
