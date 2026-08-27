import React, { useState, useEffect } from 'react';
import { RecapStudio } from './components/RecapStudio';
import { EpisodeSequenceEditor } from './components/EpisodeSequenceEditor';
import { VideoCutterSplitterStudio } from './components/VideoCutterSplitterStudio';
import { VideoUploadModal } from './components/VideoUploadModal';
import { SavedRecapsModal } from './components/SavedRecapsModal';
import { ExportModal } from './components/ExportModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { TikTokImporterModal, TikTokEpisode, TikTokChannelInfo } from './components/TikTokImporterModal';
import { AutoUpdateModal } from './components/AutoUpdateModal';
import { GenerationParams, MovieRecapResult, TranslationMode, SeriesProject, EpisodeClip, RecapFolder } from './types';
import { DEFAULT_DEMO_RECAP } from './data/sampleTranscripts';
import { AlertTriangle } from 'lucide-react';
import { processAndExtractAudio } from './utils/mediaExtractor';
import { convertVideoToH264MP4, isLikelyUnsupportedVideo } from './utils/videoTranscoder';
import { extractBgmInstrumentalTrack } from './utils/vocalRemover';
import { parseTimecode } from './utils/sequenceUtils';

const DEFAULT_INITIAL_RECAP: MovieRecapResult = {
  movie_title: 'រឿងថ្មី (New Project)',
  total_recap_duration_est: '03:00',
  genre_tag: 'Drama / Action',
  created_at: new Date().toISOString(),
  recap_segments: []
};

