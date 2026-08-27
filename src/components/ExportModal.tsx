import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Download, Film, Sparkles, CheckCircle2, ShieldCheck, ShieldAlert,
  Music, Mic, Stamp, Loader2, AlertTriangle, FileText, 
  Code, Sliders, Check, Volume2, Type, Eye, ChevronDown, ChevronUp, Layers,
  Play, Pause, Maximize2, RotateCcw, ChevronLeft, ChevronRight, RefreshCw, Zap, Info, Radio
} from 'lucide-react';
import { MovieRecapResult, AntiCopyrightConfig, WatermarkConfig, WatermarkCleanerConfig, LipSyncConfig, SubtitleStyleConfig, RecapFolder } from '../types';
import { 
  generateSrtContent, 
  generateVttContent, 
  generateAssContent, 
  generateFcpxmlContent, 
  downloadSubtitleFile 
} from '../utils/subtitleExport';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  recapData?: MovieRecapResult | null;
  savedRecaps?: MovieRecapResult[];
  folders?: RecapFolder[];
  initialFolder?: string;
  initialScope?: 'single' | 'folder';
  antiCopyright?: AntiCopyrightConfig;
  watermark?: WatermarkConfig;
  watermarkCleanerConfig?: WatermarkCleanerConfig;
  lipSyncConfig?: LipSyncConfig;
  subtitleStyle?: SubtitleStyleConfig;
  initialTtsSpeed?: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  recapData,
  savedRecaps = [],
  folders = [],
  initialFolder,
  initialScope = 'single',
  antiCopyright,
  watermark,
  watermarkCleanerConfig,
  lipSyncConfig,
  subtitleStyle,
  initialTtsSpeed
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'subtitles' | 'audio'>('video');
  const [resolution, setResolution] = useState<'1080p' | 'original' | '720p'>('1080p');
  const [exportScope, setExportScope] = useState<'single' | 'folder'>(initialScope);
  const [folderExportMode, setFolderExportMode] = useState<'batch_episodes' | 'merge_series'>('batch_episodes');
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{
    zipUrl: string;
    zipFileName: string;
    totalRendered: number;
    files: Array<{ episodeNumber: number; title: string; fileName: string; downloadUrl: string; size: number }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [selectedBatchPreviewUrl, setSelectedBatchPreviewUrl] = useState<string | null>(null);
  const [selectedBatchPreviewTitle, setSelectedBatchPreviewTitle] = useState<string | null>(null);

  // Audio Controls
  const [bakeDubbing, setBakeDubbing] = useState<boolean>(true);
  const [ttsVolume, setTtsVolume] = useState<number>(1.25); // Studio Boosted 125%
  const [ttsSpeed, setTtsSpeed] = useState<number>(() => {
    if (typeof initialTtsSpeed === 'number' && initialTtsSpeed > 0) return initialTtsSpeed;
    const saved = localStorage.getItem('tts_playback_speed');
    return saved ? Number(saved) : 1.25;
  });
  const [bakeBgm, setBakeBgm] = useState<boolean>(Boolean(recapData?.bgmTrackUrl));
  const [bgmVolume, setBgmVolume] = useState<number>(0.30);
  const [originalAudioVolume, setOriginalAudioVolume] = useState<number>(0.0); // 0.0 = Mute original so dubbing is 100% clean

  const handleTtsSpeedChange = (newSpeed: number) => {
    setTtsSpeed(newSpeed);
    localStorage.setItem('tts_playback_speed', String(newSpeed));
  };

  // Subtitle Controls
  const [bakeSubtitles, setBakeSubtitles] = useState<boolean>(true);
  const [subFontFamily, setSubFontFamily] = useState<string>(subtitleStyle?.fontFamily || 'Kantumruy Pro');
  const [subFontSize, setSubFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>(subtitleStyle?.fontSize || 'lg');
  const [subPreset, setSubPreset] = useState<'tiktok_pop' | 'cinematic_gold' | 'neon_cyan' | 'classic'>(subtitleStyle?.preset || 'tiktok_pop');

  // Watermark Controls
  const [bakeWatermark, setBakeWatermark] = useState<boolean>(watermark?.enabled ?? true);
  const [watermarkText, setWatermarkText] = useState<string>(watermark?.text || '@BTDubber');
  const [watermarkPos, setWatermarkPos] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'>(watermark?.position || 'top-right');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(watermark?.opacity ?? 0.85);

  // Anti-Copyright Shield (Disabled by default to ensure 100% untouched colors and no unwanted flip)
  const [bakeAntiCopyright, setBakeAntiCopyright] = useState<boolean>(antiCopyright?.enabled ?? false);
  const [acFlipHorizontal, setAcFlipHorizontal] = useState<boolean>(antiCopyright?.flipHorizontal ?? false);
  const [acColorFilter, setAcColorFilter] = useState<'none' | 'cinematic_warm' | 'cinematic_cool' | 'golden_hour' | 'vibrant_boost'>(antiCopyright?.colorFilter || 'none');
  const [acZoomScale, setAcZoomScale] = useState<number>(antiCopyright?.zoomScale ?? 1.0);
  const [showAcDetails, setShowAcDetails] = useState<boolean>(false);

  // Live Result Preview State
  const [showLivePreview, setShowLivePreview] = useState<boolean>(true);
  const [previewSegmentIndex, setPreviewSegmentIndex] = useState<number>(0);
  const [previewPlaying, setPreviewPlaying] = useState<boolean>(true);
  const [activeWordHighlightIdx, setActiveWordHighlightIdx] = useState<number>(0);
  const [previewAspect, setPreviewAspect] = useState<'16:9' | '9:16'>('16:9');

  // CapCut-Style Copyright Checker State
  const [isCheckingCopyright, setIsCheckingCopyright] = useState<boolean>(false);
  const [showCopyrightModal, setShowCopyrightModal] = useState<boolean>(false);
  const [copyrightReport, setCopyrightReport] = useState<{
    score: number;
    safetyLevel: 'safe' | 'moderate' | 'high_risk';
    statusTitle: string;
    statusDescription: string;
    audioScore: number;
    visualScore: number;
    checks: Array<{
      category: string;
      name: string;
      status: 'passed' | 'warning' | 'danger' | 'info';
      message: string;
      tip?: string;
    }>;
    platforms: Array<{
      name: string;
      status: string;
      badge: string;
    }>;
  } | null>(null);

  // Group all available recaps by folder
  const availableFolders = React.useMemo(() => {
    const map = new Map<string, { folderName: string; episodes: MovieRecapResult[] }>();

    folders.forEach(f => {
      if (f.name) map.set(f.name, { folderName: f.name, episodes: [] });
    });

    savedRecaps.forEach(r => {
      const fName = r.folderName || r.seriesTitle;
      if (fName) {
        if (!map.has(fName)) {
          map.set(fName, { folderName: fName, episodes: [] });
        }
        const existingList = map.get(fName)!.episodes;
        if (!existingList.some(x => x.id === r.id || x.movie_title === r.movie_title)) {
          existingList.push(r);
        }
      }
    });

    if (recapData && (recapData.folderName || recapData.seriesTitle)) {
      const fName = (recapData.folderName || recapData.seriesTitle)!;
      if (!map.has(fName)) {
        map.set(fName, { folderName: fName, episodes: [recapData] });
      } else {
        const list = map.get(fName)!.episodes;
        if (!list.some(x => x.id === recapData.id || x.movie_title === recapData.movie_title)) {
          list.push(recapData);
        }
      }
    }

    return Array.from(map.values())
      .filter(item => item.episodes.length > 0)
      .map(item => {
        item.episodes.sort((a, b) => (a.episodeNumber || 1) - (b.episodeNumber || 1));
        return item;
      });
  }, [folders, savedRecaps, recapData]);

  const [selectedFolderName, setSelectedFolderName] = useState<string>(() => {
    return initialFolder || recapData?.folderName || recapData?.seriesTitle || (availableFolders[0]?.folderName || '');
  });

  // Current active folder's episodes
  const activeFolderData = React.useMemo(() => {
    return availableFolders.find(f => f.folderName === selectedFolderName) || availableFolders[0] || null;
  }, [availableFolders, selectedFolderName]);

  const currentRecap = recapData || activeFolderData?.episodes[0] || null;
  const cleanFileName = (currentRecap?.movie_title || selectedFolderName || 'BT_Dubber_Project')
    .replace(/[^\w\s\u1780-\u17FF-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  // Karaoke Word highlight cycling animation in Preview
  useEffect(() => {
    if (!showLivePreview || !previewPlaying) return;
    const currentRecap = recapData || activeFolderData?.episodes[0] || null;
    const segments = currentRecap?.recap_segments || [];
    const segText = segments[previewSegmentIndex]?.khmer_script || currentRecap?.movie_title || 'ស្វាគមន៍មកកាន់ BT-Dubber Studio - Preview អក្សរខ្មែរ និង Effect វីដេអូ';
    const words = segText.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) return;

    const timer = setInterval(() => {
      setActiveWordHighlightIdx((prev) => (prev + 1) % words.length);
    }, 450);

    return () => clearInterval(timer);
  }, [showLivePreview, previewPlaying, previewSegmentIndex, recapData, activeFolderData]);

  // CapCut-Style Copyright Check Trigger
  const handleRunCopyrightCheck = async () => {
    setIsCheckingCopyright(true);
    setShowCopyrightModal(true);
    try {
      const currentRecap = recapData || activeFolderData?.episodes[0] || null;
      const res = await fetch('/api/check-copyright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalAudioVolume,
          bakeDubbing,
          bakeBgm,
          bgmVolume,
          bakeAntiCopyright,
          acFlipHorizontal,
          acColorFilter,
          acZoomScale,
          bakeWatermark,
          watermarkText,
          segments: currentRecap?.recap_segments || []
        })
      });
      const data = await res.json();
      if (data.success) {
        setCopyrightReport(data);
      }
    } catch (err) {
      console.error('Copyright check error:', err);
    } finally {
      setIsCheckingCopyright(false);
    }
  };

  // 1-Click Auto-Fix to 100% Safe Settings
  const handleAutoFixCopyright = async () => {
    setOriginalAudioVolume(0.0);
    setBakeDubbing(true);
    setBakeAntiCopyright(true);
    setAcFlipHorizontal(true);
    setAcColorFilter('cinematic_warm');
    setAcZoomScale(1.05);
    setBakeWatermark(true);
    setIsCheckingCopyright(true);
    
    setTimeout(async () => {
      try {
        const currentRecap = recapData || activeFolderData?.episodes[0] || null;
        const res = await fetch('/api/check-copyright', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalAudioVolume: 0.0,
            bakeDubbing: true,
            bakeBgm: true,
            bgmVolume: 0.30,
            bakeAntiCopyright: true,
            acFlipHorizontal: true,
            acColorFilter: 'cinematic_warm',
            acZoomScale: 1.05,
            bakeWatermark: true,
            watermarkText,
            segments: currentRecap?.recap_segments || []
          })
        });
        const data = await res.json();
        if (data.success) {
          setCopyrightReport(data);
        }
      } catch (err) {
        console.error('Auto-fix copyright check error:', err);
      } finally {
        setIsCheckingCopyright(false);
      }
    }, 350);
  };

  const handleStartRender = async () => {
    setIsRendering(true);
    setError(null);
    setDownloadUrl(null);
    setBatchResult(null);
    setProgress(10);

    try {
      // -------------------------------------------------------------
      // FOLDER EXPORT: Batch All Episodes as Individual MP4s + ZIP
      // -------------------------------------------------------------
      if (exportScope === 'folder' && activeFolderData && folderExportMode === 'batch_episodes') {
        setStatusMessage(`កំពុងរៀបចំ និង Render គ្រប់ភាគទាំងអស់ក្នុង Folder "${activeFolderData.folderName}" (${activeFolderData.episodes.length} ភាគ)...`);

        const progressTimer = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 92) return prev;
            if (prev < 30) {
              setStatusMessage('កំពុងរៀបចំ Audio TTS & BGM គ្រប់ភាគ...');
              return prev + 6;
            }
            if (prev < 70) {
              setStatusMessage('កំពុង Render វីដេអូនីមួយៗជាមួយ FFmpeg Studio Engine...');
              return prev + 4;
            }
            setStatusMessage('កំពុង Zip បញ្ចូលកញ្ចប់រឿងពេញ...');
            return prev + 2;
          });
        }, 1200);

        const payload = {
          folderName: activeFolderData.folderName,
          episodes: activeFolderData.episodes,
          burnSubtitles: bakeSubtitles,
          subtitleStyle: {
            preset: subPreset,
            fontFamily: subFontFamily,
            fontSize: subFontSize,
            highlightColor: subPreset === 'tiktok_pop' ? '#FACC15' : subPreset === 'cinematic_gold' ? '#FEF08A' : subPreset === 'neon_cyan' ? '#38BDF8' : '#FACC15',
            textColor: '#FFFFFF',
            bgBox: subPreset === 'tiktok_pop' ? 'pill_blur' : subPreset === 'neon_cyan' ? 'black_bar' : 'shadow',
            animationType: 'karaoke_word'
          },
          audioSettings: {
            ttsVolume: bakeDubbing ? ttsVolume : 0.0,
            bgmVolume: bakeBgm ? bgmVolume : 0.0,
            originalAudioVolume: originalAudioVolume
          },
          antiCopyright: {
            enabled: bakeAntiCopyright,
            flipHorizontal: acFlipHorizontal,
            colorFilter: acColorFilter,
            zoomScale: acZoomScale
          },
          watermark: {
            enabled: bakeWatermark,
            text: watermarkText,
            position: watermarkPos,
            opacity: watermarkOpacity
          },
          cleanerConfig: watermarkCleanerConfig || { enabled: false, zones: [] },
          lipSyncConfig: lipSyncConfig || { enabled: false },
          voiceRolesMapping: currentRecap?.voiceRolesMapping || (() => {
            try {
              const s = localStorage.getItem('khmer_dubber_voice_roles_mapping');
              return s ? JSON.parse(s) : undefined;
            } catch { return undefined; }
          })(),
          voiceApiKey: localStorage.getItem('gemini_voice_api_key') || localStorage.getItem('gemini_api_key') || '',
          kiriApiKey: localStorage.getItem('kiritts_api_key') || '',
          colabUrl: localStorage.getItem('voxcpm2_colab_url') || '',
          ttsSpeed: ttsSpeed || 1.25,
          resolution: resolution
        };

        const res = await fetch('/api/render/batch-folder-episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        clearInterval(progressTimer);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || data.details || 'ការ Batch Render គ្រប់ភាគមានបញ្ហា');
        }

        const data = await res.json();
        setProgress(100);
        setStatusMessage(`🎉 Batch Render ជោគជ័យ (${data.totalRendered || activeFolderData.episodes.length} ភាគ)!`);
        setBatchResult(data);
        setDownloadUrl(data.zipUrl);
        setDownloadFileName(data.zipFileName);
        setIsRendering(false);
        return;
      }

      // -------------------------------------------------------------
      // FOLDER EXPORT: Merge All Episodes into 1 Full Movie Video
      // -------------------------------------------------------------
      if (exportScope === 'folder' && activeFolderData && folderExportMode === 'merge_series') {
        const totalEpCount = activeFolderData.episodes.length;
        setStatusMessage(`⚡ កំពុងរៀបចំ Fast Concat Engine ដើម្បីតភ្ជាប់ ${totalEpCount} ភាគចូលគ្នា...`);
        setProgress(15);

        let elapsedSec = 0;
        const progressTimer = setInterval(() => {
          elapsedSec++;
          setProgress((prev) => {
            if (prev < 35) {
              setStatusMessage(`⚡ [ជំហាន ១/៣] កំពុងផ្ទៀងផ្ទាត់ និងរៀបចំ ${totalEpCount} ភាគ (${elapsedSec}s)...`);
              return prev + 5;
            }
            if (prev < 75) {
              setStatusMessage(`⚡ [ជំហាន ២/៣] កំពុងតភ្ជាប់ Video Streams (${totalEpCount} ភាគ) ដោយប្រើ High-Speed Concat Demuxer (${elapsedSec}s)...`);
              return prev + 4;
            }
            if (prev < 94) {
              setStatusMessage(`⚡ [ជំហាន ៣/៣] កំពុង Finalize វីដេអូរឿងពេញ 1080p (${elapsedSec}s)...`);
              return Math.min(94, prev + 1);
            }
            return prev;
          });
        }, 1000);

        const payload = {
          folderName: activeFolderData.folderName,
          episodes: activeFolderData.episodes,
          burnSubtitles: bakeSubtitles,
          subtitleStyle: {
            preset: subPreset,
            fontFamily: subFontFamily,
            fontSize: subFontSize,
            highlightColor: subPreset === 'tiktok_pop' ? '#FACC15' : subPreset === 'cinematic_gold' ? '#FEF08A' : subPreset === 'neon_cyan' ? '#38BDF8' : '#FACC15',
            textColor: '#FFFFFF',
            bgBox: subPreset === 'tiktok_pop' ? 'pill_blur' : subPreset === 'neon_cyan' ? 'black_bar' : 'shadow',
            animationType: 'karaoke_word'
          },
          audioSettings: {
            ttsVolume: bakeDubbing ? ttsVolume : 0.0,
            bgmVolume: bakeBgm ? bgmVolume : 0.0,
            originalAudioVolume: originalAudioVolume
          },
          antiCopyright: {
            enabled: bakeAntiCopyright,
            flipHorizontal: acFlipHorizontal,
            colorFilter: acColorFilter,
            zoomScale: acZoomScale
          },
          watermark: {
            enabled: bakeWatermark,
            text: watermarkText,
            position: watermarkPos,
            opacity: watermarkOpacity
          },
          cleanerConfig: watermarkCleanerConfig || { enabled: false, zones: [] },
          lipSyncConfig: lipSyncConfig || { enabled: false },
          voiceRolesMapping: currentRecap?.voiceRolesMapping || (() => {
            try {
              const s = localStorage.getItem('khmer_dubber_voice_roles_mapping');
              return s ? JSON.parse(s) : undefined;
            } catch { return undefined; }
          })(),
          voiceApiKey: localStorage.getItem('gemini_voice_api_key') || localStorage.getItem('gemini_api_key') || '',
          kiriApiKey: localStorage.getItem('kiritts_api_key') || '',
          colabUrl: localStorage.getItem('voxcpm2_colab_url') || '',
          ttsSpeed: ttsSpeed || 1.25,
          resolution: resolution,
          title: activeFolderData.folderName
        };

        const res = await fetch('/api/render/merge-folder-series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        clearInterval(progressTimer);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || data.details || 'ការ Merge វីដេអូរឿងពេញមានបញ្ហា');
        }

        const data = await res.json();
        setProgress(100);
        setStatusMessage(`🎉 Merge រឿងពេញ (${data.totalEpisodes || totalEpCount} ភាគ) ជោគជ័យ ១០០%!`);
        setDownloadUrl(data.downloadUrl);
        setDownloadFileName(data.fileName);
        setIsRendering(false);
        return;
      }

      // -------------------------------------------------------------
      // SINGLE EPISODE EXPORT
      // -------------------------------------------------------------
      if (!currentRecap) {
        throw new Error('សូមជ្រើសរើសវីដេអូរឿងដើម្បី Export!');
      }

      setStatusMessage('កំពុងរៀបចំ Track សំឡេង TTS និង BGM...');
      let elapsedSec = 0;
      const progressTimer = setInterval(() => {
        elapsedSec++;
        setProgress((prev) => {
          if (prev < 30) {
            setStatusMessage(`កំពុងបង្កើតសំឡេង Khmer Neural Speech គ្រប់ឈុត (${elapsedSec}s)...`);
            return prev + 5;
          }
          if (prev < 60) {
            setStatusMessage(`កំពុងរៀបចំ Subtitles & HarfBuzz Engine (${elapsedSec}s)...`);
            return prev + 4;
          }
          if (prev < 85) {
            setStatusMessage(`កំពុង Render Video Studio Quality ដោយប្រើ FFmpeg Engine (${elapsedSec}s)...`);
            return prev + 3;
          }
          if (prev < 95) {
            setStatusMessage(`កំពុង Encode H.264 Video & Multi-track Audio (${elapsedSec}s)...`);
            return prev + 1;
          }
          if (prev < 98) {
            setStatusMessage(`កំពុងបញ្ចប់ការ Render និង Finalize MP4 Package (${elapsedSec}s)...`);
            return prev + 1;
          }
          return 98;
        });
      }, 1000);

      const payload = {
        videoUrl: currentRecap.videoUrl,
        videoFileName: currentRecap.videoFileName,
        bgmTrackUrl: bakeBgm ? currentRecap.bgmTrackUrl : null,
        bgmFileName: bakeBgm ? currentRecap.bgmFileName : null,
        segments: currentRecap.recap_segments || [],
        burnSubtitles: bakeSubtitles,
        subtitleStyle: {
          preset: subPreset,
          fontFamily: subFontFamily,
          fontSize: subFontSize,
          highlightColor: subPreset === 'tiktok_pop' ? '#FACC15' : subPreset === 'cinematic_gold' ? '#FEF08A' : subPreset === 'neon_cyan' ? '#38BDF8' : '#FACC15',
          textColor: '#FFFFFF',
          bgBox: subPreset === 'tiktok_pop' ? 'pill_blur' : subPreset === 'neon_cyan' ? 'black_bar' : 'shadow',
          animationType: 'karaoke_word'
        },
        audioSettings: {
          ttsVolume: bakeDubbing ? ttsVolume : 0.0,
          bgmVolume: bakeBgm ? bgmVolume : 0.0,
          originalAudioVolume: originalAudioVolume
        },
        antiCopyright: {
          enabled: bakeAntiCopyright,
          flipHorizontal: acFlipHorizontal,
          colorFilter: acColorFilter,
          zoomScale: acZoomScale
        },
        watermark: {
          enabled: bakeWatermark,
          text: watermarkText,
          position: watermarkPos,
          opacity: watermarkOpacity
        },
        cleanerConfig: watermarkCleanerConfig || { enabled: false, zones: [] },
        lipSyncConfig: lipSyncConfig || { enabled: false, faceEnhancer: true, pads: [0, 10, 0, 0], targetScope: 'all_dialogue' },
        voiceRolesMapping: currentRecap.voiceRolesMapping || (() => {
          try {
            const s = localStorage.getItem('khmer_dubber_voice_roles_mapping');
            return s ? JSON.parse(s) : undefined;
          } catch {
            return undefined;
          }
        })(),
        voiceApiKey: localStorage.getItem('gemini_voice_api_key') || localStorage.getItem('gemini_api_key') || '',
        kiriApiKey: localStorage.getItem('kiritts_api_key') || '',
        colabUrl: localStorage.getItem('voxcpm2_colab_url') || '',
        ttsSpeed: ttsSpeed || 1.25,
        resolution: resolution,
        title: currentRecap.movie_title || 'Recap_Video'
      };

      const res = await fetch('/api/render/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      clearInterval(progressTimer);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.details || 'ការ Render វីដេអូមានបញ្ហា');
      }

      const data = await res.json();
      setProgress(100);
      setStatusMessage('🎉 Render វីដេអូបានជោគជ័យ ១០០%!');
      setDownloadUrl(data.downloadUrl);
      setDownloadFileName(data.fileName);
      setIsRendering(false);

    } catch (err: any) {
      console.error('Render error:', err);
      setIsRendering(false);
      setError(err.message || 'ការ Render វីដេអូមិនបានសម្រេច។ សូមព្យាយាមម្តងទៀត!');
    }
  };

  const handleExportSrt = () => {
    const srt = generateSrtContent(currentRecap?.recap_segments || []);
    downloadSubtitleFile(srt, `${cleanFileName}.srt`, 'text/plain;charset=utf-8');
    setCopiedFormat('srt');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleExportVtt = () => {
    const vtt = generateVttContent(currentRecap?.recap_segments || [], currentRecap?.movie_title);
    downloadSubtitleFile(vtt, `${cleanFileName}.vtt`, 'text/vtt;charset=utf-8');
    setCopiedFormat('vtt');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleExportAss = () => {
    const ass = generateAssContent(currentRecap?.recap_segments || [], subtitleStyle, currentRecap?.movie_title);
    downloadSubtitleFile(ass, `${cleanFileName}.ass`, 'text/plain;charset=utf-8');
    setCopiedFormat('ass');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleExportFcpxml = () => {
    const fcpxml = generateFcpxmlContent(currentRecap);
    downloadSubtitleFile(fcpxml, `${cleanFileName}.fcpxml`, 'application/xml;charset=utf-8');
    setCopiedFormat('fcpxml');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 font-khmer">
                Render & Export Studio Hub
              </h3>
              <p className="text-[10px] text-slate-400 font-khmer">
                ទាញយក Video MP4 សម្រេច, Subtitles (.SRT/.VTT/.ASS) និង CapCut/Premiere XML
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRendering}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 pt-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 font-khmer text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'video'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>🎬 Video MP4</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subtitles')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'subtitles'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>📝 Subtitles (.SRT / .ASS)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'audio'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>🎙️ Audio Tracks</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
          
          {/* EXPORT SCOPE SWITCH: Single Episode vs Folder/Series Export */}
          {availableFolders.length > 0 && (
            <div className="p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center gap-1 font-khmer text-xs">
              <button
                type="button"
                onClick={() => setExportScope('single')}
                className={`flex-1 py-1.5 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  exportScope === 'single'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>🎬 ភាគបច្ចុប្បន្ន (Episode)</span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('folder')}
                className={`flex-1 py-1.5 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  exportScope === 'folder'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>📁 Export ទាំង Folder ({availableFolders.length} Folders)</span>
              </button>
            </div>
          )}

          {/* FOLDER / SERIES EXPORT MODE SELECTOR */}
          {exportScope === 'folder' && activeFolderData ? (
            <div className="p-3.5 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-slate-950/80 border border-indigo-500/40 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-indigo-300 font-khmer flex items-center gap-1.5">
                  <span>📂 ជ្រើសរើស Folder ដែលត្រូវ Export៖</span>
                </label>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold font-mono">
                  {activeFolderData.episodes.length} ភាគ
                </span>
              </div>

              <select
                value={selectedFolderName}
                onChange={(e) => setSelectedFolderName(e.target.value)}
                className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl px-3 py-2 text-xs font-bold text-white font-khmer focus:outline-none focus:border-indigo-400"
              >
                {availableFolders.map((f) => (
                  <option key={f.folderName} value={f.folderName}>
                    📁 {f.folderName} ({f.episodes.length} ភាគ)
                  </option>
                ))}
              </select>

              {/* Folder Render Mode Switcher: Batch Episodes vs Merge Full Series */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setFolderExportMode('batch_episodes')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                    folderExportMode === 'batch_episodes'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-md shadow-blue-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold font-khmer text-xs">
                    <span>📦 Batch Render គ្រប់ភាគ + ZIP</span>
                  </div>
                  <p className="text-[9.5px] text-slate-400 font-khmer leading-tight">
                    Render គ្រប់ភាគដាច់ដោយឡែក (MP4) និងវេចខ្ចប់ជា ZIP
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFolderExportMode('merge_series')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                    folderExportMode === 'merge_series'
                      ? 'bg-purple-600/20 border-purple-500 text-purple-200 shadow-md shadow-purple-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold font-khmer text-xs">
                    <span>🎬 Merge ជារឿងពេញ (1 Video)</span>
                  </div>
                  <p className="text-[9.5px] text-slate-400 font-khmer leading-tight">
                    តភ្ជាប់គ្រប់ភាគទាំងអស់បញ្ចូលគ្នាជារឿងពេញមួយខ្សែ
                  </p>
                </button>
              </div>

              {/* Episodes List Preview in Order */}
              <div className="space-y-1.5">
                <div className="text-[10.5px] font-bold text-slate-400 font-khmer flex justify-between">
                  <span>បញ្ជីភាគដែលនឹងត្រូវ Render ({folderExportMode === 'batch_episodes' ? 'ម្តងទាំងអស់' : 'Merge ចូលគ្នា'})៖</span>
                  <span className="font-mono text-amber-400">Total: {activeFolderData.episodes.length} ភាគ</span>
                </div>
                <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                  {activeFolderData.episodes.map((ep, idx) => (
                    <div
                      key={`export_ep_${ep.id || ep.movie_title || 'item'}_${idx}`}
                      className="p-2 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-lg bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                          {ep.episodeNumber || idx + 1}
                        </span>
                        <span className="font-khmer text-slate-200 truncate text-[11px]">
                          {ep.movie_title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                        {ep.total_recap_duration_est || 'Ready'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Movie Title & Info Banner (Single Episode) */
            <div className="p-3 bg-slate-950/80 border border-slate-800/90 rounded-2xl flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-xs text-slate-200 truncate font-khmer mb-0.5">
                  🎬 {currentRecap?.movie_title || 'Untitled Movie'}
                </h4>
                <p className="text-[10px] font-mono text-slate-400">
                  រយៈពេល៖ {currentRecap?.total_recap_duration_est || '03:00'} • {(currentRecap?.recap_segments || []).length} ឃ្លា
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-mono">
                Ready
              </span>
            </div>
          )}

          {/* TAB 1: VIDEO MP4 EXPORT */}
          {activeTab === 'video' && (
            <div className="space-y-3.5">
              
              {/* ========================================================= */}
              {/* 🎬 LIVE RESULT PREVIEW (WYSIWYG STUDIO PREVIEW CANVAS)    */}
              {/* ========================================================= */}
              <div className="bg-slate-950/80 border border-indigo-500/30 rounded-2xl p-3 space-y-2.5 shadow-xl shadow-indigo-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs">
                      <Eye className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 font-khmer flex items-center gap-1.5">
                        <span>Live Result Preview</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono">WYSIWYG</span>
                      </h4>
                      <p className="text-[9.5px] text-slate-400 font-khmer">
                        មើលគំរូជាក់ស្ដែងនៃ Font, ស្ទីល Subtitles, Watermark និងខែលការពារ
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Aspect Ratio Switch */}
                    <button
                      type="button"
                      onClick={() => setPreviewAspect(previewAspect === '16:9' ? '9:16' : '16:9')}
                      className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-[10px] font-mono font-bold text-slate-300 transition cursor-pointer"
                      title="Switch 16:9 Landscape / 9:16 TikTok Portrait"
                    >
                      {previewAspect}
                    </button>

                    {/* Toggle Collapse/Expand */}
                    <button
                      type="button"
                      onClick={() => setShowLivePreview(!showLivePreview)}
                      className="p-1 rounded-lg bg-slate-900 border border-slate-700 hover:text-white text-slate-400 transition cursor-pointer"
                    >
                      {showLivePreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {showLivePreview && (() => {
                  const segments = currentRecap?.recap_segments || [];
                  const activeSeg = segments[previewSegmentIndex] || null;
                  const previewText = activeSeg?.khmer_script || currentRecap?.movie_title || 'ស្វាគមន៍មកកាន់ BT-Dubber Studio - វីដេអូសម្រាយរឿងកម្រិត Studio HD';
                  const words = previewText.trim().split(/\s+/).filter(Boolean);

                  // Watermark Position Classes
                  const wmPosClass = 
                    watermarkPos === 'top-left' ? 'top-3 left-3' :
                    watermarkPos === 'bottom-left' ? 'bottom-3 left-3' :
                    watermarkPos === 'bottom-right' ? 'bottom-3 right-3' :
                    watermarkPos === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
                    'top-3 right-3';

                  // Font Family Mapping
                  const fontFamStyle = 
                    subFontFamily === 'Battambang' ? 'Battambang, cursive' :
                    subFontFamily === 'Moul' ? 'Moul, serif' :
                    subFontFamily === 'Siemreap' ? 'Siemreap, sans-serif' :
                    'Kantumruy Pro, sans-serif';

                  // Font Size Classes
                  const fontSizeClass =
                    subFontSize === 'sm' ? 'text-xs sm:text-sm' :
                    subFontSize === 'md' ? 'text-sm sm:text-base' :
                    subFontSize === 'lg' ? 'text-base sm:text-lg font-bold' :
                    'text-lg sm:text-xl font-extrabold';

                  // Anti-Copyright Filter CSS
                  const acTransform = `${bakeAntiCopyright && acFlipHorizontal ? 'scaleX(-1)' : 'scaleX(1)'} scale(${bakeAntiCopyright ? (acZoomScale || 1.0) : 1.0})`;
                  const acFilter = !bakeAntiCopyright ? 'none' :
                    acColorFilter === 'cinematic_warm' ? 'sepia(0.2) saturate(1.18) contrast(1.06) hue-rotate(-4deg)' :
                    acColorFilter === 'cinematic_cool' ? 'saturate(0.92) contrast(1.08) hue-rotate(12deg)' :
                    acColorFilter === 'golden_hour' ? 'sepia(0.35) saturate(1.3) contrast(1.1) brightness(1.04)' :
                    acColorFilter === 'vibrant_boost' ? 'saturate(1.35) contrast(1.15) brightness(1.02)' :
                    'none';

                  return (
                    <div className="space-y-2">
                      {/* Video Screen Simulation */}
                      <div 
                        className={`relative mx-auto w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl transition-all ${
                          previewAspect === '9:16' ? 'max-w-[240px] aspect-[9/16]' : 'aspect-video max-w-full'
                        }`}
                      >
                        {/* Background Video / Cinema Poster */}
                        {currentRecap?.videoUrl ? (
                          <video
                            src={currentRecap.videoUrl}
                            muted
                            playsInline
                            className="w-full h-full object-cover select-none pointer-events-none"
                            style={{
                              transform: acTransform,
                              filter: acFilter,
                              transition: 'transform 0.3s ease, filter 0.3s ease'
                            }}
                          />
                        ) : (
                          <div 
                            className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 flex items-center justify-center relative overflow-hidden"
                            style={{
                              transform: acTransform,
                              filter: acFilter,
                              transition: 'transform 0.3s ease, filter 0.3s ease'
                            }}
                          >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0,transparent_70%)]" />
                            <Film className="w-12 h-12 text-slate-700/60" />
                          </div>
                        )}

                        {/* Visual Protection Indicators (Top-Left Badge) */}
                        {bakeAntiCopyright && (
                          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 z-20 pointer-events-none">
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/80 backdrop-blur-xs text-slate-950 text-[9px] font-bold font-khmer flex items-center gap-1 shadow-sm">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>Shield Active</span>
                            </span>
                            {acFlipHorizontal && (
                              <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-amber-300 text-[8.5px] font-mono border border-amber-500/30">
                                Flip ⇄
                              </span>
                            )}
                            {acColorFilter !== 'none' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-purple-300 text-[8.5px] font-mono border border-purple-500/30">
                                {acColorFilter}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Channel Watermark Layer */}
                        {bakeWatermark && watermarkText && (
                          <div 
                            className={`absolute ${wmPosClass} z-20 pointer-events-none transition-all`}
                            style={{ opacity: watermarkOpacity }}
                          >
                            <div className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/20 text-white text-[10.5px] font-bold font-khmer shadow-lg flex items-center gap-1">
                              <Stamp className="w-3 h-3 text-orange-400" />
                              <span>{watermarkText}</span>
                            </div>
                          </div>
                        )}

                        {/* Subtitles Overlay Layer */}
                        {bakeSubtitles && (
                          <div className="absolute bottom-3.5 left-3 right-3 flex justify-center items-end z-30 pointer-events-none">
                            <div 
                              className={`transition-all duration-200 text-center max-w-[90%] ${
                                subPreset === 'tiktok_pop' 
                                  ? 'bg-black/75 backdrop-blur-md rounded-2xl px-4 py-1.5 border border-yellow-400/30 shadow-2xl'
                                  : subPreset === 'neon_cyan'
                                  ? 'bg-slate-950/85 backdrop-blur-md rounded-2xl px-4 py-1.5 border border-cyan-400/40 shadow-2xl text-cyan-100'
                                  : subPreset === 'cinematic_gold'
                                  ? 'text-yellow-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]'
                                  : 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]'
                              }`}
                              style={{ fontFamily: fontFamStyle }}
                            >
                              <div className={`${fontSizeClass} leading-relaxed flex flex-wrap justify-center items-center gap-1.5`}>
                                {words.map((w, wIdx) => {
                                  const isHighlighted = previewPlaying && (wIdx === activeWordHighlightIdx);
                                  return (
                                    <span 
                                      key={`preview_word_${wIdx}_${w}`}
                                      className={`transition-all duration-150 ${
                                        isHighlighted 
                                          ? subPreset === 'tiktok_pop' ? 'text-yellow-300 font-extrabold scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]' 
                                          : subPreset === 'neon_cyan' ? 'text-cyan-300 font-extrabold scale-110 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]'
                                          : subPreset === 'cinematic_gold' ? 'text-amber-300 font-extrabold scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                                          : 'text-white font-extrabold scale-110 underline'
                                          : subPreset === 'tiktok_pop' ? 'text-white' 
                                          : subPreset === 'neon_cyan' ? 'text-cyan-100' 
                                          : subPreset === 'cinematic_gold' ? 'text-amber-100' 
                                          : 'text-slate-100'
                                      }`}
                                    >
                                      {w}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Preview Scene Navigation Bar */}
                      {segments.length > 0 && (
                        <div className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewPlaying(!previewPlaying)}
                              className={`p-1 rounded-lg border transition cursor-pointer ${
                                previewPlaying 
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                                  : 'bg-slate-800 border-slate-700 text-slate-400'
                              }`}
                              title={previewPlaying ? 'Pause Karaoke Highlight' : 'Play Karaoke Highlight'}
                            >
                              {previewPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            </button>
                            <span className="text-[10px] text-slate-400 font-khmer">
                              {previewPlaying ? 'Karaoke Highlight Active' : 'Highlight Paused'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={previewSegmentIndex <= 0}
                              onClick={() => {
                                setPreviewSegmentIndex(Math.max(0, previewSegmentIndex - 1));
                                setActiveWordHighlightIdx(0);
                              }}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition cursor-pointer"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-mono text-indigo-300 px-1.5 font-bold">
                              ឈុត {previewSegmentIndex + 1} / {segments.length}
                            </span>
                            <button
                              type="button"
                              disabled={previewSegmentIndex >= segments.length - 1}
                              onClick={() => {
                                setPreviewSegmentIndex(Math.min(segments.length - 1, previewSegmentIndex + 1));
                                setActiveWordHighlightIdx(0);
                              }}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition cursor-pointer"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Studio Features Baking Control Panel */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 font-khmer flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>ជ្រើសរើស និងកំណត់មុខងារដែលត្រូវ Baked ចូលក្នុង Video៖</span>
                </label>

                {/* 1. Khmer AI Dubbing Track Control */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={bakeDubbing}
                        onChange={(e) => setBakeDubbing(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-500 bg-slate-800 border-slate-700 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <Mic className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-bold text-slate-200 font-khmer">Khmer AI Dubbing (សំឡេងបកប្រែ)</span>
                      </div>
                    </label>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono font-bold">
                      {Math.round(ttsVolume * 100)}% Volume
                    </span>
                  </div>

                  {bakeDubbing && (
                    <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                      {/* Volume Slider */}
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 font-khmer whitespace-nowrap">កម្រិតឮសំឡេងនិយាយ៖</span>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.05"
                          value={ttsVolume}
                          onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
                          className="flex-1 accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] font-mono text-blue-300 w-10 text-right">
                          {Math.round(ttsVolume * 100)}%
                        </span>
                      </div>

                      {/* TTS Speed Controls with presets */}
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-800/50">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-300 font-khmer flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>ល្បឿនសំឡេងនិយាយបកប្រែ (TTS Speed)៖</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-amber-400">
                            {ttsSpeed.toFixed(2)}x
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { label: '1.0x (ធម្មតា)', speed: 1.0 },
                            { label: '1.15x (រហ័ស)', speed: 1.15 },
                            { label: '1.25x (ស្តង់ដារ ⚡)', speed: 1.25 },
                            { label: '1.35x (លឿន)', speed: 1.35 }
                          ].map((item) => (
                            <button
                              key={`export_speed_${item.speed}`}
                              type="button"
                              onClick={() => handleTtsSpeedChange(item.speed)}
                              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition font-khmer cursor-pointer border ${
                                Math.abs(ttsSpeed - item.speed) < 0.03
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-xs'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        {/* Auto-Sync Scene Duration Indicator */}
                        <div className="flex items-center justify-between text-[9.5px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 rounded-lg px-2.5 py-1 font-khmer mt-1">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Auto-Sync Scene (តម្រឹមល្បឿនស្វ័យប្រវត្តិកុំឱ្យយឺតជាងសកម្មភាពរឿង)</span>
                          </span>
                          <span className="font-bold font-mono text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/30">Active</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Isolated BGM & Original Audio Track Control */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={bakeBgm}
                        onChange={(e) => setBakeBgm(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-slate-700 focus:ring-emerald-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <Music className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-slate-200 font-khmer">Isolated BGM (ភ្លេងកំដរ)</span>
                      </div>
                    </label>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                      {bakeBgm ? `${Math.round(bgmVolume * 100)}% Volume` : 'Disabled'}
                    </span>
                  </div>

                  {bakeBgm && (
                    <div className="space-y-2 pt-1 border-t border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 font-khmer whitespace-nowrap">កម្រិតឮភ្លេង BGM៖</span>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.05"
                          value={bgmVolume}
                          onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                          className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] font-mono text-emerald-300 w-10 text-right">
                          {Math.round(bgmVolume * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10.5px] font-khmer pt-1">
                        <span className="text-slate-400">សំឡេងវីដេអូដើម (Original Video Audio)៖</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setOriginalAudioVolume(0.0)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                              originalAudioVolume === 0.0 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            🔇 បិទសំឡេងដើម (Mute)
                          </button>
                          <button
                            type="button"
                            onClick={() => setOriginalAudioVolume(0.12)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                              originalAudioVolume > 0.0 ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            🔉 ឮតិចៗ (12%)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Burn-in Khmer Subtitles Control */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={bakeSubtitles}
                        onChange={(e) => setBakeSubtitles(e.target.checked)}
                        className="w-4 h-4 rounded text-pink-500 bg-slate-800 border-slate-700 focus:ring-pink-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-pink-400" />
                        <span className="text-xs font-bold text-slate-200 font-khmer">Burn-in Subtitles (ដុតអក្សររត់លើ Video)</span>
                      </div>
                    </label>
                    <span className="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-mono font-bold">
                      {bakeSubtitles ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  {bakeSubtitles && (
                    <div className="space-y-2.5 pt-1 border-t border-slate-800/80 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400 font-khmer block mb-1">Font អក្សរខ្មែរ (TrueType)៖</label>
                          <select
                            value={subFontFamily}
                            onChange={(e) => setSubFontFamily(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-khmer focus:outline-none"
                          >
                            <option value="Kantumruy Pro">Kantumruy Pro (ស្តង់ដារ)</option>
                            <option value="Battambang">Battambang (បាត់ដំបង)</option>
                            <option value="Moul">Moul (អក្សរមូល)</option>
                            <option value="Khmer UI">Khmer UI (Windows)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 font-khmer block mb-1">ទំហំអក្សរ (Size)៖</label>
                          <div className="grid grid-cols-4 gap-1">
                            {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => setSubFontSize(sz)}
                                className={`py-1 rounded text-[10px] font-mono font-bold border transition ${
                                  subFontSize === sz
                                    ? 'bg-pink-600 text-white border-pink-500'
                                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                                }`}
                              >
                                {sz.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Animation & Preset Selector */}
                      <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-khmer block font-bold">
                          ស្ទីលរត់អក្សរ & Animation (Karaoke Pop-in)៖
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { id: 'tiktok_pop', label: '⚡ TikTok Pop', color: 'text-amber-400' },
                            { id: 'cinematic_gold', label: '🎬 Gold VIP', color: 'text-yellow-300' },
                            { id: 'neon_cyan', label: '💎 Neon Cyan', color: 'text-cyan-400' },
                            { id: 'classic', label: '✨ Clean White', color: 'text-slate-200' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSubPreset(p.id as any)}
                              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition font-khmer cursor-pointer ${
                                subPreset === p.id
                                  ? 'bg-pink-500/20 border-pink-500 text-pink-300 shadow-xs'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span className={p.color}>{p.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* HarfBuzz Engine Badge */}
                        <div className="flex items-center justify-between text-[9.5px] text-pink-400 bg-pink-950/30 border border-pink-500/20 rounded-lg px-2.5 py-1 font-khmer mt-1">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-pink-400 shrink-0" />
                            <span>HarfBuzz Khmer Engine (ស្គាល់ដៃជើង ជើងអក្សរ និងស្រៈត្រឹមត្រូវ ១០០%)</span>
                          </span>
                          <span className="font-bold font-mono text-[9px] px-1.5 py-0.2 rounded bg-pink-500/20 border border-pink-500/30">Active</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Channel Watermark Control */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={bakeWatermark}
                        onChange={(e) => setBakeWatermark(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-500 bg-slate-800 border-slate-700 focus:ring-orange-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <Stamp className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-bold text-slate-200 font-khmer">Channel Watermark (ស្លាកឈ្មោះឆានែល)</span>
                      </div>
                    </label>
                    <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-mono font-bold">
                      {bakeWatermark ? watermarkPos : 'Disabled'}
                    </span>
                  </div>

                  {bakeWatermark && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                      <div>
                        <label className="text-[10px] text-slate-400 font-khmer block mb-1">ឈ្មោះ Watermark (ស្គាល់អក្សរខ្មែរ ១០០%)៖</label>
                        <input
                          type="text"
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder="@BTDubber - រឿងភាគ"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-khmer focus:outline-none focus:border-orange-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-khmer block mb-1">ទីតាំង (Position)៖</label>
                        <select
                          value={watermarkPos}
                          onChange={(e) => setWatermarkPos(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-khmer focus:outline-none"
                        >
                          <option value="top-right">ខាងលើស្តាំ (Top Right)</option>
                          <option value="top-left">ខាងលើឆ្វេង (Top Left)</option>
                          <option value="bottom-right">ខាងក្រោមកស្តាំ (Bottom Right)</option>
                          <option value="bottom-left">ខាងក្រោមឆ្វេង (Bottom Left)</option>
                          <option value="center">កណ្តាល (Center)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Anti-Copyright Shield (Off by default for pristine video clarity & no flip) */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={bakeAntiCopyright}
                        onChange={(e) => setBakeAntiCopyright(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-amber-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-200 font-khmer">Anti-Copyright Shield (ការពាររក្សាសិទ្ធិ)</span>
                      </div>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-khmer ${
                        bakeAntiCopyright ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {bakeAntiCopyright ? '🛡️ កំពុងការពារ' : 'បិទ (វីដេអូដើម ១០០%)'}
                      </span>
                      {bakeAntiCopyright && (
                        <button
                          type="button"
                          onClick={() => setShowAcDetails(!showAcDetails)}
                          className="p-1 rounded text-slate-400 hover:text-white"
                        >
                          {showAcDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {bakeAntiCopyright && showAcDetails && (
                    <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-300 font-khmer">Flip ឆ្វេង-ស្តាំ (Horizontal Flip)៖</span>
                        <input
                          type="checkbox"
                          checked={acFlipHorizontal}
                          onChange={(e) => setAcFlipHorizontal(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-500"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-300 font-khmer">តម្រងពណ៌ (Color Grading)៖</span>
                        <select
                          value={acColorFilter}
                          onChange={(e) => setAcColorFilter(e.target.value as any)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 font-khmer"
                        >
                          <option value="none">គ្មាន (Original Colors)</option>
                          <option value="cinematic_warm">Cinematic Warm</option>
                          <option value="cinematic_cool">Cinematic Cool</option>
                          <option value="golden_hour">Golden Hour</option>
                          <option value="vibrant_boost">Vibrant Boost</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-300 font-khmer">ពង្រីកបន្តិច (Micro Zoom)៖</span>
                        <input
                          type="range"
                          min="1.0"
                          max="1.15"
                          step="0.01"
                          value={acZoomScale}
                          onChange={(e) => setAcZoomScale(parseFloat(e.target.value))}
                          className="w-28 accent-amber-500 h-1.5 bg-slate-800 rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ========================================================= */}
                {/* 🛡️ CAPCUT-STYLE COPYRIGHT CHECKER ACTION CARD              */}
                {/* ========================================================= */}
                <div className="p-3 bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-900 border border-indigo-500/40 rounded-2xl flex items-center justify-between shadow-lg shadow-indigo-950/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-emerald-500/20 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-white font-khmer">
                          មុខងារឆែក Copyright (ដូច CapCut)
                        </h4>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-mono font-bold">
                          AI ContentID
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-khmer">
                        វិភាគ Audio Waves, BGM, សំឡេងដើម និង Video Shield មុនពេល Export
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunCopyrightCheck}
                    disabled={isCheckingCopyright}
                    className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-khmer font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isCheckingCopyright ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>កំពុងវិភាគ...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>ឆែក Copyright ឥឡូវនេះ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Resolution Choice */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 font-khmer">
                  ជ្រើសរើសគុណភាព Resolution៖
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution('1080p')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition cursor-pointer flex flex-col items-center gap-0.5 ${
                      resolution === '1080p'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-mono text-[11px]">1080p Full HD</span>
                    <span className="text-[8.5px] text-slate-500 font-khmer">(ច្បាស់ខ្លាំង)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolution('original')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition cursor-pointer flex flex-col items-center gap-0.5 ${
                      resolution === 'original'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-mono text-[11px]">Original Ratio</span>
                    <span className="text-[8.5px] text-slate-500 font-khmer">(ទំហំវីដេអូដើម)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolution('720p')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition cursor-pointer flex flex-col items-center gap-0.5 ${
                      resolution === '720p'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-mono text-[11px]">720p HD</span>
                    <span className="text-[8.5px] text-slate-500 font-khmer">(Render លឿន)</span>
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Rendering Progress Indicator */}
              {isRendering && (
                <div className="p-3.5 bg-slate-950 border border-blue-500/40 rounded-2xl space-y-2 animate-pulse">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-khmer font-bold text-blue-300 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{statusMessage}</span>
                    </span>
                    <span className="font-mono font-bold text-blue-400">{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Completed Download Card (Single Video vs Batch ZIP & Episodes) */}
              {batchResult && (
                <div className="p-4 bg-gradient-to-br from-emerald-950/80 via-teal-950/60 to-slate-950 border border-emerald-500/50 rounded-2xl space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-xs sm:text-sm text-emerald-300 font-khmer truncate">
                        🎉 Batch Render បានជោគជ័យ ({batchResult.totalRendered} ភាគ)!
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Folder: {selectedFolderName} • កញ្ចប់ ZIP រួចរាល់
                      </p>
                    </div>
                  </div>

                  {/* 🎬 Batch Episode Video Preview Player */}
                  {batchResult.files && batchResult.files.length > 0 && (
                    <div className="rounded-xl overflow-hidden bg-black/90 border border-emerald-500/40 shadow-inner">
                      <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-khmer font-bold">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Video Preview ផ្ទៀងផ្ទាត់៖</span>
                          <span className="text-slate-200 font-mono text-[11px] font-normal truncate max-w-[200px]">
                            {selectedBatchPreviewTitle || batchResult.files[0]?.title || batchResult.files[0]?.fileName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {resolution.toUpperCase()}
                        </span>
                      </div>
                      <video
                        key={selectedBatchPreviewUrl || batchResult.files[0]?.downloadUrl}
                        src={selectedBatchPreviewUrl || batchResult.files[0]?.downloadUrl}
                        controls
                        playsInline
                        preload="auto"
                        className="w-full max-h-56 object-contain bg-black mx-auto"
                      />
                    </div>
                  )}

                  {/* Big ZIP Download Button */}
                  {batchResult.zipUrl && (
                    <a
                      href={batchResult.zipUrl}
                      download={batchResult.zipFileName || 'series_bundle.zip'}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-khmer font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>⬇️ ទាញយក ZIP គ្រប់ភាគទាំងអស់ ({batchResult.totalRendered} ភាគ)</span>
                    </a>
                  )}

                  {/* Individual Episode Downloads List with 1-Click Preview */}
                  {batchResult.files && batchResult.files.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                      <div className="text-[10.5px] font-bold text-slate-400 font-khmer flex justify-between">
                        <span>ជ្រើសរើសភាគដើម្បី Preview ឬទាញយក MP4៖</span>
                        <span className="font-mono text-emerald-400">{batchResult.files.length} Files</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                        {batchResult.files.map((f, fIdx) => {
                          const isCurrentlyPreviewing = (selectedBatchPreviewUrl === f.downloadUrl) || (!selectedBatchPreviewUrl && fIdx === 0);
                          return (
                            <div
                              key={`batch_file_${f.fileName || fIdx}`}
                              className={`p-2 rounded-xl flex items-center justify-between gap-2 text-xs transition border ${
                                isCurrentlyPreviewing 
                                  ? 'bg-emerald-950/70 border-emerald-500/60 shadow-sm' 
                                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                                  isCurrentlyPreviewing ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-600/30 text-emerald-300'
                                }`}>
                                  {f.episodeNumber || fIdx + 1}
                                </span>
                                <span className="font-khmer text-slate-200 truncate text-[11px]">
                                  {f.title || f.fileName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBatchPreviewUrl(f.downloadUrl);
                                    setSelectedBatchPreviewTitle(f.title || f.fileName);
                                  }}
                                  className={`py-1 px-2.5 rounded-lg font-khmer font-bold text-[10px] flex items-center gap-1 transition cursor-pointer ${
                                    isCurrentlyPreviewing
                                      ? 'bg-emerald-500 text-slate-950 font-bold'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                  }`}
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>{isCurrentlyPreviewing ? 'កំពុងមើល' : 'Preview'}</span>
                                </button>
                                <a
                                  href={f.downloadUrl}
                                  download={f.fileName}
                                  className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white font-khmer font-bold text-[10px] flex items-center gap-1 transition shrink-0 cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>MP4</span>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Completed Download Card (Single Video & Full Merged Movie with Video Preview) */}
              {!batchResult && downloadUrl && (
                <div className="p-4 bg-emerald-950/70 border border-emerald-500/60 rounded-2xl space-y-3.5 text-center animate-fadeIn shadow-xl shadow-emerald-950/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-bold text-sm text-emerald-300 font-khmer">
                        Video MP4 ត្រូវបាន Render រួចរាល់!
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-900/80 text-emerald-300 border border-emerald-700/60">
                      {resolution.toUpperCase()} Full HD
                    </span>
                  </div>

                  {/* 🎬 Embedded Interactive Video Preview Player */}
                  <div className="relative rounded-xl overflow-hidden bg-black/95 border border-emerald-500/40 shadow-inner">
                    <video
                      key={downloadUrl}
                      src={downloadUrl}
                      controls
                      playsInline
                      preload="auto"
                      className="w-full max-h-72 object-contain bg-black mx-auto"
                    />
                    <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono truncate max-w-[260px] text-slate-300 text-left">
                        {downloadFileName}
                      </span>
                      <span className="font-khmer text-emerald-400 flex items-center gap-1 text-[10.5px]">
                        <Eye className="w-3.5 h-3.5" />
                        <span>ចុច Play ដើម្បីស្តាប់សំឡេង & មើល Subtitle</span>
                      </span>
                    </div>
                  </div>

                  <a
                    href={downloadUrl}
                    download={downloadFileName || 'recap_video.mp4'}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-khmer font-bold text-sm shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>⬇️ ទាញយក Video MP4 ({resolution.toUpperCase()})</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SUBTITLES EXPORT (.SRT, .VTT, .ASS, CapCut XML) */}
          {activeTab === 'subtitles' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300 font-khmer">
                ទាញយកឯកសារ Subtitle សម្រាប់យកទៅប្រើជាមួយ CapCut, Premiere Pro, DaVinci Resolve ឬ YouTube/Facebook៖
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* SRT Exporter */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-amber-400">.SRT (SubRip)</span>
                      <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">Universal</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-khmer mt-1">
                      ស្តង់ដារ Subtitle ប្រើបានគ្រប់កម្មវិធី (Premiere, CapCut, YouTube)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportSrt}
                    className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedFormat === 'srt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-amber-400" />}
                    <span>ទាញយក .SRT</span>
                  </button>
                </div>

                {/* VTT Exporter */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-blue-400">.VTT (WebVTT)</span>
                      <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">Web / HTML5</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-khmer mt-1">
                      ល្អបំផុតសម្រាប់ Web Players, Mobile Video, និង Facebook Video
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportVtt}
                    className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedFormat === 'vtt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-blue-400" />}
                    <span>ទាញយក .VTT</span>
                  </button>
                </div>

                {/* ASS Exporter */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-pink-400">.ASS (Advanced)</span>
                      <span className="text-[9px] bg-pink-950 text-pink-300 border border-pink-800 px-1.5 py-0.5 rounded font-mono">Custom Style</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-khmer mt-1">
                      បង្កប់ Font ខ្មែរ (Kantumruy/Moul), ពណ៌ និងបន្ទាត់គែមស្រស់ស្អាត
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportAss}
                    className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedFormat === 'ass' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-pink-400" />}
                    <span>ទាញយក .ASS</span>
                  </button>
                </div>

                {/* CapCut / FCPXML Exporter */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-emerald-400">.FCPXML / CapCut</span>
                      <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">Timeline</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-khmer mt-1">
                      Export Timeline Markers សម្រាប់បើកបន្តលើ CapCut / Final Cut Pro
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportFcpxml}
                    className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedFormat === 'fcpxml' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>ទាញយក .FCPXML</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIO TRACKS EXPORT */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300 font-khmer">
                ទាញយក Track សំឡេងបកប្រែខ្មែរដាច់ដោយឡែក ឬ Track ភ្លេង BGM សុទ្ធ៖
              </p>

              <div className="space-y-2">
                {currentRecap?.bgmTrackUrl ? (
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Music className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-bold text-xs text-slate-200 font-khmer">Track ភ្លេង BGM (Instrumental)</h5>
                        <p className="text-[10px] text-slate-400 font-mono">បានបំបែកសំឡេងមនុស្សចេញរួចរាល់</p>
                      </div>
                    </div>
                    <a
                      href={currentRecap.bgmTrackUrl}
                      download={`${cleanFileName}_bgm.mp3`}
                      className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-khmer font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ទាញយក BGM</span>
                    </a>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-500 font-khmer">
                    មិនទាន់បានបំបែក Track ភ្លេង BGM នៅឡើយទេ។ អ្នកអាចចុចប៊ូតុង "បំបែកភ្លេង BGM" នៅលើ Timeline Panel បាន។
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
            <span>BT-Dubber Studio Engine v2.5</span>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'video' && !downloadUrl && (
              <button
                type="button"
                onClick={handleRunCopyrightCheck}
                disabled={isCheckingCopyright || isRendering}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-khmer font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                title="ពិនិត្យ Copyright តាមបែប CapCut"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🛡️ ឆែក Copyright</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isRendering}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-khmer font-bold transition cursor-pointer disabled:opacity-50"
            >
              បិទ
            </button>

            {activeTab === 'video' && !downloadUrl && (
              <button
                type="button"
                onClick={handleStartRender}
                disabled={isRendering}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-khmer font-bold text-xs shadow-lg shadow-blue-500/25 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {isRendering ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>កំពុង Render...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>🚀 ចាប់ផ្តើម Render Video</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ========================================================= */}
      {/* 🛡️ CAPCUT-STYLE COPYRIGHT AUDIT REPORT MODAL              */}
      {/* ========================================================= */}
      {showCopyrightModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col animate-scaleUp">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-slate-950 shadow-md font-bold">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white font-khmer">
                    របាយការណ៍ពិនិត្យ Copyright (Copyright Check)
                  </h3>
                  <p className="text-[10px] text-slate-400 font-khmer">
                    វិភាគដោយ BT-Dubber AI ContentID & Audio Shield Engine
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCopyrightModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {isCheckingCopyright ? (
                /* Scanning Radar Animation */
                <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping" />
                    <div className="absolute inset-2 rounded-full border-2 border-teal-500/40 animate-spin" />
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                      <Radio className="w-6 h-6 animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white font-khmer">
                      កំពុងពិនិត្យការរក្សាសិទ្ធិ Audio & Video...
                    </h4>
                    <p className="text-xs text-slate-400 font-khmer mt-1">
                      កំពុងវិភាគ Audio Waves, BGM, Original Track និង Anti-Copyright Shield
                    </p>
                  </div>
                </div>
              ) : copyrightReport ? (
                /* Audit Results */
                <div className="space-y-4">
                  {/* Score & Banner Card */}
                  <div className={`p-4 rounded-2xl border flex items-center gap-4 ${
                    copyrightReport.score >= 85
                      ? 'bg-emerald-950/40 border-emerald-500/40 shadow-lg shadow-emerald-950/30'
                      : copyrightReport.score >= 60
                      ? 'bg-amber-950/40 border-amber-500/40 shadow-lg shadow-amber-950/30'
                      : 'bg-red-950/40 border-red-500/40 shadow-lg shadow-red-950/30'
                  }`}>
                    {/* Big Circular Score */}
                    <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center shrink-0 border-2 font-mono ${
                      copyrightReport.score >= 85
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-md shadow-emerald-500/30'
                        : copyrightReport.score >= 60
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-md shadow-amber-500/30'
                        : 'border-red-400 bg-red-500/20 text-red-300 shadow-md shadow-red-500/30'
                    }`}>
                      <span className="text-lg font-black leading-none">{copyrightReport.score}%</span>
                      <span className="text-[8px] uppercase tracking-wider font-bold">Safety</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className={`text-xs sm:text-sm font-bold font-khmer ${
                        copyrightReport.score >= 85 ? 'text-emerald-300' : copyrightReport.score >= 60 ? 'text-amber-300' : 'text-red-300'
                      }`}>
                        {copyrightReport.statusTitle}
                      </h4>
                      <p className="text-[10.5px] text-slate-300 font-khmer mt-0.5 leading-relaxed">
                        {copyrightReport.statusDescription}
                      </p>
                    </div>
                  </div>

                  {/* Platform Compatibility Badges */}
                  <div className="space-y-1.5">
                    <label className="text-[10.5px] font-bold text-slate-400 font-khmer block">
                      ភាពឆបគ្នាលើបណ្តាញសង្គម (Platform Compatibility)៖
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {copyrightReport.platforms.map((p, pIdx) => (
                        <div 
                          key={`platform_card_${pIdx}`}
                          className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1"
                        >
                          <div className="text-[10px] font-bold text-slate-300 font-khmer truncate">
                            {p.name}
                          </div>
                          <div className={`text-[10.5px] font-bold font-khmer ${
                            p.status === 'passed' ? 'text-emerald-400' : p.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {p.badge}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detailed Checklist Breakdown */}
                  <div className="space-y-1.5">
                    <label className="text-[10.5px] font-bold text-slate-400 font-khmer block">
                      លម្អិតនៃការពិនិត្យ (Audit Checklist)៖
                    </label>
                    <div className="space-y-1.5">
                      {copyrightReport.checks.map((c, cIdx) => (
                        <div 
                          key={`check_item_${cIdx}`}
                          className="p-2.5 bg-slate-950/70 border border-slate-800/90 rounded-xl space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                              {c.status === 'passed' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : c.status === 'warning' ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : c.status === 'danger' ? (
                                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              ) : (
                                <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              )}
                              <span>{c.name}</span>
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ${
                              c.status === 'passed' ? 'bg-emerald-500/20 text-emerald-300' :
                              c.status === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                              c.status === 'danger' ? 'bg-red-500/20 text-red-300' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {c.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-slate-300 font-khmer pl-5">
                            {c.message}
                          </p>
                          {c.tip && (
                            <p className="text-[10px] text-amber-300/90 font-khmer pl-5 italic">
                              💡 {c.tip}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Auto-Fix Button if score < 95 */}
                  {copyrightReport.score < 95 && (
                    <button
                      type="button"
                      onClick={handleAutoFixCopyright}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-khmer font-bold text-xs shadow-lg shadow-orange-500/20 flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Zap className="w-4 h-4 fill-current" />
                      <span>⚡ ជួសជុលស្វ័យប្រវត្តិដើម្បីទទួលបានសុវត្ថិភាព ១០០% (Auto-Fix)</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-khmer">
                  សូមចុចប៊ូតុងខាងក្រោមដើម្បីចាប់ផ្តើមពិនិត្យ Copyright។
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
              <div className="text-[10px] text-slate-500 font-mono">
                CapCut Standard Copyright Analyzer
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunCopyrightCheck}
                  disabled={isCheckingCopyright}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>ពិនិត្យម្តងទៀត</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCopyrightModal(false)}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-khmer font-bold transition cursor-pointer"
                >
                  យល់ព្រម
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
