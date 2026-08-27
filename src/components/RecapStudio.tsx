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
import { LipSyncModal } from './LipSyncModal';
import { ExportModal } from './ExportModal';
import { VoiceCloningModal } from './VoiceCloningModal';
import { SubtitleStyleModal } from './SubtitleStyleModal';
import { VideoCompressorModal } from './VideoCompressorModal';
import { extractBgmInstrumentalTrack } from '../utils/vocalRemover';
import { ToastContainer, ToastMessage, ToastType } from './ToastNotification';
import { parseTimecode } from '../utils/sequenceUtils';

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

  // Grandparents / Elders
  if (/តាចាស់|លោកតា|តា\s|តាឡៅ|តា\b|grandpa|grandfather|old man|elderly/.test(text)) {
    return { gender: 'male_elder', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ឡៅចាវ' };
  }
  if (/យាយចាស់|លោកយាយ|យាយ\s|យាយ\b|grandma|grandmother|old woman/.test(text)) {
    return { gender: 'female_elder', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'យាយចាស់' };
  }

  // Children
  if (/ក្មេងប្រុស|កូនប្រុសតូច|ស៊ាវប៉ៅ|កូនតូចប្រុស|little boy|schoolboy|young son/.test(text)) {
    return { gender: 'child_boy', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ស៊ាវប៉ៅ' };
  }
  if (/ក្មេងស្រី|កូនស្រីតូច|little girl|schoolgirl|young daughter/.test(text)) {
    return { gender: 'child_girl', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ក្មេងស្រី' };
  }
  if (/កូនតូច|ក្មេង|កុមារ|ក្ដៅខ្លួន|baby|kid|child/.test(text)) {
    return { gender: 'child_boy', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ស៊ាវប៉ៅ' };
  }

  // Female characters
  if (/ឆេងយី|ឆេងយីង|នាង|ស្រី|ប្រពន្ធ|ម៉ាក់|ម្ដាយ|អ្នកស្រី|មីង|កញ្ញា|នារី|sister|woman|girl|mother|wife|female|lady|she|her/.test(text)) {
    return { gender: 'female', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ឆេងយីង' };
  }

  // Villain
  if (/តួកាច|មេបិសាច|ចោរ|ឧក្រិដ្ឋជន|villain|monster|demon|thief|criminal/.test(text)) {
    return { gender: 'villain', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'តួកាច' };
  }

  // Police
  if (/ប៉ូលីស|លោកប៉ូលីស|ពូប៉ូលីស|police|officer/.test(text)) {
    return { gender: 'male', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'លោកប៉ូលីស' };
  }

  // Male characters
  if (/ឡៅចាវ|ឡៅចៅ|បងប្រុស|ប្ដី|ពូ|លោក|ប៉ា|ឪពុក|កូនប្រុស|មេបញ្ជាការ|man|boy|father|husband|dad|brother|male|he|him/.test(text)) {
    return { gender: 'male', name: speakerName && speakerName !== 'អ្នកសម្រាយ' ? speakerName : 'ឡៅចាវ' };
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
  
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(69);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(279);

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState<boolean>(false);
  const [isVoiceCloningModalOpen, setIsVoiceCloningModalOpen] = useState<boolean>(false);
  const [isCompressorModalOpen, setIsCompressorModalOpen] = useState<boolean>(false);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceProfile[]>([]);

  useEffect(() => {
    fetch('/api/cloned-voices')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setClonedVoices(data);
      })
      .catch(e => console.warn('Fetch cloned voices notice:', e));
  }, []);

  const handleSaveClonedVoice = async (voice: Partial<ClonedVoiceProfile>) => {
    try {
      const res = await fetch('/api/cloned-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voice)
      });
      if (res.ok) {
        const saved: ClonedVoiceProfile = await res.json();
        setClonedVoices(prev => {
          const idx = prev.findIndex(v => v.id === saved.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = saved;
            return copy;
          }
          return [saved, ...prev];
        });
        showToast('success', 'បានរក្សាទុកសំឡេង Cloned ជោគជ័យ!', `ឈ្មោះ៖ ${saved.name}`);
        return saved;
      }
    } catch (err: any) {
      console.error('Save cloned voice error:', err);
      showToast('error', 'បរាជ័យក្នុងការរក្សាទុកសំឡេង', err.message);
    }
  };

  const handleDeleteClonedVoice = async (id: string) => {
    try {
      await fetch(`/api/cloned-voices/${id}`, { method: 'DELETE' });
      setClonedVoices(prev => prev.filter(v => v.id !== id));
      showToast('info', 'បានលុបសំឡេង Cloned រួចរាល់');
    } catch (err: any) {
      console.error('Delete cloned voice error:', err);
    }
  };

  const [voiceRolesMapping, setVoiceRolesMapping] = useState<VoiceRolesMapping>(() => {
    try {
      const saved = localStorage.getItem('khmer_dubber_voice_roles_mapping');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { male: 'male', female: 'female', narrator: 'narrator' };
  });

  useEffect(() => {
    ttsAudioCacheRef.current.clear();
  }, [globalVoicePersona, voiceRolesMapping]);

  const handleSaveVoiceRolesMapping = (mapping: VoiceRolesMapping) => {
    setVoiceRolesMapping(mapping);
    try {
      localStorage.setItem('khmer_dubber_voice_roles_mapping', JSON.stringify(mapping));
    } catch {}
    showToast('success', 'បានរក្សាទុកការផ្គូផ្គងសំឡេងតួអង្គជោគជ័យ!');
  };

  const resolveEffectiveVoice = (gender?: string): string => {
    // 1. If user explicitly picked default Piseth & Sreymom
    if (globalVoicePersona === 'auto_default' || globalVoicePersona === 'default') {
      const g = (gender || 'female').toLowerCase();
      if (g === 'male' || g === 'male_elder' || g === 'villain' || g === 'narrator') {
        return 'edge_piseth';
      }
      return 'edge_sreymom';
    }

    // 2. If user picked a specific single voice (e.g. specific cloned voice or specific persona)
    if (globalVoicePersona && globalVoicePersona !== 'auto' && globalVoicePersona !== 'auto_cloned') {
      if (['male', 'female', 'narrator', 'male_elder', 'child', 'child_boy', 'child_girl'].includes(globalVoicePersona)) {
        return `edge_${globalVoicePersona}`;
      }
      return globalVoicePersona;
    }

    // 3. If the individual segment itself has a specific cloned or provider voice assigned
    const g = (gender || 'female').toLowerCase();
    if (g.startsWith('voice_') || g.startsWith('kiri_') || g.startsWith('gemini_')) {
      return g;
    }

    // 4. Auto Cloned Roles (✨ តាមតួអង្គ Cloned): Automatically use uploaded cloned voices
    const clonedMale = clonedVoices.find(v => v.gender === 'male')?.id || clonedVoices[0]?.id;
    const clonedFemale = clonedVoices.find(v => v.gender === 'female')?.id || (clonedVoices.length > 1 ? clonedVoices[clonedVoices.length - 1]?.id : clonedMale);

    const effectiveMale = (voiceRolesMapping.male && (voiceRolesMapping.male.startsWith('voice_') || voiceRolesMapping.male.startsWith('kiri_') || voiceRolesMapping.male.startsWith('gemini_'))) 
      ? voiceRolesMapping.male 
      : (clonedMale || 'male');

    const effectiveFemale = (voiceRolesMapping.female && (voiceRolesMapping.female.startsWith('voice_') || voiceRolesMapping.female.startsWith('kiri_') || voiceRolesMapping.female.startsWith('gemini_'))) 
      ? voiceRolesMapping.female 
      : (clonedFemale || 'female');

    const effectiveNarrator = (voiceRolesMapping.narrator && (voiceRolesMapping.narrator.startsWith('voice_') || voiceRolesMapping.narrator.startsWith('kiri_') || voiceRolesMapping.narrator.startsWith('gemini_'))) 
      ? voiceRolesMapping.narrator 
      : (effectiveMale || effectiveFemale || 'narrator');

    if (g === 'child_boy') {
      return voiceRolesMapping.child_boy || 'child_boy';
    }
    if (g === 'child_girl' || g === 'child') {
      return voiceRolesMapping.child_girl || 'child_girl';
    }
    if (g === 'male_elder') {
      return voiceRolesMapping.male_elder || 'male_elder';
    }
    if (g === 'female_elder') {
      return voiceRolesMapping.female_elder || 'female_elder';
    }
    if (g === 'villain') {
      return voiceRolesMapping.villain || 'villain';
    }
    if (g === 'news_host') {
      return 'news_host';
    }
    if (g === 'female_lively') {
      return 'female_lively';
    }
    if (g === 'male') {
      return effectiveMale;
    }
    if (g === 'female') {
      return effectiveFemale;
    }
    if (g === 'narrator') {
      return effectiveNarrator;
    }
    return effectiveFemale;
  };

  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>(() => {
    try {
      const saved = localStorage.getItem('khmer_recap_watermark_cfg');
      if (saved) return JSON.parse(saved);
    } catch {}
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
    } catch {}
    showToast('success', 'បានកំណត់ Watermark ជោគជ័យ!', `បង្ហាញនៅ៖ ${cfg.position}`);
  };

  const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState<boolean>(false);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleStyleConfig>(() => {
    try {
      const saved = localStorage.getItem('khmer_recap_subtitle_cfg');
      if (saved) return JSON.parse(saved);
    } catch {}
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
    } catch {}
    showToast('success', 'បានកំណត់ស្ទីល Subtitle ជោគជ័យ!', `Preset: ${cfg.preset}`);
  };

  const [isWatermarkCleanerModalOpen, setIsWatermarkCleanerModalOpen] = useState<boolean>(false);
  const [watermarkCleanerConfig, setWatermarkCleanerConfig] = useState<WatermarkCleanerConfig>(() => {
    if (recapData?.watermarkCleanerConfig) return recapData.watermarkCleanerConfig;
    try {
      const saved = localStorage.getItem('khmer_recap_cleaner_cfg');
      if (saved) return JSON.parse(saved);
    } catch {}
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
    } catch {}
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

  const [isLipSyncModalOpen, setIsLipSyncModalOpen] = useState<boolean>(false);
  const [lipSyncConfig, setLipSyncConfig] = useState<LipSyncConfig>(() => {
    if (recapData?.lipSyncConfig) return recapData.lipSyncConfig;
    try {
      const saved = localStorage.getItem('wav2lip_studio_cfg');
      if (saved) return JSON.parse(saved);
    } catch {}
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
    } catch {}
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
          audioCtxRef.current.resume().catch(() => {});
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
        serverVideoUrl || recapData.videoUrl
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

  // References for live timeline tracking & speech coordination
  const activeSegmentIdRef = useRef<number>(activeSegmentId);
  activeSegmentIdRef.current = activeSegmentId;
  const lastSpokenSegmentIdRef = useRef<number | null>(null);
  const isPlayingAllRef = useRef<boolean>(false);
  isPlayingAllRef.current = isPlayingAll;
  const isSpeakingRef = useRef<boolean>(false);
  const ttsAudioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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
        // High-precision sub-second segment finder with tight tolerance
        const currentSegment = recapData.recap_segments.find((seg) => {
          const start = parseTimecode(seg.start_time);
          const end = parseTimecode(seg.end_time);
          return rawCurrentTime >= (start - 0.05) && rawCurrentTime < (end + 0.10);
        });

        if (currentSegment && currentSegment.segment_id !== activeSegmentIdRef.current) {
          setActiveSegmentId(currentSegment.segment_id);
        }

        // ATOMIC SENTENCE COMPLETION LOCK: Never interrupt an actively speaking sentence!
        if (!isSpeakingRef.current) {
          // Find due segment matching current playback time
          const pendingSegment = recapData.recap_segments.find((seg) => {
            const start = parseTimecode(seg.start_time);
            const end = parseTimecode(seg.end_time);
            return rawCurrentTime >= (start - 0.05) && rawCurrentTime < (end + 0.20);
          });

          if (
            pendingSegment &&
            pendingSegment.segment_id !== lastSpokenSegmentIdRef.current
          ) {
            lastSpokenSegmentIdRef.current = pendingSegment.segment_id;
            setPlayingSegmentId(pendingSegment.segment_id);

            const targetDurationSec = Math.max(0.5, parseTimecode(pendingSegment.end_time) - parseTimecode(pendingSegment.start_time));
            speakKhmerScript(
              pendingSegment.khmer_script, 
              pendingSegment.speaker_gender, 
              () => {
                setPlayingSegmentId((prev) => (prev === pendingSegment.segment_id ? null : prev));
                // Immediately check for next due or trailing segment
                triggerNextDueSegment();
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

    // Sequential audio speaker: seamlessly starts next segment the millisecond previous sentence finishes 100%
    const triggerNextDueSegment = () => {
      const vid = videoPlayerRef.current;
      if (!vid || vid.paused) return;

      const curTime = vid.currentTime;
      const isAtEnd = vid.ended || (vid.duration > 0 && curTime >= vid.duration - 0.40);

      let nextSeg: RecapSegment | undefined;

      if (isAtEnd) {
        // Video is at end: continue speaking all trailing segments in order to 100% completion
        const nextId = (lastSpokenSegmentIdRef.current || 0) + 1;
        nextSeg = recapData?.recap_segments?.find(s => s.segment_id === nextId);
      } else {
        // Video is playing: find the next segment that is due
        nextSeg = recapData?.recap_segments?.find((s) => {
          const start = parseTimecode(s.start_time);
          const end = parseTimecode(s.end_time);
          return s.segment_id > (lastSpokenSegmentIdRef.current || 0) && curTime >= (start - 0.10) && curTime < (end + 0.35);
        });
      }

      if (nextSeg) {
        setActiveSegmentId(nextSeg.segment_id);
        lastSpokenSegmentIdRef.current = nextSeg.segment_id;
        setPlayingSegmentId(nextSeg.segment_id);
        const targetDur = Math.max(0.5, parseTimecode(nextSeg.end_time) - parseTimecode(nextSeg.start_time));
        speakKhmerScript(
          nextSeg.khmer_script, 
          nextSeg.speaker_gender, 
          () => {
            setPlayingSegmentId((prev) => (prev === nextSeg!.segment_id ? null : prev));
            triggerNextDueSegment();
          }, 
          targetDur,
          nextSeg.voice_emotion || nextSeg.voice_tone
        );
      } else if (isAtEnd) {
        setIsPlayingAll(false);
        isPlayingAllRef.current = false;
        setPlayingSegmentId(null);
      }
    };

    const handlePlay = () => {
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = video.currentTime;
          bgmAudioRef.current.play().catch(() => {});
        } catch (e) {}
      }
      cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(syncPrecisionLoop);
    };

    const handlePause = () => {
      cancelAnimationFrame(animFrameId);
      // Differentiate between natural video end (allow speech to finish) vs manual user pause
      const isAtEnd = video.ended || (video.duration > 0 && video.currentTime >= video.duration - 0.40);
      if (!isAtEnd) {
        if (audioPlayerRef.current) {
          try { audioPlayerRef.current.pause(); } catch (e) {}
        }
        if (bgmAudioRef.current) {
          try { bgmAudioRef.current.pause(); } catch (e) {}
        }
        isSpeakingRef.current = false;
        setIsPlayingAll(false);
        isPlayingAllRef.current = false;
        setPlayingSegmentId(null);
      } else {
        // At video end: pause BGM smoothly but let character Khmer voice finish all remaining narration!
        if (bgmAudioRef.current) {
          try { bgmAudioRef.current.pause(); } catch (e) {}
        }
        triggerNextDueSegment();
      }
    };

    const handleSeek = () => {
      if (bgmAudioRef.current && activeBgmUrl) {
        try {
          bgmAudioRef.current.currentTime = video.currentTime;
        } catch (e) {}
      }
      if (audioPlayerRef.current) {
        try { audioPlayerRef.current.pause(); } catch (e) {}
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

      videoPlayerRef.current.play().catch(() => {});
    }
  };

  // Helper to clean Khmer speech text, strip speaker prefixes, and transliterate foreign words
  const cleanKhmerSpeech = (text: string): string => {
    if (!text) return '';
    let cleaned = text
      // Strip foreign quotes or Chinese annotations like Orig: "..."
      .replace(/Orig\s*:\s*["'].*?["']/gi, '')
      // Strip bracketed annotations like (Note: ...), [Sound: ...]
      .replace(/\(.*?\)|\[.*?\]/g, '')
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
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[a-zA-Z\u4e00-\u9fa5]+/g, ' ')
      // Allow all Khmer letters, sub-scripts, vowels, punctuation, quotes, numbers
      .replace(/[^\u1780-\u17FF\u19E0-\u19FF0-9\s.,!?«»""''()\-—៖។ៗ]/g, '')
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
    emotion?: string
  ) => {
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

    // Determine effective persona: either globally selected or auto-detected from scene roles mapping
    const effectiveGender = resolveEffectiveVoice(speakerGender).toLowerCase();

    const effectiveEmotion = (emotion || 'neutral').toLowerCase();

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

    const voiceApiKey = localStorage.getItem('gemini_voice_api_key') || '';
    const voiceApiKeyParam = voiceApiKey ? `&voiceApiKey=${encodeURIComponent(voiceApiKey)}` : '';
    const isDirectEdgeVoice = effectiveGender.startsWith('edge_') || globalVoicePersona === 'auto_default' || globalVoicePersona === 'default';
    const colabUrl = !isDirectEdgeVoice ? (localStorage.getItem('voxcpm2_colab_url') || '').trim() : '';
    const colabUrlParam = colabUrl ? `&colabUrl=${encodeURIComponent(colabUrl)}` : '';
    const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}${voiceApiKeyParam}${colabUrlParam}`;
    const cacheKey = `${effectiveGender}_${effectiveEmotion}_${cleanText}`;
    let audio: HTMLAudioElement;

    // 1. Instant 0ms retrieval from RAM Audio Cache if available
    if (ttsAudioCacheRef.current.has(cacheKey)) {
      audio = ttsAudioCacheRef.current.get(cacheKey)!;
      try {
        audio.currentTime = 0;
      } catch (e) {}
    } else {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      audio = audioPlayerRef.current;
      audio.src = ttsUrl;
      audio.preload = 'auto';
      ttsAudioCacheRef.current.set(cacheKey, audio);
    }
    audioPlayerRef.current = audio;

    // 2. Dynamic Duration Alignment: If spoken audio is longer than visual action window, calibrate speed!
    const applyDynamicRate = () => {
      if (targetDurationSec && targetDurationSec > 0 && audio.duration && !isNaN(audio.duration)) {
        // Adjust playback speed so speech completes synchronously with visual action
        const requiredSpeed = audio.duration / targetDurationSec;
        audio.playbackRate = Math.min(1.40, Math.max(0.95, requiredSpeed));
      } else {
        audio.playbackRate = 1.0;
      }
    };

    if (audio.readyState >= 1) {
      applyDynamicRate();
    } else {
      audio.onloadedmetadata = applyDynamicRate;
    }

    audio.volume = 1.0;

    audio.onended = () => {
      handleDone();
    };

    audio.onerror = (e) => {
      console.warn('Audio playback notice:', e);
      handleDone();
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((playErr: any) => {
        if (playErr?.name === 'AbortError') {
          // Play was intentionally interrupted by pause() or skipping to another segment - silent ignore
          return;
        }
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

    const targetDur = Math.max(0.5, parseTimecode(segment.end_time) - parseTimecode(segment.start_time));
    speakKhmerScript(
      segment.khmer_script, 
      segment.speaker_gender, 
      () => {
        setPlayingSegmentId((prev) => (prev === segment.segment_id ? null : prev));
      }, 
      targetDur,
      segment.voice_emotion || segment.voice_tone
    );
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

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to detect speakers');
      }

      const data = await res.json();
      if (data.detected_segments && Array.isArray(data.detected_segments)) {
        const detectedMap = new Map<number, { speaker_gender: string; speaker_name: string }>();
        for (const d of data.detected_segments) {
          detectedMap.set(d.segment_id, {
            speaker_gender: d.speaker_gender,
            speaker_name: d.speaker_name
          });
        }

        const updatedSegments = recapData.recap_segments.map(seg => {
          const match = detectedMap.get(seg.segment_id);
          if (match) {
            return {
              ...seg,
              speaker_gender: match.speaker_gender || seg.speaker_gender,
              speaker_name: match.speaker_name || seg.speaker_name
            };
          }
          return seg;
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
          '🎉 បាន Detect ភេទ & តួអង្គជោគជ័យ!', 
          `បានកំណត់តួអង្គ (ប្រុស ស្រី ក្មេង ចាស់) លើ ${updatedSegments.length} ឈុតរួចរាល់។`
        );
      }
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
      const apiKey = localStorage.getItem('khmer_dubber_custom_api_key') || undefined;
      const res = await fetch('/api/recap/proofread-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const apiKey = localStorage.getItem('khmer_dubber_custom_api_key') || undefined;
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

    try {
      // Process segments sequentially in Real-Time with forceRefresh=true so it synthesizes fresh audio
      for (let i = 0; i < total; i++) {
        const seg = recapData.recap_segments[i];
        const cleanText = cleanKhmerSpeech(seg.khmer_script);

        if (!cleanText) {
          setBatchProgress({ current: i + 1, total });
          continue;
        }

        const effectiveGender = resolveEffectiveVoice(seg.speaker_gender).toLowerCase();
        const effectiveEmotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
        const cacheKey = `${effectiveGender}_${effectiveEmotion}_${cleanText}`;

        const isDirectEdgeVoice = effectiveGender.startsWith('edge_') || globalVoicePersona === 'auto_default' || globalVoicePersona === 'default';
        const colabUrl = !isDirectEdgeVoice ? (localStorage.getItem('voxcpm2_colab_url') || '').trim() : '';
        const colabUrlParam = colabUrl ? `&colabUrl=${encodeURIComponent(colabUrl)}` : '';
        const voiceApiKey = localStorage.getItem('gemini_voice_api_key') || '';
        const voiceApiKeyParam = voiceApiKey ? `&voiceApiKey=${encodeURIComponent(voiceApiKey)}` : '';

        // Use a unique timestamp URL so browser doesn't serve stale HTTP cache
        const freshTs = `${Date.now()}_${i}`;
        const ttsUrlFresh = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}${voiceApiKeyParam}${colabUrlParam}&forceRefresh=true&_ts=${freshTs}`;
        // Canonical URL (no timestamp) used for playback - points to fresh server-side cache
        const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(effectiveGender)}&gender=${encodeURIComponent(effectiveGender)}&rate=${encodeURIComponent(edgeRate)}&emotion=${encodeURIComponent(effectiveEmotion)}${voiceApiKeyParam}${colabUrlParam}`;

        try {
          // Fetch with unique timestamp URL — server bypasses DB cache, generates fresh VoxCPM2 audio
          const response = await fetch(ttsUrlFresh);
          if (response.ok) {
            // Get the fresh audio bytes from the response
            const audioBlob = await response.blob();
            const objectUrl = URL.createObjectURL(audioBlob);

            // Remove any stale cached entry
            const stale = ttsAudioCacheRef.current.get(cacheKey);
            if (stale) {
              try { stale.pause(); stale.src = ''; } catch (_) {}
            }
            ttsAudioCacheRef.current.delete(cacheKey);

            // Create brand-new Audio element with the fresh blob URL
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = objectUrl;  // Blob URL — browser always plays fresh audio, no HTTP cache
            audio.load();
            ttsAudioCacheRef.current.set(cacheKey, audio);
            successCount++;
          }
        } catch (segErr) {
          console.warn(`[Batch Generation Segment ${seg.segment_id} Notice]:`, segErr);
        }

        // Live Real-Time state update for UI progress bar & badge
        setBatchProgress({ current: i + 1, total });
      }

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
    const currentFolderId   = recapData.folderId;
    const currentFolderName = recapData.folderName;
    const currentSeries     = recapData.seriesTitle;
    const currentId         = (recapData as any).id;

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
        onOpenUpdateModal={onOpenUpdateModal}
        onToast={showToast}
        saveStatus={saveStatus}
      />

      {/* 2. Main Studio Body Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Far-Left Vertical Tools Dock */}
        <StudioSidebar
          activeMode={activeMode}
          onSwitchMode={onSwitchMode || (() => {})}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenTikTokModal={onOpenTikTokModal}
          onOpenApiKeyModal={onOpenApiKeyModal}
          onOpenVoiceCloningModal={() => setIsVoiceCloningModalOpen(true)}
          hasCustomApiKey={hasCustomApiKey}
          onInsertToSequence={onInsertToSequence}
          onInsertFolderToSequence={onInsertFolderToSequence}
          savedRecaps={savedRecaps}
          currentRecap={recapData}
          onSelectRecap={onSelectRecap || (() => {})}
          onOpenSavedModal={onOpenSaved}
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
            />

            <DubbingPanel
              recapData={recapData}
              activeSegmentId={activeSegmentId}
              playingSegmentId={playingSegmentId}
              isPlayingAll={isPlayingAll}
              ttsSpeed={ttsSpeed}
              onSpeedChange={onChangeTtsSpeed || (() => {})}
              globalVoicePersona={globalVoicePersona}
              onChangeGlobalVoicePersona={onChangeGlobalVoicePersona || (() => {})}
              clonedVoices={clonedVoices}
              onOpenVoiceCloningModal={() => setIsVoiceCloningModalOpen(true)}
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

          {/* ── Next Episode Quick Navigation Banner ─────────────────────── */}
          {nextEpisodeRecap && onSelectRecap && (
            <div
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
                    <polygon points="5 3 19 12 5 21 5 3" fill="#a5b4fc" stroke="none"/>
                    <line x1="19" y1="3" x2="19" y2="21"/>
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
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(99,102,241,0.7)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(99,102,241,0.5)';
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" fill="white" stroke="none"/>
                  <line x1="19" y1="3" x2="19" y2="21"/>
                </svg>
                មើលភាគបន្ទាប់
              </button>
            </div>
          )}

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
            clonedVoices={clonedVoices}
            voiceRolesMapping={voiceRolesMapping}
            globalVoicePersona={globalVoicePersona}
            playingSegmentId={playingSegmentId}
          />

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

      {/* AI Watermark, Logo & Subtitle Cleaner Modal */}
      <WatermarkCleanerModal
        isOpen={isWatermarkCleanerModalOpen}
        onClose={() => setIsWatermarkCleanerModalOpen(false)}
        config={watermarkCleanerConfig}
        onSaveConfig={handleSaveWatermarkCleanerConfig}
        videoUrl={recapData?.videoUrl}
      />

      {/* AI Voice Cloning Studio Modal */}
      <VoiceCloningModal
        isOpen={isVoiceCloningModalOpen}
        onClose={() => setIsVoiceCloningModalOpen(false)}
        clonedVoices={clonedVoices}
        onSaveVoice={handleSaveClonedVoice}
        onDeleteVoice={handleDeleteClonedVoice}
        onSelectActiveVoice={(voiceId) => {
          if (onChangeGlobalVoicePersona) onChangeGlobalVoicePersona(voiceId);
          showToast('success', 'បានជ្រើសរើសសំឡេង Cloned ធ្វើជាសំឡេងចម្បង');
        }}
        activeVoiceId={globalVoicePersona}
        voiceRolesMapping={voiceRolesMapping}
        onChangeVoiceRolesMapping={handleSaveVoiceRolesMapping}
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

      {/* Floating Modern Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
};