export default function App() {
  const [activeMode, setActiveMode] = useState<'dubbing' | 'sequence' | 'cutter'>('dubbing');
  const [currentRecap, setCurrentRecap] = useState<MovieRecapResult>(DEFAULT_INITIAL_RECAP);
  const [translationMode, setTranslationMode] = useState<TranslationMode>('word_by_word_lip_sync');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRecaps, setSavedRecaps] = useState<MovieRecapResult[]>([]);
  const [folders, setFolders] = useState<RecapFolder[]>([]);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  // Multi-Episode Series Project State
  const [seriesProject, setSeriesProject] = useState<SeriesProject>(() => {
    return {
      id: `series_${Date.now()}`,
      title: 'ស៊េរីរឿងភាគថ្មី (Series Project)',
      description: 'CapCut-style multi-episode sequence timeline',
      aspectRatio: '16:9',
      clips: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
  
  // Direct API Key & Modals State
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const [customVoiceApiKey, setCustomVoiceApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('gemini_voice_api_key') || 'AQ.Ab8RN6I58B6n3T56izHKnR2hlxKBg7HEbabGtY0rLfOHmw7c5Q';
    } catch {
      return 'AQ.Ab8RN6I58B6n3T56izHKnR2hlxKBg7HEbabGtY0rLfOHmw7c5Q';
    }
  });
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [isTikTokModalOpen, setIsTikTokModalOpen] = useState<boolean>(false);
  const [isFolderExportModalOpen, setIsFolderExportModalOpen] = useState<boolean>(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [exportTargetFolderName, setExportTargetFolderName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [globalVoicePersona, setGlobalVoicePersona] = useState<string>('auto');
  const [ttsSpeed, setTtsSpeedState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tts_playback_speed');
      return saved ? Number(saved) : 1.25;
    } catch {
      return 1.25;
    }
  });

  const setTtsSpeed = (speed: number) => {
    setTtsSpeedState(speed);
    try {
      localStorage.setItem('tts_playback_speed', String(speed));
    } catch {}
  };

  // Auto-listen for update notifications from Electron main process
  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return;
    const unsub = window.electronAPI.onUpdateAvailable((info) => {
      console.log('[AutoUpdater] Update detected in App, opening modal:', info);
      setIsUpdateModalOpen(true);
    });
    return () => {
      unsub();
    };
  }, []);

  const fetchSavedRecaps = async () => {
    try {
      const res = await fetch('/api/db/recaps');
      if (res.ok) {
        const dbData: MovieRecapResult[] = await res.json();
        // Filter out dummy demo recaps
        const filtered = (dbData || []).filter(
          r => !r.movie_title.includes('Cyber Vault') &&
               !r.movie_title.includes('ប្លន់ធនាគារ') &&
               !r.movie_title.includes('ក្មេងស្រីអនាថា') &&
               !r.videoUrl?.includes('flower.mp4') &&
               ((r.recap_segments && r.recap_segments.length > 0) || Boolean(r.videoUrl) || Boolean(r.videoFileName) || Boolean(r.folderName) || Boolean(r.seriesTitle))
        );
        setSavedRecaps(filtered);
        return filtered;
      }
    } catch (e) {
      console.warn('Could not load recaps from SQLite DB, using local state:', e);
    }
    return [];
  };

  const fetchFolders = async () => {
    try {
      const foldersRes = await fetch('/api/db/folders');
      if (foldersRes.ok) {
        const folderList: RecapFolder[] = await foldersRes.json();
        const seen = new Set<string>();
        const unique = (folderList || []).filter(f => {
          const lower = (f.name || '').trim().toLowerCase();
          if (!lower || seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
        setFolders(unique);
        return unique;
      }
    } catch (e) {
      console.warn('Could not load folders from SQLite DB:', e);
    }
    return [];
  };

  // Load Saved Recaps, Folders, and Series from SQLite Database on start
  useEffect(() => {
    const loadFromDb = async () => {
      const recaps = await fetchSavedRecaps();
      if (recaps && recaps.length > 0) {
        setCurrentRecap(recaps[0]);
      }
      await fetchFolders();

      // 3. Load series projects
      try {
        const seriesRes = await fetch('/api/db/series');
        if (seriesRes.ok) {
          const seriesList: SeriesProject[] = await seriesRes.json();
          if (seriesList && seriesList.length > 0) {
            const activeProj = seriesList[0];
            const cleanedClips = (activeProj.clips || []).filter(
              c => c.id !== 'clip_demo_1' && !c.videoUrl?.includes('flower.mp4')
            );
            setSeriesProject({
              ...activeProj,
              clips: cleanedClips
            });
          }
        }
      } catch (e) {
        console.warn('Could not load series from SQLite DB:', e);
      }
    };

    loadFromDb();
  }, []);

  // 1. AUTO-SAVE RECAP TO SQLITE DB (Debounced)
  useEffect(() => {
    if (
      !currentRecap ||
      !currentRecap.movie_title ||
      currentRecap.movie_title.includes('Cyber Vault') ||
      currentRecap.movie_title.includes('ប្លន់ធនាគារ') ||
      currentRecap.movie_title.includes('ក្មេងស្រីអនាថា') ||
      currentRecap.videoUrl?.includes('flower.mp4')
    ) {
      return;
    }

    // Only auto-save if has segments or valid media
    const hasData = (currentRecap.recap_segments && currentRecap.recap_segments.length > 0) || Boolean(currentRecap.videoUrl) || Boolean(currentRecap.videoFileName);
    if (!hasData) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/db/recaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentRecap),
        });
        if (res.ok) {
          const saved: MovieRecapResult = await res.json();
          if (saved && saved.id && (currentRecap as any).id !== saved.id) {
            (currentRecap as any).id = saved.id;
          }
          // Update recent recaps list in-place without creating duplicate rows
          setSavedRecaps((prev) => {
            const targetId = (saved && (saved as any).id) || (currentRecap as any).id;
            const targetTitle = currentRecap.old_title || currentRecap.movie_title;
            const exists = prev.some(r => ((r as any).id && targetId && (r as any).id === targetId) || r.movie_title === targetTitle);
            
            let list: MovieRecapResult[];
            if (exists) {
              list = prev.map(r => {
                if (((r as any).id && targetId && (r as any).id === targetId) || r.movie_title === targetTitle) {
                  return saved || currentRecap;
                }
                return r;
              });
            } else {
              list = [saved || currentRecap, ...prev];
            }
            try {
              localStorage.setItem('khmer_recap_saved_scripts', JSON.stringify(list));
            } catch {}
            return list;
          });
          setSaveStatus('saved');
        }
      } catch (err) {
        console.warn('Auto-save recap to SQLite failed:', err);
        setSaveStatus('error');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [currentRecap]);

  // 2. AUTO-SAVE SERIES PROJECT TO SQLITE DB (Debounced)
  useEffect(() => {
    if (!seriesProject || !seriesProject.id) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/db/series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seriesProject),
        });
        if (res.ok) {
          setSaveStatus('saved');
        }
      } catch (err) {
        console.warn('Auto-save series project to SQLite failed:', err);
        setSaveStatus('error');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [seriesProject]);

  // Save custom Translation & Voice API keys to LocalStorage
  const handleSaveApiKey = (newTranslationKey: string, newVoiceKey: string) => {
    const trimmedTrans = newTranslationKey.trim();
    const trimmedVoice = newVoiceKey.trim();
    setCustomApiKey(trimmedTrans);
    setCustomVoiceApiKey(trimmedVoice);
    try {
      if (trimmedTrans) {
        localStorage.setItem('gemini_api_key', trimmedTrans);
      } else {
        localStorage.removeItem('gemini_api_key');
      }
      if (trimmedVoice) {
        localStorage.setItem('gemini_voice_api_key', trimmedVoice);
      } else {
        localStorage.removeItem('gemini_voice_api_key');
      }
    } catch (e) {
      console.error('Failed to save API keys to localStorage:', e);
    }
  };

  // Save to LocalStorage helper
  const saveRecapsToStorage = (list: MovieRecapResult[]) => {
    setSavedRecaps(list);
    try {
      localStorage.setItem('khmer_recap_saved_scripts', JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  };

  const handleGenerateRecap = async (params: GenerationParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (customApiKey) {
        headers['x-gemini-api-key'] = customApiKey;
      }

      const response = await fetch('/api/recap/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...params,
          customApiKey: customApiKey || undefined
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned error status ${response.status}`);
      }

      const data: MovieRecapResult = await response.json();
      data.created_at = new Date().toISOString();
      const finalVideoUrl = params.mediaUrl || currentRecap?.videoUrl || data.videoUrl;
      const finalVideoFileName = params.mediaFileName || currentRecap?.videoFileName || data.videoFileName;
      const finalMediaType = (params.inputMode === 'video' || params.mediaMimeType?.startsWith('video/')) ? 'video' : (currentRecap?.mediaType || 'video');

      const fullRecap: MovieRecapResult = {
        ...data,
        videoUrl: finalVideoUrl,
        videoFileName: finalVideoFileName,
        mediaType: finalMediaType,
        bgmTrackUrl: currentRecap?.bgmTrackUrl || data.bgmTrackUrl,
        bgmFileName: currentRecap?.bgmFileName || data.bgmFileName,
        rawFile: currentRecap?.rawFile
      };
      setCurrentRecap(fullRecap);

      // Auto persist to SQLite DB & savedRecaps
      try {
        await fetch('/api/db/recaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullRecap),
        });
        setSavedRecaps(prev => {
          const filtered = prev.filter(r => r.movie_title !== fullRecap.movie_title);
          return [fullRecap, ...filtered];
        });
      } catch (e) {
        console.warn('Auto-save to SQLite DB after generation failed:', e);
      }

    } catch (err: any) {
      console.error('Error in handleGenerateRecap:', err);
      setError(err.message || 'បរាជ័យក្នុងការបកប្រែ និងបង្កើតអត្ថបទសម្រាយរឿងខ្មែរ។ សូមព្យាយាមម្តងទៀត!');
    } finally {
      setIsLoading(false);
      setIsProcessingFile(false);
    }
  };

  // Video File Upload Handler inside Video Monitor & Header
  const handleFileUpload = async (
    file: File,
    episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }
  ) => {
    if (!file) return;
    setIsProcessingFile(true);
    setIsLoading(true);
    setError(null);

    const blobUrl = URL.createObjectURL(file);
    const movieTitle = episodeInfo
      ? `${episodeInfo.seriesTitle} - ភាគទី ${episodeInfo.episodeNumber}`
      : file.name.replace(/\.[^/.]+$/, '');

    // Instantly replace currentRecap with clean state for uploaded video
    setCurrentRecap({
      movie_title: movieTitle,
      seriesTitle: episodeInfo?.seriesTitle,
      episodeNumber: episodeInfo?.episodeNumber || 1,
      total_recap_duration_est: "03:00",
      genre_tag: "Movie Recap",
      created_at: new Date().toISOString(),
      videoUrl: blobUrl,
      videoFileName: file.name,
      mediaType: file.type.startsWith('video/') ? 'video' : 'audio',
      rawFile: file,
      recap_segments: []
    });

    // Save video file permanently to server storage so it never expires when reopening from DB
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/upload-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            console.log('✅ Video saved & auto-compressed on server:', data.url, data.isCompressed ? `(Saved ${data.savedPercent})` : '');
            setCurrentRecap((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                videoUrl: data.url,
                videoFileName: data.fileName || file.name
              };
            });
          }
        }
      } catch (uploadErr) {
        console.warn('Permanent media upload notice:', uploadErr);
      }
    };
    reader.readAsDataURL(file);

    // Auto-transcode iPhone / HEVC / MOV videos in parallel to standard H.264 Web MP4
    if (file.type.startsWith('video/') && isLikelyUnsupportedVideo(file)) {
      convertVideoToH264MP4(file, (percent, status) => {
        console.log(`[Auto-Transcode]: ${percent}% - ${status}`);
      }).then((convertedFile) => {
        const convertedBlobUrl = URL.createObjectURL(convertedFile);
        setCurrentRecap((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            videoUrl: convertedBlobUrl,
            videoFileName: convertedFile.name,
            rawFile: convertedFile
          };
        });
      }).catch((transcodeErr) => {
        console.warn('Background auto-transcode fallback:', transcodeErr);
      });
    }

    // Automatically isolate and extract BGM instrumental track in background (Strip dialogue/vocals)
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      extractBgmInstrumentalTrack(file, (percent, status) => {
        console.log(`[Auto-BGM Isolation]: ${percent}% - ${status}`);
      }, file.name).then(({ file: bgmFile, blobUrl: bgmUrl }) => {
        setCurrentRecap((prev) => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            bgmTrackUrl: bgmUrl,
            bgmFileName: bgmFile.name
          };
          fetch('/api/db/recaps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
          }).catch(() => {});
          return updated;
        });
      }).catch((bgmErr) => {
        console.warn('Background auto BGM extraction notice:', bgmErr);
      });
    }

    try {
      // Process and extract audio track in browser for ultra-fast & lightweight Gemini AI translation
      const { base64, mimeType } = await processAndExtractAudio(file);

      setIsProcessingFile(false);

      // Auto-generate Khmer recap script immediately via Gemini AI with episode continuity
      await handleGenerateRecap({
        transcript: '',
        mediaData: base64,
        mediaMimeType: mimeType,
        mediaFileName: file.name,
        mediaUrl: blobUrl,
        inputMode: 'video',
        translationMode: translationMode,
        sourceLanguage: 'auto',
        recapStyle: 'dramatic_action',
        targetDurationMin: 3,
        episodeNumber: episodeInfo?.episodeNumber,
        seriesTitle: episodeInfo?.seriesTitle,
        previousContext: episodeInfo?.previousContext
      });
    } catch (err: any) {
      console.error('Error processing uploaded file:', err);
      setIsProcessingFile(false);
      setIsLoading(false);
      setError(err.message || 'បរាជ័យក្នុងការអាន និងបកប្រែវីដេអូ។ សូមព្យាយាមម្តងទៀត!');
    }
  };

  // Handle TikTok episode selected from the importer modal
  const handleTikTokEpisodeInsert = async (episode: TikTokEpisode, channel: TikTokChannelInfo, dramaSeriesTitle?: string) => {
    const seriesName = dramaSeriesTitle || channel.nickname;
    const title = `${seriesName} - ភាគ ${episode.episodeNumber}`;
    const proxyUrl = episode.playUrl && episode.playUrl.startsWith('http')
      ? episode.playUrl
      : `/api/proxy-media?url=${encodeURIComponent(episode.videoUrl)}`;

    // Update or create recap with the TikTok episode video
    setCurrentRecap((prev) => ({
      ...(prev || DEFAULT_DEMO_RECAP!),
      movie_title: title,
      videoUrl: proxyUrl,
      videoFileName: `${seriesName}_EP_${episode.episodeNumber}.mp4`,
      mediaType: 'video' as const,
      episodeNumber: episode.episodeNumber,
      seriesTitle: seriesName,
      bgmTrackUrl: undefined, // Reset BGM so AI automatically isolates BGM for this episode
      bgmFileName: undefined,
    }));

    // Auto-extract BGM instrumental in background for new TikTok episode
    fetch(proxyUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `${seriesName}_EP_${episode.episodeNumber}.mp4`, { type: 'video/mp4' });
        return extractBgmInstrumentalTrack(file);
      })
      .then(({ file: bgmFile, blobUrl: bgmUrl }) => {
        setCurrentRecap((prev) => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            bgmTrackUrl: bgmUrl,
            bgmFileName: bgmFile.name
          };
          fetch('/api/db/recaps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
          }).catch(() => {});
          return updated;
        });
      })
      .catch((e) => console.warn('TikTok background BGM extraction notice:', e));

    // Trigger AI translation after a brief pause so the video state settles
    setTimeout(async () => {
      try {
        await handleGenerateRecap({
          transcript: `សម្រាយសាច់រឿង ${seriesName} - ភាគ ${episode.episodeNumber}: ${episode.title}`,
          inputMode: 'text',
          translationMode: translationMode,
          sourceLanguage: 'auto',
          recapStyle: 'dramatic_action',
          targetDurationMin: 3,
          episodeNumber: episode.episodeNumber,
          seriesTitle: seriesName,
          mediaUrl: proxyUrl,
          mediaFileName: `${seriesName}_EP_${episode.episodeNumber}.mp4`,
        });
      } catch (e) {
        console.warn('Auto-generate from TikTok episode:', e);
      }
    }, 800);
  };

  const handleSaveCurrentRecap = async () => {
    if (!currentRecap) return;
    const exists = savedRecaps.some(
      r => r.movie_title === currentRecap.movie_title && r.created_at === currentRecap.created_at
    );
    if (!exists) {
      const updated = [currentRecap, ...savedRecaps];
      saveRecapsToStorage(updated);
    }

    // Save to SQLite DB
    try {
      await fetch('/api/db/recaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRecap),
      });
    } catch (e) {
      console.warn('Failed to persist recap to SQLite DB:', e);
    }
  };

  const handleUpdateRecap = (updated: MovieRecapResult, oldTitle?: string) => {
    setCurrentRecap(updated);
    setSavedRecaps((prev) => {
      const targetId = (updated as any).id;
      const targetTitle = oldTitle || updated.movie_title;
      const exists = prev.some(r => ((r as any).id && targetId && (r as any).id === targetId) || r.movie_title === targetTitle);
      
      let list: MovieRecapResult[];
      if (exists) {
        list = prev.map(r => {
          if (((r as any).id && targetId && (r as any).id === targetId) || r.movie_title === targetTitle) {
            return updated;
          }
          return r;
        });
      } else {
        list = [updated, ...prev];
      }
      try {
        localStorage.setItem('khmer_recap_saved_scripts', JSON.stringify(list));
      } catch {}
      return list;
    });
  };

  const handleDeleteSavedRecap = async (target: MovieRecapResult | number | string) => {
    let targetRecap: MovieRecapResult | undefined;
    if (typeof target === 'number') {
      targetRecap = savedRecaps[target];
    } else if (typeof target === 'string') {
      targetRecap = savedRecaps.find(r => (r as any).id === target || r.movie_title === target);
    } else {
      targetRecap = target;
    }

    if (!targetRecap) return;

    const targetId = (targetRecap as any).id;
    const targetTitle = targetRecap.movie_title;

    // 1. Immediately remove from React state & LocalStorage
    const updated = savedRecaps.filter(r => {
      if (targetId && (r as any).id) {
        return (r as any).id !== targetId;
      }
      return r.movie_title !== targetTitle;
    });
    saveRecapsToStorage(updated);

    // If current opened recap was deleted, switch to another
    if (currentRecap?.movie_title === targetTitle || ((currentRecap as any)?.id && (currentRecap as any).id === targetId)) {
      if (updated.length > 0) {
        setCurrentRecap(updated[0]);
      } else {
        setCurrentRecap(DEFAULT_INITIAL_RECAP);
      }
    }

    // 2. Permanently delete from SQLite DB (both by ID and by title)
    try {
      if (targetId) {
        await fetch(`/api/db/recaps/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
      }
      if (targetTitle) {
        await fetch(`/api/db/recaps/${encodeURIComponent(targetTitle)}`, { method: 'DELETE' });
      }
    } catch (e) {
      console.warn('Failed to delete recap from SQLite DB:', e);
    }
  };

  const handleClearAllSaved = async () => {
    const toDelete = [...savedRecaps];
    saveRecapsToStorage([]);
    setCurrentRecap(DEFAULT_INITIAL_RECAP);
    try {
      for (const r of toDelete) {
        if ((r as any).id) {
          await fetch(`/api/db/recaps/${(r as any).id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Failed to clear recaps from DB:', e);
    }
  };

  // Folder CRUD & Assignment Handlers
  const handleSaveFolder = async (folder: Partial<RecapFolder>) => {
    try {
      const res = await fetch('/api/db/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folder)
      });
      if (res.ok) {
        const saved: RecapFolder = await res.json();
        setFolders((prev) => {
          const idx = prev.findIndex(f => f.id === saved.id || (f.name && saved.name && f.name.trim().toLowerCase() === saved.name.trim().toLowerCase()));
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = saved;
            return copy;
          }
          return [...prev, saved];
        });
      }
    } catch (e) {
      console.warn('Failed to save folder in SQLite DB:', e);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await fetch(`/api/db/folders/${folderId}`, { method: 'DELETE' });
      setFolders((prev) => prev.filter(f => f.id !== folderId));
      setSavedRecaps((prev) => prev.map(r => r.folderId === folderId ? { ...r, folderId: '', folderName: '' } : r));
    } catch (e) {
      console.warn('Failed to delete folder in SQLite DB:', e);
    }
  };

  const handleAssignRecapFolder = async (recapId: string, folderName: string, folderId: string = '') => {
    try {
      await fetch(`/api/db/recaps/${recapId}/folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName, folderId })
      });
      setSavedRecaps((prev) => prev.map(r => (r as any).id === recapId ? { ...r, folderName, folderId } : r));
      if (currentRecap && (currentRecap as any).id === recapId) {
        setCurrentRecap((prev) => prev ? { ...prev, folderName, folderId } : prev);
      }
    } catch (e) {
      console.warn('Failed to assign recap folder in DB:', e);
    }
  };

  // Save Series Project to SQLite DB
  const handleSaveSeriesProjectToDb = async (project: SeriesProject) => {
    const res = await fetch('/api/db/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save series project to database');
    }
    const saved = await res.json();
    setSeriesProject(saved);
  };

  // Quick Action: Insert current recap as an Episode Clip into CapCut Sequence Editor
  const handleInsertToSequence = () => {
    if (!currentRecap) return;

    const rawDurSeconds = parseTimecode(currentRecap.total_recap_duration_est) || 30;
    const existingClips = (seriesProject.clips || []).filter(
      c => c.id !== 'clip_demo_1' && !c.videoUrl?.includes('flower.mp4')
    );
    const nextEpisodeNum = existingClips.length + 1;

    const newClip: EpisodeClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recapId: (currentRecap as any).id,
      episodeNumber: currentRecap.episodeNumber || nextEpisodeNum,
      title: currentRecap.movie_title || `ភាគ ${nextEpisodeNum}`,
      videoUrl: currentRecap.videoUrl || '',
      videoFileName: currentRecap.videoFileName,
      duration: rawDurSeconds,
      trimStart: 0,
      trimEnd: 0,
      speed: 1.0,
      volume: 1.0,
      bgmTrackUrl: currentRecap.bgmTrackUrl,
      segments: currentRecap.recap_segments || []
    };

    // Auto-save recap to SQLite DB first so it's safely in library
    handleSaveCurrentRecap().catch(() => {});

    // Set clean clips for user's series project
    setSeriesProject((prev) => ({
      ...prev,
      title: existingClips.length === 0 ? (currentRecap.seriesTitle || currentRecap.movie_title) : prev.title,
      clips: [...existingClips, newClip]
    }));

    // Switch to CapCut Sequence Editor Mode
    setActiveMode('sequence');
  };

  // Quick Action: Insert ALL episodes in an entire Folder into Episode Sequence Timeline
  const handleInsertFolderToSequence = async (folderName: string, items: MovieRecapResult[]) => {
    if (!items || items.length === 0) return;

    // 1. Sort episodes by episodeNumber or natural title order
    const sorted = [...items].sort((a, b) => {
      const epA = a.episodeNumber ?? 0;
      const epB = b.episodeNumber ?? 0;
      if (epA !== epB && epA > 0 && epB > 0) return epA - epB;
      return (a.movie_title || '').localeCompare(b.movie_title || '', undefined, { numeric: true });
    });

    // 2. Convert each recap to an EpisodeClip
    const newClips: EpisodeClip[] = sorted.map((recap, idx) => {
      const rawDurSeconds = parseTimecode(recap.total_recap_duration_est) || 30;
      return {
        id: `clip_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        recapId: (recap as any).id,
        episodeNumber: recap.episodeNumber || idx + 1,
        title: recap.movie_title || `${folderName} - ភាគ ${idx + 1}`,
        videoUrl: recap.videoUrl || '',
        videoFileName: recap.videoFileName,
        duration: rawDurSeconds,
        trimStart: 0,
        trimEnd: 0,
        speed: 1.0,
        volume: 1.0,
        bgmTrackUrl: recap.bgmTrackUrl,
        segments: recap.recap_segments || []
      };
    });

    const updatedSeries: SeriesProject = {
      ...seriesProject,
      title: folderName || seriesProject.title,
      clips: newClips,
      updated_at: new Date().toISOString()
    };

    setSeriesProject(updatedSeries);

    // 3. Persist to SQLite DB immediately
    try {
      await fetch('/api/db/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSeries)
      });
    } catch (e) {
      console.warn('Auto-save series project to SQLite failed:', e);
    }

    // 4. Close modals and transition smoothly to Sequence Timeline
    setIsSavedModalOpen(false);
    setActiveMode('sequence');
  };

  const handleSelectRecap = (recap: MovieRecapResult) => {
    setCurrentRecap(recap);
    setActiveMode('dubbing');
  };

  const isCurrentSaved = currentRecap
    ? savedRecaps.some(r => r.movie_title === currentRecap.movie_title && r.created_at === currentRecap.created_at)
    : false;

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-gray-900 font-sans selection:bg-blue-500 selection:text-white flex flex-col">
      
      {/* Error Alert Banner */}
      {error && (
        <div className="bg-red-600 text-white p-3 px-4 flex items-center justify-between text-xs font-semibold shadow-md z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-white shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded text-[11px] font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mode 1: Video Cutter & Auto Episode Splitter Studio */}
      {activeMode === 'cutter' ? (
        <VideoCutterSplitterStudio
          currentRecap={currentRecap}
          onUpdateRecap={handleUpdateRecap}
          onSwitchToDubbing={() => setActiveMode('dubbing')}
          onSwitchToSequence={() => setActiveMode('sequence')}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          savedRecaps={savedRecaps}
          folders={folders}
          onSaveFolder={handleSaveFolder}
          onAssignRecapFolder={handleAssignRecapFolder}
          onRefreshRecaps={fetchSavedRecaps}
          onSelectRecap={handleSelectRecap}
          onOpenSavedModal={() => setIsSavedModalOpen(true)}
          onOpenTikTokModal={() => setIsTikTokModalOpen(true)}
          onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          hasCustomApiKey={Boolean(customApiKey)}
        />
      ) : activeMode === 'sequence' ? (
        /* Mode 2: Episode Sequence Editor (CapCut Style) */
        <EpisodeSequenceEditor
          seriesProject={seriesProject}
          onUpdateSeriesProject={setSeriesProject}
          onSaveSeriesProjectToDb={handleSaveSeriesProjectToDb}
          onSwitchToDubbingStudio={() => setActiveMode('dubbing')}
          onSwitchToCutter={() => setActiveMode('cutter')}
          currentRecap={currentRecap}
          savedRecaps={savedRecaps}
          onSelectRecap={handleSelectRecap}
          onOpenSavedModal={() => setIsSavedModalOpen(true)}
          onOpenTikTokModal={() => setIsTikTokModalOpen(true)}
          onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          hasCustomApiKey={Boolean(customApiKey)}
          saveStatus={saveStatus}
          globalVoicePersona={globalVoicePersona}
          onChangeGlobalVoicePersona={setGlobalVoicePersona}
          ttsSpeed={ttsSpeed}
          onChangeTtsSpeed={setTtsSpeed}
        />
      ) : (
        /* Mode 3: Dubbing Studio (AI Scriptwriter & Vocal Translator) */
        currentRecap ? (
          <RecapStudio
            recapData={currentRecap}
            onUpdateRecap={handleUpdateRecap}
            onSaveRecap={handleSaveCurrentRecap}
            isSaved={isCurrentSaved}
            onOpenSaved={() => setIsSavedModalOpen(true)}
            savedCount={savedRecaps.length}
            savedRecaps={savedRecaps}
            folders={folders}
            onSelectRecap={handleSelectRecap}
            onFileUpload={handleFileUpload}
            isLoading={isLoading}
            isProcessingFile={isProcessingFile}
            translationMode={translationMode}
            onChangeTranslationMode={setTranslationMode}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
            hasCustomApiKey={Boolean(customApiKey)}
            onOpenTikTokModal={() => setIsTikTokModalOpen(true)}
            activeMode={activeMode}
            onSwitchMode={setActiveMode}
            onInsertToSequence={handleInsertToSequence}
            onInsertFolderToSequence={handleInsertFolderToSequence}
            saveStatus={saveStatus}
            globalVoicePersona={globalVoicePersona}
            onChangeGlobalVoicePersona={setGlobalVoicePersona}
            ttsSpeed={ttsSpeed}
            onChangeTtsSpeed={setTtsSpeed}
            onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
            onRegenerateAll={async () => {
              if (!currentRecap) return;

              // 1. If we have the raw uploaded video/audio file, re-extract and send audio directly to Gemini
              if (currentRecap.rawFile) {
                try {
                  setIsProcessingFile(true);
                  setIsLoading(true);
                  const { base64, mimeType } = await processAndExtractAudio(currentRecap.rawFile);
                  setIsProcessingFile(false);
                  await handleGenerateRecap({
                    transcript: '',
                    mediaData: base64,
                    mediaMimeType: mimeType,
                    mediaFileName: currentRecap.videoFileName || currentRecap.rawFile.name,
                    mediaUrl: currentRecap.videoUrl,
                    inputMode: 'video',
                    translationMode: translationMode,
                    sourceLanguage: 'auto',
                    recapStyle: 'dramatic_action',
                    targetDurationMin: 3,
                    episodeNumber: currentRecap.episodeNumber,
                    seriesTitle: currentRecap.seriesTitle,
                  });
                  return;
                } catch (e) {
                  console.warn('Re-extract audio from rawFile failed, falling back:', e);
                  setIsProcessingFile(false);
                }
              }

              // 2. If we have existing recap segments, use them as source text
              const transcriptFromSegments = currentRecap.recap_segments && currentRecap.recap_segments.length > 0
                ? currentRecap.recap_segments.map(s => `(${s.start_time}-${s.end_time}) ${s.speaker_name || ''}: ${s.original_summary || s.khmer_script}`).join('\n')
                : '';

              const fallbackTranscript = transcriptFromSegments || `Create a dramatic Khmer movie recap for: ${currentRecap.movie_title || 'Movie Clip'}`;

              await handleGenerateRecap({
                transcript: fallbackTranscript,
                inputMode: 'text',
                translationMode: translationMode,
                sourceLanguage: 'auto',
                recapStyle: 'dramatic_action',
                targetDurationMin: 3,
                episodeNumber: currentRecap.episodeNumber,
                seriesTitle: currentRecap.seriesTitle,
                mediaUrl: currentRecap.videoUrl,
                mediaFileName: currentRecap.videoFileName
              });
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 bg-[#12141A] text-white">
            <div className="text-center space-y-3">
              <h2 className="text-xl font-bold font-khmer">សូមជ្រើសរើស ឬ Upload វីដេអូរឿង</h2>
              <p className="text-sm text-gray-400 font-mono">Loading Dubber Studio Interface...</p>
            </div>
          </div>
        )
      )}

      {/* Saved Recaps History & Folder Management Modal */}
      <SavedRecapsModal
        isOpen={isSavedModalOpen}
        onClose={() => setIsSavedModalOpen(false)}
        savedRecaps={savedRecaps}
        folders={folders}
        onSaveFolder={handleSaveFolder}
        onDeleteFolder={handleDeleteFolder}
        onAssignRecapFolder={handleAssignRecapFolder}
        onInsertFolderToSequence={handleInsertFolderToSequence}
        onOpenExportForFolder={(folderName, items) => {
          setIsSavedModalOpen(false);
          setExportTargetFolderName(folderName);
          if (items && items.length > 0) {
            setCurrentRecap(items[0]);
          }
          setIsFolderExportModalOpen(true);
        }}
        onSelectRecap={(recap) => setCurrentRecap(recap)}
        onDeleteRecap={handleDeleteSavedRecap}
        onClearAll={handleClearAllSaved}
      />

      {/* 1-Click Folder Batch & Series Render Modal */}
      {isFolderExportModalOpen && (
        <ExportModal
          isOpen={isFolderExportModalOpen}
          onClose={() => setIsFolderExportModalOpen(false)}
          recapData={currentRecap}
          savedRecaps={savedRecaps}
          folders={folders}
          initialFolder={exportTargetFolderName}
          initialScope="folder"
          initialTtsSpeed={ttsSpeed}
        />
      )}

      {/* Direct API Key Settings Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        apiKey={customApiKey}
        voiceApiKey={customVoiceApiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* TikTok Drama Importer Modal */}
      <TikTokImporterModal
        isOpen={isTikTokModalOpen}
        onClose={() => setIsTikTokModalOpen(false)}
        onSelectEpisode={handleTikTokEpisodeInsert}
      />

      {/* Video / Media Upload Modal */}
      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={(file, episodeInfo) => {
          setIsUploadModalOpen(false);
          handleFileUpload(file, episodeInfo);
        }}
      />

      {/* Version Control & Auto-Update In-App Modal */}
      <AutoUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />

    </div>
  );
}
