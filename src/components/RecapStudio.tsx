import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MovieRecapResult, RecapSegment, TranslationMode, WatermarkConfig, ClonedVoiceProfile, SubtitleStyleConfig, VoiceRolesMapping, WatermarkCleanerConfig, LipSyncConfig, RecapFolder } from '../types';
import { StudioHeader } from './StudioHeader';
import { StudioSidebar } from './StudioSidebar';
import { VideoMonitor, AudioIsolationMode } from './VideoMonitor';
import { DubbingPanel } from './DubbingPanel';
import { TimelinePanel } from './TimelinePanel';
import { VideoUploadModal } from './VideoUploadModal';
import { WatermarkModal } from './WatermarkModal';
import { WatermarkCleanerModal } from './WatermarkCleanerModal';
import { BgmSeparatorModal } from './BgmSeparatorModal';
import { LipSyncModal } from './LipSyncModal';
import { ExportModal } from './ExportModal';
import { SubtitleStyleModal } from './SubtitleStyleModal';
import { VideoCompressorModal } from './VideoCompressorModal';
import { ReelsThumbnailModal } from './ReelsThumbnailModal';
import { extractBgmInstrumentalTrack } from '../utils/vocalRemover';
import { ToastContainer, ToastMessage, ToastType } from './ToastNotification';
import { parseTimecode } from '../utils/sequenceUtils';
import { incrementDailyUsage } from '../utils/apiQuotaTracker';

interface RecapStudioProps {
  recapData: MovieRecapResult;
  onUpdateRecap: (updated: MovieRecapResult, oldTitle?: string) => void;
  onSaveRecap: () => void;
  isSaved: boolean;
  onOpenSaved: () => void;
  savedCount: number;
  savedRecaps?: MovieRecapResult[];
  folders?: RecapFolder[];
  onSelectRecap?: (recap: MovieRecapResult) => void;
  onFileUpload: (file: File, episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }) => void;
  isLoading: boolean;
  isProcessingFile: boolean;
  onRegenerateAll?: () => void;
  translationMode: TranslationMode;
  onChangeTranslationMode: (mode: TranslationMode) => void;
  onOpenApiKeyModal?: () => void;
  hasCustomApiKey?: boolean;
  onOpenTikTokModal?: () => void;
  activeMode?: 'dubbing' | 'sequence' | 'cutter';
  onSwitchMode?: (mode: 'dubbing' | 'sequence' | 'cutter') => void;
  onInsertToSequence?: () => void;
  onInsertFolderToSequence?: (folderName: string, items: MovieRecapResult[]) => void;
  saveStatus?: 'saved' | 'saving' | 'error';
  globalVoicePersona?: string;
  onChangeGlobalVoicePersona?: (persona: string) => void;
  ttsSpeed?: number;
  onChangeTtsSpeed?: (speed: number) => void;
  onOpenUpdateModal?: () => void;
}

function inferSpeakerGenderClient(khmerScript: string = '', originalSummary: string = '', speakerName: string = ''): { gender: string; name: string } {
  const text = `${speakerName} ${khmerScript} ${originalSummary}`.toLowerCase();

  // 1. Grandparents / Elders (មនុស្សចាស់)
  if (/តាចាស់|លោកតា|តា\s|តាឡៅ|តា\b|ព្រឹទ្ធាចារ្យ|grandpa|grandfather|old man|elderly/i.test(text)) {
    return { gender: 'male_elder', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'លោកតា' };
  }
  if (/យាយចាស់|លោកយាយ|យាយ\s|យាយ\b|ព្រឹទ្ធាចារ្យស្រី|grandma|grandmother|old woman/i.test(text)) {
    return { gender: 'female_elder', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'លោកយាយ' };
  }

  // 2. Little Boys (👦 ក្មេងប្រុស)
  if (/ក្មេងប្រុស|កូនប្រុសតូច|ស៊ាវប៉ៅ|ស៊ាវហួរ|កូនតូចប្រុស|ប្អូនប្រុសតូច|អាប្រុស|ចៅប្រុស|អាប៉ាវ|little boy|schoolboy|young son|little brother|boy\b|son\b/i.test(text)) {
    return { gender: 'child_boy', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ក្មេងប្រុស' };
  }

  // 3. Little Girls (👧 ក្មេងស្រី)
  if (/ក្មេងស្រី|កូនស្រីតូច|ប្អូនស្រីតូច|អាស្រី|ចៅស្រី|little girl|schoolgirl|young daughter|little sister|girl\b|daughter\b/i.test(text)) {
    return { gender: 'child_girl', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ក្មេងស្រី' };
  }

  // 4. Generic child words (Default boy if male-sounding, else boy child)
  if (/កូនតូច|ក្មេង|កុមារ|ក្ដៅខ្លួន|baby|kid|child/i.test(text)) {
    if (/ស្រី|girl|daughter/i.test(text)) {
      return { gender: 'child_girl', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ក្មេងស្រី' };
    }
    return { gender: 'child_boy', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ក្មេងប្រុស' };
  }

  // 5. Villains / Bad Guys (😈 តួកាច)
  if (/តួកាច|មេបិសាច|ចោរ|ឧក្រិដ្ឋជន|មេក្រុមឧក្រិដ្ឋជន|ឃាតករ|villain|monster|demon|thief|criminal|killer|gangster/i.test(text)) {
    return { gender: 'villain', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'តួកាច' };
  }

  // 6. Female characters (👩 តួស្រី)
  if (/ឆេងយី|ឆេងយីង|នាង|ស្រី|ប្រពន្ធ|ម៉ាក់|ម្ដាយ|អ្នកស្រី|មីង|កញ្ញា|នារី|ប្អូនស្រី|បងស្រី|sister|woman|mother|wife|female|lady|she|her/i.test(text)) {
    return { gender: 'female', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'តួស្រី' };
  }

  // 7. Male characters (👨 តួប្រុស)
  if (/ឡៅចាវ|ឡៅចៅ|ម៉ាកុស|បងប្រុស|ប្ដី|ពូ|លោក|ប៉ា|ឪពុក|កូនប្រុស|មេបញ្ជាការ|ប៉ូលីស|លោកប៉ូលីស|man|brother|father|husband|dad|male|he|him/i.test(text)) {
    return { gender: 'male', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'តួប្រុស' };
  }

  return { gender: 'male', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'តួប្រុស' };
}

export const RecapStudio: React.FC<RecapStudioProps> = ({
  recapData,
  onUpdateRecap,
  onSaveRecap,
  isSaved,
  onOpenSaved,
  savedCount,
  savedRecaps = [],
  folders = [],
  onSelectRecap,
  onFileUpload,
  isLoading,
  isProcessingFile,
  onRegenerateAll,
  translationMode,
  onChangeTranslationMode,
  onOpenApiKeyModal,
  hasCustomApiKey,
  onOpenTikTokModal,
  activeMode = 'dubbing',
  onSwitchMode,
  onInsertToSequence,
  onInsertFolderToSequence,
  saveStatus = 'saved',
  globalVoicePersona = 'auto',
  onChangeGlobalVoicePersona,
  ttsSpeed = 1.25,
  onChangeTtsSpeed,
  onOpenUpdateModal
}) => {
  // Studio UI state
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [mobileActiveTab, setMobileActiveTab] = useState<'video' | 'script' | 'timeline' | 'tools'>('video');
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
  const [bgmVolume, setBgmVolume] = useState<number>(85); // 85% rich background music
  const [selectedBgmId, setSelectedBgmId] = useState<string>('extracted');
  const [isExtractingBgm, setIsExtractingBgm] = useState<boolean>(false);
  const [bgmExtractProgress, setBgmExtractProgress] = useState<number>(0);
  const [bgmExtractStatus, setBgmExtractStatus] = useState<string>('');

  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(0);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(() => {
    return parseTimecode(recapData?.total_recap_duration_est) || 60;
  });

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState<boolean>(false);
  const [isCompressorModalOpen, setIsCompressorModalOpen] = useState<boolean>(false);
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState<boolean>(false);

  const [voiceRolesMapping, setVoiceRolesMapping] = useState<VoiceRolesMapping>(() => {
    try {
      const saved = localStorage.getItem('khmer_dubber_voice_roles_mapping');
      if (saved) return JSON.parse(saved);
    } catch { }
    return { male: 'male', female: 'female', narrator: 'narrator' };
  });

  useEffect(() => {
    ttsAudioCacheRef.current.clear();
  }, [globalVoicePersona, voiceRolesMapping]);

  const handleSaveVoiceRolesMapping = (mapping: VoiceRolesMapping) => {
    setVoiceRolesMapping(mapping);
    try {
      localStorage.setItem('khmer_dubber_voice_roles_mapping', JSON.stringify(mapping));
    } catch { }
    showToast('success', 'បានរក្សាទុកការផ្គូផ្គងសំឡេងតួអង្គជោគជ័យ!');
  };

  const resolveEffectiveVoice = (gender?: string): string => {
    const g = (gender || 'narrator').toLowerCase();

    // 1. If user picked a specific single voice persona globally
    if (globalVoicePersona && globalVoicePersona !== 'auto' && globalVoicePersona !== 'auto_default' && globalVoicePersona !== 'default') {
      return `edge_${globalVoicePersona}`;
    }

    // 2. Auto mapping by character role to native Edge-TTS voices (Piseth & Sreymom)
    if (g === 'male' || g === 'narrator' || g === 'child_boy' || g === 'male_elder' || g === 'villain' || g === 'news_host') {
      return `edge_${g}`;
    }
    if (g === 'female' || g === 'child_girl' || g === 'female_elder' || g === 'child' || g === 'female_lively') {
      return `edge_${g}`;
    }
    return 'edge_piseth';
  };

  // ⚡ Automatic Background Audio Pre-generator & SQLite DB Cacher:
  // Automatically synthesizes and stores every segment in RAM and Database in the background
  // so that when the user clicks Play, it starts instantaneously (0ms) without needing to click any button!
  useEffect(() => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

    let isCancelled = false;
    const segments = recapData.recap_segments;

    let edgeRate = '+25%';
    if (ttsSpeed >= 1.45) edgeRate = '+45%';
    else if (ttsSpeed >= 1.30) edgeRate = '+36%';
    else if (ttsSpeed >= 1.20) edgeRate = '+30%';
    else if (ttsSpeed >= 1.10) edgeRate = '+25%';
    else if (ttsSpeed <= 0.95) edgeRate = '+12%';

    const pregenerateAllInBackground = async () => {
      const concurrency = 3;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < segments.length && !isCancelled) {
          const seg = segments[currentIndex++];
          if (!seg) continue;
          const cleanText = cleanKhmerSpeech(seg.khmer_script);
          if (!cleanText) continue;

          const effectiveGender = resolveEffectiveVoice(seg.speaker_gender).toLowerCase();
          const effectiveEmotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
          const cacheKey = `${effectiveGender}_${effectiveEmotion}_${cleanText}`;

          // If already in client RAM cache, skip
          if (ttsAudioCacheRef.current.has(cacheKey)) continue;

          const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}`;

          try {
            const res = await fetch(ttsUrl);
            if (res.ok && !isCancelled) {
              const audioBlob = await res.blob();
              if (audioBlob.size > 500 && !isCancelled) {
                const objectUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(objectUrl);
                audio.preload = 'auto';
                audio.load();
                ttsAudioCacheRef.current.set(cacheKey, audio);
              }
            }
          } catch (e) {
            // Silently ignore background preloader network hiccups
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, segments.length) }, () => worker());
      await Promise.all(workers);
    };

    const timer = setTimeout(() => {
      pregenerateAllInBackground();
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [recapData?.recap_segments, globalVoicePersona, ttsSpeed]);

  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>(() => {
    try {
      const saved = localStorage.getItem('khmer_recap_watermark_cfg');
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      enabled: true,
      type: 'text',
      text: '@KhmerDubber',
      position: 'top-right',
      opacity: 0.85,
      scale: 1.0,
      color: '#FFFFFF'
    };
  });

  const handleSaveWatermark = (cfg: WatermarkConfig) => {
    setWatermarkConfig(cfg);
    try {
      localStorage.setItem('khmer_recap_watermark_cfg', JSON.stringify(cfg));
    } catch { }
    showToast('success', 'បានកំណត់ Watermark ជោគជ័យ!', `បង្ហាញនៅ៖ ${cfg.position}`);
  };

  const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState<boolean>(false);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleStyleConfig>(() => {
    try {
      const saved = localStorage.getItem('khmer_recap_subtitle_cfg');
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      enabled: true,
      preset: 'tiktok_pop',
      fontFamily: 'Kantumruy Pro',
      fontSize: 'lg',
      position: 'bottom',
      animationType: 'karaoke_word',
      highlightColor: '#FACC15',
      textColor: '#FFFFFF',
      strokeColor: '#000000',
      bgBox: 'shadow'
    };
  });

  const handleSaveSubtitleConfig = (cfg: SubtitleStyleConfig) => {
    setSubtitleConfig(cfg);
    try {
      localStorage.setItem('khmer_recap_subtitle_cfg', JSON.stringify(cfg));
    } catch { }
    showToast('success', 'បានកំណត់ស្ទីល Subtitle ជោគជ័យ!', `Preset: ${cfg.preset}`);
  };

  const [isBgmModalOpen, setIsBgmModalOpen] = useState<boolean>(false);
  const [bgmColabUrl, setBgmColabUrl] = useState<string>(() => {
    return localStorage.getItem('bgm_colab_url') || '';
  });

  const [isWatermarkCleanerModalOpen, setIsWatermarkCleanerModalOpen] = useState<boolean>(false);
  const [watermarkCleanerConfig, setWatermarkCleanerConfig] = useState<WatermarkCleanerConfig>(() => {
    if (recapData?.watermarkCleanerConfig) return recapData.watermarkCleanerConfig;
    try {
      const saved = localStorage.getItem('khmer_recap_cleaner_cfg');
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      enabled: false,
      zones: [
        {
          id: 'zone_bottom_subtitles',
          name: 'លុបអក្សរចិនខាងក្រោម (Bottom Subtitles)',
          xPercent: 5,
          yPercent: 82,
          widthPercent: 90,
          heightPercent: 14,
          method: 'cinematic_backdrop',
          intensity: 12
        }
      ]
    };
  });

  const handleSaveWatermarkCleanerConfig = (cfg: WatermarkCleanerConfig) => {
    setWatermarkCleanerConfig(cfg);
    try {
      localStorage.setItem('khmer_recap_cleaner_cfg', JSON.stringify(cfg));
    } catch { }
    if (recapData) {
      onUpdateRecap({
        ...recapData,
        watermarkCleanerConfig: cfg
      });
    }
    showToast(
      'success',
      'បានកំណត់ AI Logo Cleaner ជោគជ័យ!',
      cfg.enabled ? `បើកដំណើរការលើ ${cfg.zones.length} តំបន់` : 'បានបិទ Logo Cleaner'
    );
  };

  const handleCleanedVideoUpdate = (cleanedUrl: string, cleanedFileName: string) => {
    if (recapData) {
      const updatedCleanerCfg: WatermarkCleanerConfig = {
        ...(recapData.watermarkCleanerConfig || watermarkCleanerConfig),
        enabled: false
      };
      setWatermarkCleanerConfig(updatedCleanerCfg);
      try {
        localStorage.setItem('khmer_recap_cleaner_cfg', JSON.stringify(updatedCleanerCfg));
      } catch { }
      onUpdateRecap({
        ...recapData,
        videoUrl: cleanedUrl,
        videoFileName: cleanedFileName,
        watermarkCleanerConfig: updatedCleanerCfg
      });
    }
  };

  const [isLipSyncModalOpen, setIsLipSyncModalOpen] = useState<boolean>(false);
  const [lipSyncConfig, setLipSyncConfig] = useState<LipSyncConfig>(() => {
    if (recapData?.lipSyncConfig) return recapData.lipSyncConfig;
    try {
      const saved = localStorage.getItem('wav2lip_studio_cfg');
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      enabled: false,
      colabUrl: localStorage.getItem('wav2lip_colab_url') || '',
      faceEnhancer: true,
      pads: [0, 10, 0, 0],
      targetScope: 'all_dialogue'
    };
  });

  const handleSaveLipSyncConfig = (cfg: LipSyncConfig) => {
    setLipSyncConfig(cfg);
    try {
      localStorage.setItem('wav2lip_studio_cfg', JSON.stringify(cfg));
    } catch { }
    if (recapData) {
      onUpdateRecap({
        ...recapData,
        lipSyncConfig: cfg
      });
    }
    showToast(
      'success',
      'បានកំណត់ Wav2Lip AI Lip-Sync ជោគជ័យ!',
      cfg.enabled ? 'បើកដំណើរការលើឈុតសន្ទនាទាំងអស់' : 'បានបិទ Lip-Sync'
    );
  };

  // Automatically detect and normalize character genders (Male, Female, Child, Elder)
  useEffect(() => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;
    const isDialogue = translationMode === 'word_by_word_lip_sync' || translationMode === 'character_dialogue' || translationMode === 'hybrid_recap_dub';
    if (!isDialogue) return;

    let needsUpdate = false;
    const updated = recapData.recap_segments.map(seg => {
      if (!seg.speaker_gender || seg.speaker_gender === 'narrator') {
        needsUpdate = true;
        const inferred = inferSpeakerGenderClient(seg.khmer_script, seg.original_summary, seg.speaker_name);
        return {
          ...seg,
          speaker_gender: inferred.gender,
          speaker_name: inferred.name
        };
      }
      return seg;
    });

    if (needsUpdate) {
      onUpdateRecap({
        ...recapData,
        recap_segments: updated
      });
    }
  }, [recapData?.recap_segments, translationMode]);

  const currentActiveSegment = useMemo(() => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return null;
    return recapData.recap_segments.find(seg => {
      const s = parseTimecode(seg.start_time);
      const e = parseTimecode(seg.end_time);
      return currentTimeSeconds >= s - 0.2 && currentTimeSeconds <= e + 0.3;
    }) || (playingSegmentId !== null ? recapData.recap_segments.find(s => s.segment_id === playingSegmentId) : null);
  }, [recapData?.recap_segments, currentTimeSeconds, playingSegmentId]);

  const handleGenerateHook = () => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

    const dramaticSeg = recapData.recap_segments.find(s => s.voice_tone === 'dramatic' || s.voice_tone === 'tense' || s.voice_tone === 'excited') || recapData.recap_segments[0];
    const cleanScript = dramaticSeg.khmer_script.replace(/^([^\s:៖]+[:៖]\s*)?/, '');
    const hookText = `🔥 ឈុតជក់ចិត្ត! ${cleanScript}`;

    const hookSegment: RecapSegment = {
      segment_id: 1,
      start_time: '00:00.0',
      end_time: '00:03.0',
      original_summary: '[Climactic 3s Intro Hook Highlight]',
      khmer_script: hookText,
      voice_tone: 'excited',
      speaker_gender: 'narrator',
      speaker_name: 'អ្នកសម្រាយ'
    };

    const shiftedSegments = recapData.recap_segments.map((seg, idx) => ({
      ...seg,
      segment_id: idx + 2
    }));

    const updated: MovieRecapResult = {
      ...recapData,
      recap_segments: [hookSegment, ...shiftedSegments]
    };

    onUpdateRecap(updated);
    showToast('success', '🔥 បង្កើត 3s Intro Hook ជោគជ័យ!', 'បានបន្ថែមឈុតទាក់ទាញ 3 វិនាទីដំបូងនៅដើមវីដេអូ។');
  };

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
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferCache = useRef<Map<string, AudioBuffer>>(new Map());

  // References for live timeline tracking & speech coordination
  const activeSegmentIdRef = useRef<number>(activeSegmentId);
  activeSegmentIdRef.current = activeSegmentId;
  const lastSpokenSegmentIdRef = useRef<number | null>(null);
  const isPlayingAllRef = useRef<boolean>(false);
  isPlayingAllRef.current = isPlayingAll;
  const isSpeakingRef = useRef<boolean>(false);
  const ttsAudioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Complete Reset & Synchronization whenever a different recap / story is selected
  useEffect(() => {
    setCurrentTimeSeconds(0);
    setPlayingSegmentId(null);
    setIsPlayingAll(false);
    setActiveSegmentId(1);
    lastSpokenSegmentIdRef.current = null;
    isSpeakingRef.current = false;
    if (ttsAudioCacheRef.current) {
      ttsAudioCacheRef.current.clear();
    }

    if (speechSynthRef.current) {
      try { speechSynthRef.current.cancel(); } catch (e) {}
    }
    if (audioPlayerRef.current) {
      try { audioPlayerRef.current.pause(); } catch (e) {}
    }
    if (bgmAudioRef.current) {
      try {
        bgmAudioRef.current.pause();
        bgmAudioRef.current.currentTime = 0;
      } catch (e) {}
    }
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {}
    }

    const estDuration = parseTimecode(recapData?.total_recap_duration_est) || 0;
    if (estDuration > 0) {
      setTotalDurationSeconds(estDuration);
    }

    if (recapData?.watermarkCleanerConfig) {
      setWatermarkCleanerConfig(recapData.watermarkCleanerConfig);
    }
    if (recapData?.lipSyncConfig) {
      setLipSyncConfig(recapData.lipSyncConfig);
    }

    if (videoPlayerRef.current) {
      try {
        videoPlayerRef.current.currentTime = 0;
        videoPlayerRef.current.pause();
        videoPlayerRef.current.load();
      } catch (e) {}
    }
  }, [(recapData as any)?.id, recapData?.movie_title, recapData?.videoUrl, recapData?.videoFileName]);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => { });
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
        ctx.resume().catch(() => { });
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
        } catch (e) { }
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

  // Initialize Web Audio API Gain Node on BGM element for acoustic amplification (up to 250% loud!)
  useEffect(() => {
    const bgm = bgmAudioRef.current;
    if (!bgm) return;

    if (!audioCtxRef.current && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const gain = ctx.createGain();
          const source = ctx.createMediaElementSource(bgm);
          source.connect(gain);
          gain.connect(ctx.destination);
          audioCtxRef.current = ctx;
          gainNodeRef.current = gain;
          sourceNodeRef.current = source;
        }
      } catch (e) {
        console.warn('Web Audio gain init notice:', e);
      }
    }
  }, []);

  // Synchronize Video & BGM Soundtrack Audio Volume & Play State
  useEffect(() => {
    const video = videoPlayerRef.current;
    const bgm = bgmAudioRef.current;
    const isCurrentlySpeaking = playingSegmentId !== null;

    // 1. Play Isolated BGM Soundtrack with Smart Amplified Volume
    if (bgm && activeBgmUrl) {
      const duckMultiplier = isCurrentlySpeaking ? 0.70 : 1.0;
      const effectiveBgmVol = (bgmVolume / 100) * duckMultiplier;

      // Apply amplified hardware acoustic gain if Web Audio API GainNode is active
      if (gainNodeRef.current && audioCtxRef.current) {
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => { });
        }
        const hardwareGain = effectiveBgmVol * 1.6; // +4.5dB hardware acoustic boost
        gainNodeRef.current.gain.setValueAtTime(hardwareGain, audioCtxRef.current.currentTime);
        bgm.volume = 1.0;
      } else {
        bgm.volume = Math.max(0, Math.min(1, effectiveBgmVol));
      }

      if (isPlayingAll || playingSegmentId !== null || (video && !video.paused)) {
        if (
          video &&
          !isNaN(video.currentTime) &&
          bgm.readyState >= 2 &&
          Math.abs(bgm.currentTime - video.currentTime) > 0.4
        ) {
          try {
            bgm.currentTime = video.currentTime;
          } catch (e) { }
        }
        bgm.play().catch(() => { });
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
    let serverVideoUrl = recapData.videoUrl;

    // If no direct File object, attempt to retrieve it from videoUrl (blob: or /api/media/... or http)
    if (!sourceFile && recapData.videoUrl) {
      if (recapData.videoUrl.startsWith('/api/media/') || recapData.videoUrl.includes('/api/media/')) {
        serverVideoUrl = recapData.videoUrl;
      } else {
        try {
          const res = await fetch(recapData.videoUrl);
          if (res.ok) {
            const blob = await res.blob();
            sourceFile = new File([blob], recapData.videoFileName || 'movie_video.mp4', { type: blob.type || 'video/mp4' });
          }
        } catch (e) {
          console.warn('Notice: Could not fetch blob from videoUrl, will pass videoUrl directly:', e);
        }
      }
    }

    if (!sourceFile && !serverVideoUrl) {
      setIsExtractingBgm(false);
      showToast('warning', 'សូមភ្ជាប់ហ្វាយវីដេអូ', 'សូមចុចប៊ូតុង "📂 ភ្ជាប់វីដេអូ" នៅលើរបារ Toolbar ខាងលើ ដើម្បីញែកយកភ្លេង BGM សម្រាប់រឿងនេះ');
      return;
    }

    try {
      setIsExtractingBgm(true);
      setBgmExtractProgress(5);
      setBgmExtractStatus('កំពុងដំណើរការ Meta Demucs AI...');

      const extractResult = await extractBgmInstrumentalTrack(
        (sourceFile && sourceFile.size > 0) ? sourceFile : null,
        (progress, status) => {
          setBgmExtractProgress(progress);
          setBgmExtractStatus(status);
        },
        recapData.videoFileName,
        serverVideoUrl || recapData.videoUrl,
        bgmColabUrl
      );

      if (!extractResult || !extractResult.blobUrl) {
        throw new Error('មិនអាចទទួលបាន Track ភ្លេង BGM ត្រឹមត្រូវទេ');
      }

      const { file: bgmFile, blobUrl: bgmUrl } = extractResult;

      // Save to recapData & immediately persist to SQLite database
      const updatedRecap = {
        ...recapData,
        bgmTrackUrl: bgmUrl,
        bgmFileName: bgmFile?.name || 'isolated_bgm.wav',
      };
      onUpdateRecap(updatedRecap);

      try {
        await fetch('/api/db/recaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedRecap)
        });
      } catch (e) {
        console.warn('Auto-save BGM to DB notice:', e);
      }

      setSelectedBgmId('extracted');
      setAudioIsolationMode('remove_vocals_keep_bgm');
      showToast('success', 'ញែក BGM បានជោគជ័យ!', 'ភ្លេង BGM ត្រូវបានកាត់សំឡេងនិយាយចេញ និងរក្សាទុកក្នុង Database រួចរាល់');
    } catch (err: any) {
      console.error('Failed to extract BGM track:', err);
      showToast('error', 'បរាជ័យក្នុងការញែក BGM', err?.message || 'មិនអាចញែកភ្លេងបានទេ សូមព្យាយាមម្តងទៀត');
    } finally {
      setIsExtractingBgm(false);
    }
  };

  // Helper to parse timestamp to high-precision seconds
  const parseTimestampToSeconds = (timeStr: string): number => {
    return parseTimecode(timeStr);
  };

  // Helper to format seconds into MM:SS
  const formatSecToMMSS = (sec: number): string => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Proactive Audio Pre-Caching: Sequentially pre-loads TTS audio into memory for 0ms instant trigger latency
  useEffect(() => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

    let isCancelled = false;
    const segments = [...recapData.recap_segments];

    // Priority sort: start with segments closest to current video position, then remaining segments
    const curTime = videoPlayerRef.current?.currentTime || 0;
    segments.sort((a, b) => {
      const diffA = Math.abs(parseTimecode(a.start_time) - curTime);
      const diffB = Math.abs(parseTimecode(b.start_time) - curTime);
      return diffA - diffB;
    });

    const preloadQueue = async () => {
      for (const seg of segments) {
        if (isCancelled) break;
        const cleanText = cleanKhmerSpeech(seg.khmer_script);
        if (!cleanText) continue;

        const effectiveGender = resolveEffectiveVoice(seg.speaker_gender).toLowerCase();
        const effectiveEmotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();

        const cacheKey = `${effectiveGender}_${effectiveEmotion}_${cleanText}`;
        if (!ttsAudioCacheRef.current.has(cacheKey)) {
          let edgeRate = '+25%';
          if (ttsSpeed >= 1.45) edgeRate = '+45%';
          else if (ttsSpeed >= 1.30) edgeRate = '+36%';
          else if (ttsSpeed >= 1.20) edgeRate = '+30%';
          else if (ttsSpeed >= 1.10) edgeRate = '+25%';
          else if (ttsSpeed <= 0.95) edgeRate = '+12%';

          const voiceApiKey = localStorage.getItem('gemini_voice_api_key') || '';
          const voiceApiKeyParam = voiceApiKey ? `&voiceApiKey=${encodeURIComponent(voiceApiKey)}` : '';
          const isDirectEdgeVoice = effectiveGender.startsWith('edge_') || globalVoicePersona === 'auto_default' || globalVoicePersona === 'default';
          const colabUrl = !isDirectEdgeVoice ? (localStorage.getItem('voxcpm2_colab_url') || '').trim() : '';
          const colabUrlParam = colabUrl ? `&colabUrl=${encodeURIComponent(colabUrl)}` : '';
          const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}${voiceApiKeyParam}${colabUrlParam}`;

          await new Promise<void>((resolve) => {
            const audio = new Audio();
            audio.preload = 'auto';
            let settled = false;
            const onSettle = () => {
              if (!settled) {
                settled = true;
                ttsAudioCacheRef.current.set(cacheKey, audio);
                resolve();
              }
            };
            audio.oncanplaythrough = onSettle;
            audio.onloadeddata = onSettle;
            audio.onerror = onSettle;
            // timeout after 4 seconds to ensure queue keeps moving smoothly
            setTimeout(onSettle, 4000);
            audio.src = ttsUrl;
            audio.load();
          });
        }
      }
    };

    preloadQueue();

    return () => {
      isCancelled = true;
    };
  }, [recapData?.recap_segments, globalVoicePersona, ttsSpeed, voiceRolesMapping]);

  // High-Precision 60fps Synchronization Loop (Zero Latency Video-Action Matching)
  useEffect(() => {
    const video = videoPlayerRef.current;
    if (!video) return;

    let animFrameId: number;

    const syncPrecisionLoop = () => {
      const rawCurrentTime = video.currentTime;
      setCurrentTimeSeconds(Math.floor(rawCurrentTime));

      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setTotalDurationSeconds(Math.floor(video.duration));
      }

      if (recapData?.recap_segments && recapData.recap_segments.length > 0 && !video.paused) {
        // High-precision sub-second segment finder
        const currentSegment = recapData.recap_segments.find((seg) => {
          const start = parseTimecode(seg.start_time);
          const end = parseTimecode(seg.end_time);
          return rawCurrentTime >= (start - 0.10) && rawCurrentTime < (end + 0.15);
        });

        if (currentSegment && currentSegment.segment_id !== activeSegmentIdRef.current) {
          setActiveSegmentId(currentSegment.segment_id);
        }

        // Only trigger when not already actively speaking a line
        if (!isSpeakingRef.current) {
          // Find due segment matching current playback time in chronological sequence
          const pendingSegment = recapData.recap_segments.find((seg) => {
            const start = parseTimecode(seg.start_time);
            const end = parseTimecode(seg.end_time);
            return (
              seg.segment_id !== lastSpokenSegmentIdRef.current &&
              rawCurrentTime >= (start - 0.10) &&
              rawCurrentTime < (end + 0.60)
            );
          });

          if (pendingSegment) {
            lastSpokenSegmentIdRef.current = pendingSegment.segment_id;
            setPlayingSegmentId(pendingSegment.segment_id);

            const targetDurationSec = Math.max(0.5, parseTimecode(pendingSegment.end_time) - parseTimecode(pendingSegment.start_time));

            speakKhmerScript(
              pendingSegment.khmer_script,
              pendingSegment.speaker_gender,
              () => {
                setPlayingSegmentId((prev) => (prev === pendingSegment.segment_id ? null : prev));
              },
              targetDurationSec,
              pendingSegment.voice_emotion || pendingSegment.voice_tone
            );
          }
        }
      }

      if (!video.paused) {
        animFrameId = requestAnimationFrame(syncPrecisionLoop);
      }
    };

    const handlePlay = () => {
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = video.currentTime;
          bgmAudioRef.current.play().catch(() => { });
        } catch (e) { }
      }
      cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(syncPrecisionLoop);
    };

    const handlePause = () => {
      cancelAnimationFrame(animFrameId);
      // If video reached the end while TTS is still speaking the final sentence,
      // allow audio to complete speaking naturally until the sentence finishes!
      if (video.ended && isSpeakingRef.current) {
        return;
      }
      if (audioPlayerRef.current) {
        try { audioPlayerRef.current.pause(); } catch (e) { }
      }
      if (bgmAudioRef.current) {
        try { bgmAudioRef.current.pause(); } catch (e) { }
      }
      isSpeakingRef.current = false;
      setIsPlayingAll(false);
      isPlayingAllRef.current = false;
      setPlayingSegmentId(null);
    };

    const handleSeek = () => {
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = video.currentTime;
        } catch (e) { }
      }
      if (audioPlayerRef.current) {
        try { audioPlayerRef.current.pause(); } catch (e) { }
      }
      isSpeakingRef.current = false;
      lastSpokenSegmentIdRef.current = null;
      syncPrecisionLoop();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeek);
    video.addEventListener('timeupdate', syncPrecisionLoop);

    if (!video.paused) {
      animFrameId = requestAnimationFrame(syncPrecisionLoop);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeek);
      video.removeEventListener('timeupdate', syncPrecisionLoop);
    };
  }, [recapData?.videoUrl, recapData?.recap_segments, activeBgmUrl, globalVoicePersona, ttsSpeed]);

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

      videoPlayerRef.current.play().catch(() => { });
    }
  };

  // Helper to clean Khmer speech text, strip speaker prefixes, and transliterate foreign words
  const cleanKhmerSpeech = (text: string): string => {
    if (!text) return '';
    let cleaned = text
      // Strip foreign quotes or Chinese annotations like Orig: "..."
      .replace(/Orig\s*:\s*["'].*?["']/gi, '')
      // Strip purely English metadata annotations like (Note: ...), [Music], [Sound]
      .replace(/\((?:Note|Sound|Music|SFX|Audio|Scene)[^)]*\)/gi, '')
      .replace(/\[(?:Note|Sound|Music|SFX|Audio|Scene)[^\]]*\]/gi, '')
      // Strip only the bracket symbols so Khmer text inside brackets/parentheses is preserved 100%
      .replace(/[()[\]{}]/g, ' ')
      // Strip leading speaker label prefixes ONLY if followed by colon (e.g. "តួប្រុស: ", "អ្នកសម្រាយ: ")
      .replace(/^(?:តួប្រុស|តួស្រី|អ្នកសម្រាយ|អ្នកសម្រាយរឿង|តាចាស់|យាយចាស់|កុមារ|កូនក្មេង|ក្មេងប្រុស|ក្មេងស្រី|មេក្រុម|មេបញ្ជាការ)\s*[:៖]\s*/gi, '')
      // Fix known AI translation hallucinations & literal wording
      .replace(/ទទេទេវលី/g, 'ទទេស្អាត')
      .replace(/ទទេទេវី/g, 'ទទេស្អាត')
      .replace(/ទទេទទេ/g, 'ទទេស្អាត')
      .replace(/សូន្យសូន្យ/g, 'រលាយបាត់សូន្យ')
      .replace(/ស្ថានទទេ/g, 'ភាពទទេស្អាត')
      .replace(/ទទេធូលី/g, 'រលាយក្លាយជាធូលីដី')
      .replace(/រលាយជាស្ថាន/g, 'រលាយបាត់សូន្យ')
      .replace(/ត្រឹមមួយភ្នែក/g, 'ត្រឹមមួយប៉ប្រិចភ្នែក')
      .replace(/មួយភ្នែកស្រាប់តែ/g, 'មួយប៉ប្រិចភ្នែកស្រាប់តែ')
      .replace(/ក្នុងមួយភ្នែក/g, 'ក្នុងមួយប៉ប្រិចភ្នែក')
      .replace(/ត្រឹមមួយប៉ប្រិច/g, 'ត្រឹមមួយប៉ប្រិចភ្នែក')
      .replace(/បើកស្ពាននេត្រ/g, 'បើកព្រះនេត្រ')
      .replace(/បើកស្ថាននេត្រ/g, 'បើកព្រះនេត្រទិព្វ')
      .replace(/ស្ពាននេត្រ/g, 'ព្រះនេត្រ')
      .replace(/ស្ថាននេត្រ/g, 'ព្រះនេត្រ')
      .replace(/ស្ពានភ្នែក/g, 'ភ្នែកទិព្វ')
      .replace(/ស្ថានភ្នែក/g, 'ភ្នែកទិព្វ')
      .replace(/ភ្នែកស្ថាន/g, 'ភ្នែកទិព្វ')
      .replace(/នេត្រស្ថាន/g, 'ព្រះនេត្រទិព្វ')
      .replace(/កំពុងលង់លក់ក្នុងបន្ទំ/g, 'កំពុងសោយបន្ទំយ៉ាងលង់លក់')
      .replace(/លង់លក់ក្នុងបន្ទំ/g, 'សោយបន្ទំយ៉ាងលង់លក់')
      .replace(/ដេកក្នុងបន្ទំ/g, 'សោយបន្ទំ')
      .replace(/បណ្ដាអ្វីៗទាំងអស់ដែល/g, 'អ្វីៗគ្រប់យ៉ាងដែល')
      .replace(/បណ្ដាអ្វីៗទាំងអស់/g, 'អ្វីៗគ្រប់យ៉ាង')
      .replace(/បណ្ដាអ្វីៗគ្រប់យ៉ាង/g, 'អ្វីៗគ្រប់យ៉ាង')
      .replace(/បណ្ដាមនុស្សទាំងអស់/g, 'មនុស្សគ្រប់គ្នា')
      .replace(/បណ្ដាពួកយើង/g, 'ពួកយើងទាំងអស់គ្នា')
      .replace(/បណ្ដាអ្នកទាំងអស់/g, 'អ្នកទាំងអស់គ្នា')
      .replace(/បណ្ដុះស្ថាន/g, 'ហ្វឹកហាត់វិជ្ជាគុន')
      .replace(/ដាំដុះក្បាច់គុន/g, 'ហ្វឹកហាត់ក្បាច់គុន')
      .replace(/ដាំដុះថាមពល/g, 'ចម្រើនថាមពល')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || text.trim();
  };

  // Khmer Text-To-Speech (TTS) with Male/Female Pitch Modulation & Dynamic Emotion Expressiveness
  const speakKhmerScript = (
    text: string,
    speakerGender?: string,
    onEnd?: () => void,
    targetDurationSec?: number,
    emotion?: string,
    onStartPlayback?: () => void
  ) => {
    // 1. Stop any currently active audio or speech synthesis without destroying the persistent player instance
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch (e) { }
    }
    if (speechSynthRef.current) {
      try {
        speechSynthRef.current.cancel();
      } catch (e) { }
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

    // Determine effective persona: either globally selected or auto-detected from scene roles mapping
    const effectiveGender = resolveEffectiveVoice(speakerGender).toLowerCase();
    const effectiveEmotion = (emotion || 'neutral').toLowerCase();

    // Stop any previously playing Web Audio buffer source
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) { }
      currentSourceRef.current = null;
    }

    // Convert speed to energetic Microsoft Neural Speech rate
    let edgeRate = '+25%';
    if (ttsSpeed >= 1.45) edgeRate = '+45%';
    else if (ttsSpeed >= 1.30) edgeRate = '+36%';
    else if (ttsSpeed >= 1.20) edgeRate = '+30%';
    else if (ttsSpeed >= 1.10) edgeRate = '+25%';
    else if (ttsSpeed <= 0.95) edgeRate = '+12%';

    const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}`;
    const cacheKey = `${effectiveGender}_${effectiveEmotion}_${cleanText}`;
    let audio: HTMLAudioElement;

    // 1. Retrieve or create distinct HTMLAudioElement instance for this specific sentence
    if (ttsAudioCacheRef.current.has(cacheKey)) {
      audio = ttsAudioCacheRef.current.get(cacheKey)!;
      try {
        audio.currentTime = 0;
      } catch (e) { }
    } else {
      audio = new Audio(ttsUrl);
      audio.preload = 'auto';
      ttsAudioCacheRef.current.set(cacheKey, audio);
    }
    audioPlayerRef.current = audio;

    // Guarantee audio is unmuted with full volume
    audio.muted = false;
    audio.volume = 1.0;

    // 2. Dynamic Duration Alignment: Adjust speech rate smoothly so voice fits scene pacing without truncating words!
    const applyDynamicRate = () => {
      if (targetDurationSec && targetDurationSec > 0 && audio.duration && !isNaN(audio.duration)) {
        // Adjust playback speed comfortably so speech completes synchronously with visual action
        const requiredSpeed = audio.duration / targetDurationSec;
        audio.playbackRate = Math.min(1.35, Math.max(0.95, requiredSpeed));
      } else {
        audio.playbackRate = 1.0;
      }
    };

    if (audio.readyState >= 1) {
      applyDynamicRate();
    } else {
      audio.onloadedmetadata = applyDynamicRate;
    }

    audio.onended = () => {
      handleDone();
    };

    audio.onerror = async (e) => {
      console.error('[TTS Audio Playback Error]:', e, audio.error);
      let errorMsg = 'មិនអាចទាញយកសំឡេងពី Server បានទេ។';

      // Perform direct fetch to inspect the exact HTTP / Server error detail
      try {
        const testRes = await fetch(ttsUrl);
        if (!testRes.ok) {
          const errJson = await testRes.json().catch(() => ({}));
          errorMsg = errJson.error || `Server Error (Status: ${testRes.status})`;
        }
      } catch (netErr: any) {
        errorMsg = `បញ្ហាបណ្តាញ Network: ${netErr.message || 'មិនអាចភ្ជាប់ទៅ Server បាន'}`;
      }

      showToast('error', '⚠️ បរាជ័យក្នុងការបន្លឺសំឡេង', errorMsg);
      handleDone();
    };

    let startedTriggered = false;
    const triggerStart = () => {
      if (!startedTriggered) {
        startedTriggered = true;
        if (onStartPlayback) onStartPlayback();
      }
    };

    audio.onplay = triggerStart;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        triggerStart();
      }).catch(async (playErr: any) => {
        if (playErr?.name === 'AbortError') {
          // Play was intentionally interrupted by pause() or skipping to another segment - silent ignore
          return;
        }
        console.error('[Audio play() Rejected]:', playErr);
        const errMsg = playErr?.message?.includes('user didn\'t interact')
          ? 'សូមចុចលើផ្ទាំងកម្មវិធីដើម្បីអនុញ្ញាតឱ្យចាក់សំឡេង (Autoplay Policy)'
          : `មិនអាចចាក់សំឡេងបាន៖ ${playErr?.message || 'Error'}`;
        showToast('error', '⚠️ បរាជ័យក្នុងការចាក់សំឡេង', errMsg);
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
        } catch (e) { }
        currentSourceRef.current = null;
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch (e) { }
      }
      if (speechSynthRef.current) {
        try {
          speechSynthRef.current.cancel();
        } catch (e) { }
      }
      if (videoPlayerRef.current) {
        try {
          videoPlayerRef.current.pause();
        } catch (e) { }
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

    const seconds = parseTimestampToSeconds(segment.start_time);
    const targetDur = Math.max(0.5, parseTimecode(segment.end_time) - parseTimecode(segment.start_time));

    // Jump video to segment start time immediately and prepare video playhead
    if (videoPlayerRef.current && recapData?.videoUrl) {
      videoPlayerRef.current.currentTime = seconds;
    }

    speakKhmerScript(
      segment.khmer_script,
      segment.speaker_gender,
      () => {
        setPlayingSegmentId((prev) => (prev === segment.segment_id ? null : prev));
      },
      targetDur,
      segment.voice_emotion || segment.voice_tone,
      () => {
        // Frame-locked synchronization: start video exactly when audio playback actually starts
        if (videoPlayerRef.current && recapData?.videoUrl) {
          videoPlayerRef.current.currentTime = seconds;
          videoPlayerRef.current.play().catch(() => { });
        }
      }
    );
  };

  // Dedicated Sequential Full Narration Player: Guarantees 100% of all transcripts are spoken to completion
  const playAllNarrationsSequence = async (startIdx: number = 0) => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) return;

    setIsPlayingAll(true);
    isPlayingAllRef.current = true;

    const segments = recapData.recap_segments;
    const initialIndex = Math.max(0, Math.min(startIdx, segments.length - 1));

    for (let i = initialIndex; i < segments.length; i++) {
      if (!isPlayingAllRef.current) break;

      const seg = segments[i];
      const cleanText = cleanKhmerSpeech(seg.khmer_script);
      if (!cleanText) continue;

      setActiveSegmentId(seg.segment_id);
      setPlayingSegmentId(seg.segment_id);
      lastSpokenSegmentIdRef.current = seg.segment_id;

      // Auto-scroll transcript list to currently speaking segment
      const el = document.getElementById(`dubbing-segment-${seg.segment_id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      const segStartSec = parseTimestampToSeconds(seg.start_time);
      const segEndSec = parseTimestampToSeconds(seg.end_time);
      const targetDur = Math.max(0.5, segEndSec > segStartSec ? (segEndSec - segStartSec) : 3.0);

      // Sync video & BGM to segment timestamp
      if (videoPlayerRef.current && recapData.videoUrl) {
        try {
          videoPlayerRef.current.currentTime = segStartSec;
          videoPlayerRef.current.play().catch(() => { });
        } catch (e) { }
      }
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = segStartSec;
          bgmAudioRef.current.play().catch(() => { });
        } catch (e) { }
      }

      // Speak the script and wait until audio.onended fires (complete sentence spoken 100% without cutting off!)
      await new Promise<void>((resolve) => {
        speakKhmerScript(
          seg.khmer_script,
          seg.speaker_gender,
          () => {
            resolve();
          },
          targetDur,
          seg.voice_emotion || seg.voice_tone
        );
      });

      if (!isPlayingAllRef.current) break;

      // Brief natural pause between dialogue segments (200ms)
      await new Promise(r => setTimeout(r, 200));
    }

    if (isPlayingAllRef.current) {
      setIsPlayingAll(false);
      isPlayingAllRef.current = false;
      setPlayingSegmentId(null);
    }
  };

  // Continuous Movie Dubbing Playback from start to finish
  const handlePlayFullNarration = () => {
    if (!videoPlayerRef.current) return;

    if (!videoPlayerRef.current.paused) {
      videoPlayerRef.current.pause();
    } else {
      if (audioIsolationMode === 'mute_all_original') {
        videoPlayerRef.current.muted = true;
      }
      lastSpokenSegmentIdRef.current = null;
      videoPlayerRef.current.play().catch(() => { });
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

  const handleSetAllSegmentsEmotion = (emotion: string) => {
    if (!recapData?.recap_segments) return;
    const updated = recapData.recap_segments.map(s => ({
      ...s,
      voice_emotion: emotion,
      voice_tone: emotion
    }));
    onUpdateRecap({ ...recapData, recap_segments: updated });
    showToast(
      'info',
      '🎭 បានប្តូរអារម្មណ៍គ្រប់ឈុត',
      `បានកំណត់អារម្មណ៍ "${emotion === 'neutral' ? 'ធម្មតា (ស្មើ)' : emotion}" គ្រប់ ${updated.length} ឈុតទាំងអស់`
    );
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

  const [isProofreadingScript, setIsProofreadingScript] = useState<boolean>(false);
  const [isAutoDetectingSpeakers, setIsAutoDetectingSpeakers] = useState<boolean>(false);
  const [refiningSegmentId, setRefiningSegmentId] = useState<number | null>(null);

  const handleAutoDetectSpeakers = async () => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) {
      showToast('warning', 'មិនមានស្គ្រីបសម្រាប់វិភាគ', 'សូម Generate ស្គ្រីបជាមុនសិន!');
      return;
    }

    setIsAutoDetectingSpeakers(true);
    showToast('info', '⚡ AI កំពុងវិភាគភេទ និងតួអង្គ...', 'កំពុងបែងចែកសំឡេង ប្រុស ស្រី ក្មេង ចាស់ តាមសាច់រឿង...');

    try {
      const apiKey = localStorage.getItem('khmer_dubber_custom_api_key') || localStorage.getItem('gemini_api_key') || undefined;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      let detectedMap = new Map<number, { speaker_gender: string; speaker_name: string }>();

      try {
        const res = await fetch('/api/recap/auto-detect-speakers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            segments: recapData.recap_segments,
            movieTitle: recapData.movie_title,
            translationMode: translationMode,
            customApiKey: apiKey
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.detected_segments && Array.isArray(data.detected_segments)) {
            for (const d of data.detected_segments) {
              detectedMap.set(d.segment_id, {
                speaker_gender: d.speaker_gender,
                speaker_name: d.speaker_name
              });
            }
          }
        }
      } catch (fetchErr) {
        console.warn('Server auto-detect speakers notice, using local intelligent heuristics:', fetchErr);
      }

      // If server didn't map all segments, fill in with high-precision client inference
      const updatedSegments = recapData.recap_segments.map(seg => {
        const serverMatch = detectedMap.get(seg.segment_id);
        if (serverMatch && serverMatch.speaker_gender && serverMatch.speaker_gender !== 'child') {
          return {
            ...seg,
            speaker_gender: serverMatch.speaker_gender,
            speaker_name: serverMatch.speaker_name || seg.speaker_name || 'តួអង្គ'
          };
        }
        const clientInferred = inferSpeakerGenderClient(seg.khmer_script, seg.original_summary, seg.speaker_name);
        return {
          ...seg,
          speaker_gender: clientInferred.gender,
          speaker_name: seg.speaker_name && seg.speaker_name !== 'អ្នកសម្រាយ' ? seg.speaker_name : clientInferred.name
        };
      });

      const updatedRecap = {
        ...recapData,
        recap_segments: updatedSegments
      };

      onUpdateRecap(updatedRecap);

      // Clear audio cache so newly tagged voices generate fresh audio immediately
      ttsAudioCacheRef.current.clear();

      // Auto save to database
      try {
        await fetch('/api/db/recaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedRecap)
        });
      } catch (dbErr) {
        console.warn('Auto-save detected speakers error:', dbErr);
      }

      showToast(
        'success',
        '🎉 បានបែងចែកតួអង្គស្វ័យប្រវត្តិជោគជ័យ!',
        `បានចាត់តាំងសំឡេង (ក្មេងប្រុស ក្មេងស្រី ប្រុស ស្រី ចាស់ កាច) លើ ${updatedSegments.length} ឈុតរួចរាល់។`
      );
    } catch (err: any) {
      console.error('Auto detect speakers error:', err);
      showToast('error', 'បរាជ័យក្នុងការ Detect តួអង្គ', err.message);
    } finally {
      setIsAutoDetectingSpeakers(false);
    }
  };

  const handleProofreadScript = async () => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) {
      showToast('warning', 'មិនមានស្គ្រីបសម្រាប់ពិនិត្យ', 'សូម Generate ស្គ្រីបជាមុនសិន!');
      return;
    }

    setIsProofreadingScript(true);
    showToast('info', 'Gemini AI កំពុងពិនិត្យស្គ្រីប...', 'កំពុងពិនិត្យឈ្មោះតួអង្គ អក្ខរាវិរុទ្ធ និងសាច់រឿង...');

    try {
      const apiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('khmer_dubber_custom_api_key') || undefined;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      const res = await fetch('/api/recap/proofread-script', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          segments: recapData.recap_segments,
          movieTitle: recapData.movie_title,
          translationMode: translationMode,
          customApiKey: apiKey
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to proofread script');
      }

      const data = await res.json();
      if (data.corrected_segments && Array.isArray(data.corrected_segments)) {
        onUpdateRecap({
          ...recapData,
          recap_segments: data.corrected_segments
        });
        incrementDailyUsage('translation', 1);
        showToast('success', `✨ AI បានកែសម្រួលស្គ្រីបជោគជ័យ! (${data.changes_count || 0} កន្លែង)`, data.correction_summary || 'ឈ្មោះតួអង្គ និងអត្ថន័យត្រូវបានកែសម្រួលឱ្យស្របតាមសាច់រឿង។');
      }
    } catch (err: any) {
      console.error('Proofread error:', err);
      showToast('error', 'បរាជ័យក្នុងការកែសម្រួលស្គ្រីប', err.message);
    } finally {
      setIsProofreadingScript(false);
    }
  };

  const handleRefineSingleSegment = async (segment: RecapSegment) => {
    if (!recapData?.recap_segments) return;
    setRefiningSegmentId(segment.segment_id);

    try {
      const apiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('khmer_dubber_custom_api_key') || undefined;
      const idx = recapData.recap_segments.findIndex(s => s.segment_id === segment.segment_id);
      const prevSeg = idx > 0 ? recapData.recap_segments[idx - 1] : undefined;
      const nextSeg = idx < recapData.recap_segments.length - 1 ? recapData.recap_segments[idx + 1] : undefined;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      const res = await fetch('/api/recap/refine-single-segment', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          segment,
          previousSegment: prevSeg,
          nextSegment: nextSeg,
          movieTitle: recapData.movie_title,
          customApiKey: apiKey
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to refine segment');
      }

      const data = await res.json();
      if (data.refined_script) {
        handleSegmentChange(segment.segment_id, 'khmer_script', data.refined_script);
        incrementDailyUsage('translation', 1);
        showToast('success', '✨ បានកែសម្រួលប្រយោគនេះរួចរាល់!');
      }
    } catch (err: any) {
      console.error('Refine segment error:', err);
      showToast('error', 'បរាជ័យក្នុងការកែប្រែប្រយោគ', err.message);
    } finally {
      setRefiningSegmentId(null);
    }
  };

  const handleExport = () => {
    setIsExportModalOpen(true);
  };

  const [isBatchGeneratingAudio, setIsBatchGeneratingAudio] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const handleBatchGenerateAllAudio = async () => {
    if (!recapData?.recap_segments || recapData.recap_segments.length === 0) {
      showToast('warning', 'មិនទាន់មានស្គ្រីប', 'សូមបង្កើតស្គ្រីបជាមុនសិន');
      return;
    }

    const total = recapData.recap_segments.length;
    setIsBatchGeneratingAudio(true);
    setBatchProgress({ current: 0, total });

    // 1. Clear ALL in-memory audio cache first (browser + RAM)
    ttsAudioCacheRef.current.clear();
    showToast('info', '⚡ ចាប់ផ្តើមបង្កើតសំឡេង Cloned ថ្មី...', `កំពុងលុប Cache ចាស់ និងបង្កើតសំឡេងថ្មី Real-time គ្រប់ ${total} ឈុត...`);

    // 2. Wipe old voice cache from server Memory and SQLite Database
    try {
      await fetch('/api/tts/clear-cache', { method: 'POST' });
    } catch (clearErr) {
      console.warn('Clear TTS cache error:', clearErr);
    }

    let edgeRate = '+25%';
    if (ttsSpeed >= 1.45) edgeRate = '+45%';
    else if (ttsSpeed >= 1.30) edgeRate = '+36%';
    else if (ttsSpeed >= 1.20) edgeRate = '+30%';
    else if (ttsSpeed >= 1.10) edgeRate = '+25%';
    else if (ttsSpeed <= 0.95) edgeRate = '+12%';

    let successCount = 0;
    let completedCount = 0;

    try {
      // Concurrency limit: 2 parallel requests for GPU VoxCPM2, 4 for EdgeTTS
      const isDirectEdgeVoiceGlobal = globalVoicePersona === 'auto_default' || globalVoicePersona === 'default' || globalVoicePersona?.startsWith('edge_');
      const concurrency = isDirectEdgeVoiceGlobal ? 4 : 2;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < total) {
          const i = currentIndex++;
          const seg = recapData.recap_segments[i];
          const cleanText = cleanKhmerSpeech(seg.khmer_script);

          if (!cleanText) {
            completedCount++;
            setBatchProgress({ current: completedCount, total });
            continue;
          }

          const effectiveGender = resolveEffectiveVoice(seg.speaker_gender).toLowerCase();
          const effectiveEmotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
          const cacheKey = `${effectiveGender}_${effectiveEmotion}_${cleanText}`;

          // Use a unique timestamp URL so browser doesn't serve stale HTTP cache
          const freshTs = `${Date.now()}_${i}`;
          const ttsUrlFresh = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}&forceRefresh=true&_ts=${freshTs}`;

          try {
            const response = await fetch(ttsUrlFresh);
            if (response.ok) {
              const contentType = response.headers.get('content-type') || '';
              if (!contentType.includes('json')) {
                const audioBlob = await response.blob();
                if (audioBlob.size > 500) {
                  const objectUrl = URL.createObjectURL(audioBlob);

                  // Remove any stale cached entry
                  const stale = ttsAudioCacheRef.current.get(cacheKey);
                  if (stale) {
                    try { stale.pause(); stale.src = ''; } catch (_) { }
                  }
                  ttsAudioCacheRef.current.delete(cacheKey);

                  // Create brand-new Audio element with the fresh blob URL
                  const audio = new Audio();
                  audio.preload = 'auto';
                  audio.src = objectUrl;
                  audio.load();
                  ttsAudioCacheRef.current.set(cacheKey, audio);
                  successCount++;
                }
              }
            }
          } catch (segErr) {
            console.warn(`[Batch Generation Segment ${seg.segment_id} Notice]:`, segErr);
          }

          completedCount++;
          setBatchProgress({ current: Math.min(total, completedCount), total });
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
      await Promise.all(workers);

      showToast(
        'success',
        '🎉 បានបង្កើតសំឡេងទាំងអស់ជោគជ័យ!',
        `បង្កើតបាន៖ ${successCount}/${total} ឈុត (ចាក់បានភ្លាមៗ 0ms គ្មានកន្ត្រាក់)`
      );
    } catch (err: any) {
      console.error('Batch audio generation error:', err);
      showToast('error', 'បរាជ័យក្នុងការបង្កើតសំឡេងទាំងអស់', err.message);
    } finally {
      setIsBatchGeneratingAudio(false);
    }
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

  const handleRenameTitle = async (newTitle: string) => {
    if (!newTitle || !recapData) return;
    const oldTitle = recapData.movie_title;
    const updated = {
      ...recapData,
      movie_title: newTitle,
      old_title: oldTitle
    };
    onUpdateRecap(updated, oldTitle);
    try {
      await fetch('/api/db/recaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast('success', 'បានប្តូរឈ្មោះរឿងជោគជ័យ!', `ឈ្មោះថ្មី៖ ${newTitle}`);
    } catch (e) {
      console.warn('Failed to save renamed title in DB:', e);
    }
  };

  // ── Next Episode Navigation ──────────────────────────────────────────────
  // Find the next episode recap in the same folder/series so users can
  // navigate without going back to the project list.
  const nextEpisodeRecap = useMemo(() => {
    if (!recapData || !savedRecaps || savedRecaps.length < 2) return null;

    // Option C: group by folderId/folderName first, then fall back to seriesTitle
    const currentFolderId = recapData.folderId;
    const currentFolderName = recapData.folderName;
    const currentSeries = recapData.seriesTitle;
    const currentId = (recapData as any).id;

    const siblings = savedRecaps.filter((r) => {
      if (r === recapData) return false;
      if (currentId && (r as any).id === currentId) return false;

      // Group by folderId when both have one
      if (currentFolderId && r.folderId) {
        return r.folderId === currentFolderId;
      }
      // Group by folderName
      if (currentFolderName && r.folderName) {
        return r.folderName === currentFolderName;
      }
      // Fallback: group by seriesTitle
      if (currentSeries && r.seriesTitle) {
        return r.seriesTitle === currentSeries;
      }
      return false;
    });

    if (siblings.length === 0) return null;

    // Sort siblings ascending by episodeNumber then by title
    const sorted = [...siblings].sort((a, b) => {
      const epA = a.episodeNumber ?? 0;
      const epB = b.episodeNumber ?? 0;
      if (epA !== epB && epA > 0 && epB > 0) return epA - epB;
      return (a.movie_title || '').localeCompare(b.movie_title || '', undefined, { numeric: true });
    });

    const currentEp = recapData.episodeNumber ?? 0;

    // If we have a numeric episode number, find the next higher one
    if (currentEp > 0) {
      const next = sorted.find((r) => (r.episodeNumber ?? 0) > currentEp);
      if (next) return next;
    }

    // Otherwise, find the sibling that comes after current by title order
    const allSorted = [...savedRecaps]
      .filter((r) => siblings.includes(r) || r === recapData)
      .sort((a, b) => {
        const epA = a.episodeNumber ?? 0;
        const epB = b.episodeNumber ?? 0;
        if (epA !== epB && epA > 0 && epB > 0) return epA - epB;
        return (a.movie_title || '').localeCompare(b.movie_title || '', undefined, { numeric: true });
      });

    const curIdx = allSorted.findIndex((r) =>
      currentId ? (r as any).id === currentId : r.movie_title === recapData.movie_title
    );
    if (curIdx >= 0 && curIdx < allSorted.length - 1) {
      return allSorted[curIdx + 1];
    }
    return null;
  }, [recapData, savedRecaps]);

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
        onInsertToSequence={onInsertToSequence}
        onRenameTitle={handleRenameTitle}
        onOpenWatermark={() => setIsWatermarkModalOpen(true)}
        onOpenSubtitleModal={() => setIsSubtitleModalOpen(true)}
        onOpenWatermarkCleaner={() => setIsWatermarkCleanerModalOpen(true)}
        onOpenLipSync={() => setIsLipSyncModalOpen(true)}
        onOpenCompressor={() => setIsCompressorModalOpen(true)}
        onOpenBgmModal={() => setIsBgmModalOpen(true)}
        onOpenUpdateModal={onOpenUpdateModal}
        onOpenThumbnailModal={() => setIsThumbnailModalOpen(true)}
        onToast={showToast}
        saveStatus={saveStatus}
      />

      {/* 2. Main Studio Body Container */}
      <div className="flex-1 flex overflow-hidden">

        {/* Far-Left Vertical Tools Dock */}
        <StudioSidebar
          activeMode={activeMode}
          onSwitchMode={onSwitchMode || (() => { })}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenTikTokModal={onOpenTikTokModal}
          onOpenApiKeyModal={onOpenApiKeyModal}
          hasCustomApiKey={hasCustomApiKey}
          onInsertToSequence={onInsertToSequence}
          onInsertFolderToSequence={onInsertFolderToSequence}
          savedRecaps={savedRecaps}
          currentRecap={recapData}
          onSelectRecap={onSelectRecap || (() => { })}
          onOpenSavedModal={onOpenSaved}
        />

        {/* Studio Canvas Area (Video Monitor + Dubbing Panel) */}
        <div className="flex-1 flex flex-col p-2 sm:p-2.5 lg:p-3 xl:p-4 gap-2 lg:gap-2.5 xl:gap-3 overflow-y-auto">

          {/* Mobile CapCut-Style Tab Switcher (md:hidden) */}
          <div className="flex md:hidden items-center justify-between bg-white border border-gray-200/90 rounded-2xl p-1 shadow-2xs gap-1 shrink-0 font-khmer text-xs">
            <button
              onClick={() => setMobileActiveTab('video')}
              className={`flex-1 py-2 px-2 rounded-xl font-bold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer ${
                mobileActiveTab === 'video'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>🎬</span>
              <span>វីដេអូ</span>
            </button>
            <button
              onClick={() => setMobileActiveTab('script')}
              className={`flex-1 py-2 px-2 rounded-xl font-bold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer ${
                mobileActiveTab === 'script'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>📝</span>
              <span>ស្គ្រីប</span>
              {recapData?.recap_segments?.length ? (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  mobileActiveTab === 'script' ? 'bg-blue-800 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {recapData.recap_segments.length}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setMobileActiveTab('timeline')}
              className={`flex-1 py-2 px-2 rounded-xl font-bold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer ${
                mobileActiveTab === 'timeline'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>⏱️</span>
              <span>Timeline</span>
            </button>
            <button
              onClick={() => setMobileActiveTab('tools')}
              className={`flex-1 py-2 px-2 rounded-xl font-bold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer ${
                mobileActiveTab === 'tools'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>⚡</span>
              <span>ឧបករណ៍</span>
            </button>
          </div>

          {/* Top Row: Video Monitor (Left) & Dubbing Panel (Right) */}
          <div className={`flex-col lg:flex-row gap-2 lg:gap-2.5 xl:gap-3 items-stretch ${
            mobileActiveTab === 'video' || mobileActiveTab === 'script' ? 'flex' : 'hidden md:flex'
          }`}>
            <div className={`${mobileActiveTab === 'video' ? 'block' : 'hidden md:block'} flex-1 min-w-0`}>
              <VideoMonitor
                videoUrl={recapData?.videoUrl}
                videoFileName={recapData?.videoFileName}
                rawFile={recapData?.rawFile}
                videoRef={videoPlayerRef}
                aspectRatio={aspectRatio}
                onOpenThumbnailModal={() => setIsThumbnailModalOpen(true)}
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
                onCancelExtractBgm={() => setIsExtractingBgm(false)}
                isExtractingBgm={isExtractingBgm}
                bgmExtractProgress={bgmExtractProgress}
                bgmExtractStatus={bgmExtractStatus}
                hasBgmTrack={!!recapData?.bgmTrackUrl}
                onAutoDetectAspectRatio={setAspectRatio}
                watermark={watermarkConfig}
                watermarkCleanerConfig={watermarkCleanerConfig}
                subtitleConfig={subtitleConfig}
                currentSegment={currentActiveSegment}
                currentTimeSec={currentTimeSeconds}
                onOpenWatermarkCleaner={() => setIsWatermarkCleanerModalOpen(true)}
                onOpenBgmLinkModal={() => setIsBgmModalOpen(true)}
                bgmColabUrl={bgmColabUrl}
              />
            </div>

            <div className={`${mobileActiveTab === 'script' ? 'block' : 'hidden md:block'} flex-1 min-w-0`}>
              <DubbingPanel
                recapData={recapData}
                activeSegmentId={activeSegmentId}
                playingSegmentId={playingSegmentId}
                isPlayingAll={isPlayingAll}
                ttsSpeed={ttsSpeed}
                onSpeedChange={onChangeTtsSpeed || (() => { })}
                globalVoicePersona={globalVoicePersona}
                onChangeGlobalVoicePersona={onChangeGlobalVoicePersona || (() => { })}
                onPlaySegment={handlePlaySegment}
                onPlayFullNarration={handlePlayFullNarration}
                onTestVoice={() => speakKhmerScript("សួស្តី! នេះគឺជាការសាកល្បងសំឡេងបកប្រែជាភាសាខ្មែរ។", globalVoicePersona !== 'auto' ? globalVoicePersona : "male")}
                onSegmentChange={handleSegmentChange}
                onSetAllSegmentsEmotion={handleSetAllSegmentsEmotion}
                onAddSegment={handleAddSegment}
                onDeleteSegment={handleDeleteSegment}
                onRegenerateAll={onRegenerateAll}
                onInsertToSequence={onInsertToSequence}
                onGenerateHook={handleGenerateHook}
                onProofreadScript={handleProofreadScript}
                isProofreadingScript={isProofreadingScript}
                onAutoDetectSpeakers={handleAutoDetectSpeakers}
                isAutoDetectingSpeakers={isAutoDetectingSpeakers}
                onRefineSingleSegment={handleRefineSingleSegment}
                refiningSegmentId={refiningSegmentId}
                translationMode={translationMode}
                onChangeTranslationMode={onChangeTranslationMode}
                isLoading={isLoading}
                onBatchGenerateAllAudio={handleBatchGenerateAllAudio}
                isBatchGeneratingAudio={isBatchGeneratingAudio}
                batchProgress={batchProgress}
              />
            </div>
          </div>

          {/* ── Next Episode Quick Navigation Banner ─────────────────────── */}
          {nextEpisodeRecap && onSelectRecap && (
            <div
              className={`${mobileActiveTab === 'video' || mobileActiveTab === 'tools' ? 'block' : 'hidden md:block'}`}
              style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 4px 24px rgba(99,102,241,0.35)',
                border: '1px solid rgba(129,140,248,0.3)',
                flexShrink: 0,
              }}
            >
              {/* Left: icon + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" fill="#a5b4fc" stroke="none" />
                    <line x1="19" y1="3" x2="19" y2="21" />
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 10, color: '#a5b4fc', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    ភាគបន្ទាប់
                  </p>
                  <p
                    style={{
                      margin: 0, fontSize: 13, color: '#e0e7ff', fontWeight: 700,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px',
                    }}
                    title={nextEpisodeRecap.movie_title}
                  >
                    {nextEpisodeRecap.episodeNumber
                      ? `ភាគ ${nextEpisodeRecap.episodeNumber} — `
                      : ''}
                    {nextEpisodeRecap.movie_title}
                  </p>
                </div>
              </div>

              {/* Right: Navigate button */}
              <button
                id="btn-next-episode"
                onClick={() => {
                  onSelectRecap(nextEpisodeRecap);
                  showToast('success', `▶▶ ចូលភាគ ${nextEpisodeRecap.episodeNumber || ''}`, nextEpisodeRecap.movie_title);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  boxShadow: '0 2px 12px rgba(99,102,241,0.5)',
                  transition: 'all 0.18s ease',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" fill="white" stroke="none" />
                  <line x1="19" y1="3" x2="19" y2="21" />
                </svg>
                មើលភាគបន្ទាប់
              </button>
            </div>
          )}

          {/* Bottom Panel: Full Multi-Track NLE Timeline */}
          <div className={`${mobileActiveTab === 'timeline' ? 'block' : 'hidden md:block'} w-full`}>
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
              globalVoicePersona={globalVoicePersona}
              playingSegmentId={playingSegmentId}
            />
          </div>

          {/* Dedicated Mobile Tools & Studio Dashboard (md:hidden when tools tab active) */}
          {mobileActiveTab === 'tools' && (
            <div className="flex md:hidden flex-col gap-3 font-khmer animate-fadeIn pb-safe">
              
              {/* 1. Media Upload & Sources Card */}
              <div className="bg-white rounded-2xl p-3 border border-gray-200/90 shadow-2xs space-y-2">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  📁 ប្រភពវីដេអូ & មេឌា
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="p-3 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                      📤
                    </div>
                    <span className="text-xs font-bold text-blue-900">Upload វីដេអូ</span>
                    <span className="text-[10px] text-blue-600">MP4, MKV, MOV</span>
                  </button>

                  {onOpenTikTokModal && (
                    <button
                      onClick={onOpenTikTokModal}
                      className="p-3 rounded-xl bg-purple-50 border border-purple-200 hover:bg-purple-100 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer active:scale-95"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-sm">
                        📱
                      </div>
                      <span className="text-xs font-bold text-purple-900">TikTok Importer</span>
                      <span className="text-[10px] text-purple-600">ទាញយករឿងភាគ</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Studio Modes Switcher */}
              {onSwitchMode && (
                <div className="bg-white rounded-2xl p-3 border border-gray-200/90 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    🎛️ ប្តូររបៀបកាត់ត (Studio Mode)
                  </div>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => onSwitchMode('dubbing')}
                      className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition ${
                        activeMode === 'dubbing'
                          ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                          : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>🎙️</span>
                        <div>
                          <div className="text-xs font-bold">Movie Recap & Dubbing</div>
                          <div className="text-[10px] text-gray-400">ស្គ្រីប, បញ្ចូលសំឡេង & Subtitle</div>
                        </div>
                      </div>
                      {activeMode === 'dubbing' && (
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">កំពុងប្រើ</span>
                      )}
                    </button>

                    <button
                      onClick={() => onSwitchMode('sequence')}
                      className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition ${
                        activeMode === 'sequence'
                          ? 'bg-purple-50 border-purple-400 text-purple-900 font-bold'
                          : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>🎞️</span>
                        <div>
                          <div className="text-xs font-bold">កាត់តភាគច្រើន (Episode Sequence)</div>
                          <div className="text-[10px] text-gray-400">តភាគ 1, 2, 3... ភ្ជាប់គ្នាស្វ័យប្រវត្តិ</div>
                        </div>
                      </div>
                      {activeMode === 'sequence' && (
                        <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">កំពុងប្រើ</span>
                      )}
                    </button>

                    <button
                      onClick={() => onSwitchMode('cutter')}
                      className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition ${
                        activeMode === 'cutter'
                          ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                          : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>✂️</span>
                        <div>
                          <div className="text-xs font-bold">កាត់ត & Split វីដេអូ</div>
                          <div className="text-[10px] text-gray-400">ពុះចែកភាគលឿន</div>
                        </div>
                      </div>
                      {activeMode === 'cutter' && (
                        <span className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold">កំពុងប្រើ</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 3. API Key & AI Settings */}
              {onOpenApiKeyModal && (
                <div className="bg-white rounded-2xl p-3 border border-gray-200/90 shadow-2xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔑</span>
                    <div>
                      <div className="text-xs font-bold text-gray-800">Google Gemini API Key</div>
                      <div className="text-[10.5px] text-gray-400">
                        {hasCustomApiKey ? '✅ Custom Key សកម្ម' : '⚡ ប្រើប្រាស់ Default Key'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onOpenApiKeyModal}
                    className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition cursor-pointer"
                  >
                    កំណត់ Key
                  </button>
                </div>
              )}

              {/* 4. Saved Recaps List Quick Selector */}
              {savedRecaps && savedRecaps.length > 0 && (
                <div className="bg-white rounded-2xl p-3 border border-gray-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      💾 គម្រោងដែលបាន Save ({savedRecaps.length})
                    </div>
                    <button
                      onClick={onOpenSaved}
                      className="text-xs text-blue-600 font-bold hover:underline"
                    >
                      មើលទាំងអស់ →
                    </button>
                  </div>

                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {savedRecaps.slice(0, 4).map((r, i) => (
                      <button
                        key={(r as any).id || i}
                        onClick={() => {
                          onSelectRecap?.(r);
                          showToast('success', 'បានជ្រើសរើសគម្រោង', r.movie_title);
                        }}
                        className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition cursor-pointer ${
                          r.movie_title === recapData?.movie_title
                            ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="truncate max-w-[200px]">{r.movie_title}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {r.recap_segments?.length || 0} បន្ទាត់
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Watermark Settings Modal */}
      <WatermarkModal
        isOpen={isWatermarkModalOpen}
        onClose={() => setIsWatermarkModalOpen(false)}
        config={watermarkConfig}
        onSaveConfig={handleSaveWatermark}
      />

      {/* 1-Click Server MP4 Video Export Modal */}
      {recapData && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          recapData={recapData}
          savedRecaps={savedRecaps}
          folders={folders}
          watermark={watermarkConfig}
          watermarkCleanerConfig={watermarkCleanerConfig}
          lipSyncConfig={lipSyncConfig}
          subtitleStyle={subtitleConfig}
          initialTtsSpeed={ttsSpeed}
        />
      )}

      {/* Wav2Lip AI Real Lip-Sync Studio Modal */}
      <LipSyncModal
        isOpen={isLipSyncModalOpen}
        onClose={() => setIsLipSyncModalOpen(false)}
        config={lipSyncConfig}
        onSaveConfig={handleSaveLipSyncConfig}
        segments={recapData?.recap_segments}
        videoUrl={recapData?.videoUrl}
        onToast={showToast}
      />

      {/* AI BGM Separator Modal (Kaggle & Colab GPU Turbo) */}
      <BgmSeparatorModal
        isOpen={isBgmModalOpen}
        onClose={() => setIsBgmModalOpen(false)}
        bgmColabUrl={bgmColabUrl}
        onSaveColabUrl={(url) => setBgmColabUrl(url)}
        onExtractBgm={handleExtractBgm}
        isExtractingBgm={isExtractingBgm}
        bgmExtractProgress={bgmExtractProgress}
        bgmExtractStatus={bgmExtractStatus}
        hasBgmTrack={!!recapData?.bgmTrackUrl}
        videoUrl={recapData?.videoUrl}
        videoFileName={recapData?.videoFileName}
        onToast={showToast}
      />

      {/* AI Watermark, Logo & Subtitle Cleaner Modal */}
      <WatermarkCleanerModal
        isOpen={isWatermarkCleanerModalOpen}
        onClose={() => setIsWatermarkCleanerModalOpen(false)}
        config={watermarkCleanerConfig}
        onSaveConfig={handleSaveWatermarkCleanerConfig}
        videoUrl={recapData?.videoUrl}
        videoFileName={recapData?.videoFileName}
        onUpdateCleanedVideo={handleCleanedVideoUpdate}
        onToast={showToast}
      />

      {/* Animated Karaoke Subtitle Style Modal */}
      <SubtitleStyleModal
        isOpen={isSubtitleModalOpen}
        onClose={() => setIsSubtitleModalOpen(false)}
        config={subtitleConfig}
        onSaveConfig={handleSaveSubtitleConfig}
        segments={recapData?.recap_segments}
        movieTitle={recapData?.movie_title}
      />

      {/* Video File Upload & Import Modal */}
      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileUpload={onFileUpload}
        onSelectSampleVideo={handleSelectSampleVideo}
        isLoading={isLoading}
        isProcessingFile={isProcessingFile}
        customApiKey={(() => {
          try { return localStorage.getItem('gemini_api_key') || undefined; } catch { return undefined; }
        })()}
        translationMode={translationMode}
        onBatchComplete={(recaps, folderName) => {
          showToast('success', `🎉 បកប្រែ ${recaps.length} ភាគរួចរាល់`, `Folder "${folderName}" ត្រូវបានរក្សាទុកក្នុង Database`);
        }}
        onInsertFolderToSequence={onInsertFolderToSequence}
        onSelectRecap={onSelectRecap}
        previousRecapSummary={
          recapData && recapData.recap_segments && recapData.recap_segments.length > 0
            ? `[${recapData.seriesTitle || recapData.movie_title || 'ភាគមុន'}] - ភាគទី ${recapData.episodeNumber || 1}:\n` +
            recapData.recap_segments.map(s => `(${s.start_time}-${s.end_time}) ${s.speaker_name || ''}: ${s.khmer_script}`).join('\n')
            : undefined
        }
        defaultMovieTitle={recapData?.seriesTitle || recapData?.movie_title}
      />

      {/* 1-Click Fast Video Compressor Modal */}
      <VideoCompressorModal
        isOpen={isCompressorModalOpen}
        onClose={() => setIsCompressorModalOpen(false)}
        currentRecap={recapData}
        onApplyCompressedVideo={(compressedUrl, compressedFileName) => {
          onUpdateRecap({
            ...recapData,
            videoUrl: compressedUrl,
            videoFileName: compressedFileName
          });
        }}
        onToast={showToast}
      />

      {/* Facebook Reels Thumbnail & Cover Studio Modal */}
      <ReelsThumbnailModal
        isOpen={isThumbnailModalOpen}
        onClose={() => setIsThumbnailModalOpen(false)}
        movieTitle={recapData?.seriesTitle || recapData?.movie_title || 'សម្រាយសាច់រឿង'}
        seriesTitle={recapData?.seriesTitle}
        segments={recapData?.recap_segments}
        episodeNumber={recapData?.episodeNumber || 1}
        videoUrl={recapData?.videoUrl}
        videoRef={videoPlayerRef}
        currentThumbnailUrl={recapData?.thumbnailUrl}
        onSaveThumbnail={(dataUrl, config) => {
          onUpdateRecap({
            ...recapData,
            thumbnailUrl: dataUrl,
            thumbnailConfig: config
          });
          onSaveRecap();
        }}
        onToast={showToast}
      />

      {/* Floating Modern Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
};
