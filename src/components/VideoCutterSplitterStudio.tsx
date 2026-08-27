import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Scissors, Play, Pause, RotateCcw, Plus, Trash2, 
  Download, Sparkles, Film, ArrowRight, ArrowLeft,
  Clock, Layers, CheckCircle2, AlertTriangle, Loader2,
  FolderDown, FolderOpen, Database, Archive, FileText, ChevronRight, Upload,
  Zap, Copy, ArrowUp, ArrowDown, Eye, Check, GripVertical, Split,
  Mic, Volume2, VolumeX, Lock, Unlock, ZoomIn, ZoomOut, Maximize,
  Sliders, Settings, Undo2, Redo2, MousePointer, Wand2, Music, Type,
  Grid, List, Magnet, Ratio, FastForward, Rewind, EyeOff
} from 'lucide-react';
import { MovieRecapResult, SeriesProject, EpisodeClip, RecapFolder } from '../types';
import { formatTimecode } from '../utils/sequenceUtils';
import { uploadMediaInChunks, getSafeMediaUrl } from '../utils/mediaUtils';
import { ToastContainer, ToastMessage, ToastType } from './ToastNotification';

export interface MediaAsset {
  id: string;
  title: string;
  videoUrl: string;
  videoFileName?: string;
  duration?: number;
  rawFile?: File;
  blobUrl?: string;
  isCompressed?: boolean;
}

export interface VideoCutSlice {
  id: string;
  title: string;
  sourceTitle?: string;
  videoUrl?: string;
  videoFileName?: string;
  startSec: number;
  endSec: number;
}

export interface SplitEpisodeItem {
  id: string;
  episodeNumber: number;
  title: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

interface VideoCutterSplitterStudioProps {
  currentRecap: MovieRecapResult | null;
  onUpdateRecap: (recap: MovieRecapResult) => void;
  onSwitchToDubbing: () => void;
  onSwitchToSequence: () => void;
  onOpenUploadModal: () => void;
  savedRecaps?: MovieRecapResult[];
  folders?: RecapFolder[];
  onSaveFolder?: (folder: Partial<RecapFolder>) => Promise<void>;
  onAssignRecapFolder?: (recapId: string, folderName: string, folderId?: string) => Promise<void>;
  onRefreshRecaps?: () => void;
}

export const VideoCutterSplitterStudio: React.FC<VideoCutterSplitterStudioProps> = ({
  currentRecap,
  onUpdateRecap,
  onSwitchToDubbing,
  onSwitchToSequence,
  onOpenUploadModal,
  savedRecaps = [],
  onSelectRecap,
  onOpenSavedModal,
  onOpenTikTokModal,
  onOpenApiKeyModal,
  hasCustomApiKey = false,
  folders = [],
  onSaveFolder,
  onAssignRecapFolder,
  onRefreshRecaps
}) => {
  // CapCut Tab & Layout State
  const [inspectorTab, setInspectorTab] = useState<'basic' | 'dubbing' | 'splitter' | 'exports'>('splitter');
  const [mediaSidebarTab, setMediaSidebarTab] = useState<'local' | 'library' | 'audio' | 'text' | 'filters'>('local');
  const [mediaViewMode, setMediaViewMode] = useState<'grid' | 'list'>('grid');

  // Folder Target State
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [isCreatingNewFolder, setIsCreatingNewFolder] = useState<boolean>(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState<string>('');

  // Track explicitly deleted asset IDs so they never bounce back
  const deletedAssetIdsRef = useRef<Set<string>>(new Set());

  // Video State
  const [videoUrl, setVideoUrl] = useState<string>(currentRecap?.videoUrl || '');
  const [videoTitle, setVideoTitle] = useState<string>(currentRecap?.movie_title || 'Untitled Video');
  
  // Media Pool (multiple source videos imported)
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => {
    if (currentRecap?.videoUrl && !currentRecap.videoUrl.includes('flower.mp4')) {
      return [{
        id: 'initial_asset',
        title: currentRecap.movie_title || 'Video 1',
        videoUrl: currentRecap.videoUrl,
        blobUrl: currentRecap.videoUrl.startsWith('blob:') ? currentRecap.videoUrl : undefined,
        videoFileName: currentRecap.videoFileName,
        duration: currentRecap.duration || 0,
        rawFile: currentRecap.rawFile
      }];
    }
    return [];
  });
  const [selectedAssetId, setSelectedAssetId] = useState<string>(() => {
    return (currentRecap?.videoUrl && !currentRecap.videoUrl.includes('flower.mp4')) ? 'initial_asset' : '';
  });

  // Video Player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(100);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'original' | '16:9' | '9:16' | '1:1'>('original');

  // In / Out Points
  const [inPoint, setInPoint] = useState<number>(0);
  const [outPoint, setOutPoint] = useState<number>(0);

  // Cut Slices / Timeline Sequence state
  const [cutSlices, setCutSlices] = useState<VideoCutSlice[]>([]);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Timeline UI State
  const [timelineZoom, setTimelineZoom] = useState<number>(1); // 0.5x to 3x
  const [isMagnetEnabled, setIsMagnetEnabled] = useState<boolean>(true);
  const [isVideoTrackLocked, setIsVideoTrackLocked] = useState<boolean>(false);
  const [isVideoTrackMuted, setIsVideoTrackMuted] = useState<boolean>(false);
  const [isAudioTrackMuted, setIsAudioTrackMuted] = useState<boolean>(false);

  // Auto Splitter config
  const [splitDurationMinutes, setSplitDurationMinutes] = useState<number>(3);
  const [customSplitSeconds, setCustomSplitSeconds] = useState<number>(180);
  const [splitEpisodes, setSplitEpisodes] = useState<SplitEpisodeItem[]>([]);

  // Processing & Export State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStatusMessage, setProcessStatusMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [mergedVideoResult, setMergedVideoResult] = useState<{ downloadUrl: string; fileName: string } | null>(null);
  const [batchExportResult, setBatchExportResult] = useState<{
    folderName: string;
    zipUrl: string;
    zipFileName: string;
    totalEpisodes: number;
    files?: any[];
  } | null>(null);

  // Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = (type: ToastType, title: string, message?: string) => {
    setToasts(prev => [...prev, { id: `toast_${Date.now()}_${Math.random()}`, type, title, message }]);
  };

  // Helper to format duration in natural Khmer words
  const formatDurationKhmer = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    if (h > 0) return `${h} ម៉ោង ${m > 0 ? `${m} នាទី ` : ''}${s} វិនាទី`;
    if (m > 0) return `${m} នាទី ${s} វិនាទី`;
    return `${s} វិនាទី`;
  };

  // Format Timecode in CapCut format: HH:MM:SS:FF
  const formatCapCutTimecode = (seconds: number): string => {
    const total = Math.max(0, seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    const f = Math.floor((total % 1) * 30); // 30 fps frame
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
  };

  // Calculate cumulative total duration of all slices on Timeline
  const totalCutDuration = useMemo(() => {
    return cutSlices.reduce((sum, s) => sum + Math.max(0, s.endSec - s.startSec), 0);
  }, [cutSlices]);

  // File input ref for local video picker
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingServer, setIsUploadingServer] = useState<boolean>(false);

  // Direct video file selector from local computer (Automatically puts ALL videos onto Timeline & calculates total duration!)
  const handleDirectVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    showToast('info', `កំពុងគណនា & ផ្ទុក ${files.length} វីដេអូ...`, 'វីដេអូទាំងអស់នឹងត្រូវដាក់ចូល Timeline ស្វ័យប្រវត្តិ');

    const newAssets: MediaAsset[] = [];
    const newSlices: VideoCutSlice[] = [];

    // Extract exact duration for each video file asynchronously
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const localUrl = URL.createObjectURL(file);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
      
      let dur = 0;
      try {
        dur = await new Promise<number>((resolve) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.src = localUrl;
          v.onloadedmetadata = () => resolve(v.duration || 0);
          v.onerror = () => resolve(0);
        });
      } catch {
        dur = 0;
      }

      const roundedDur = Math.round(dur * 10) / 10;

      const assetItem: MediaAsset = {
        id: `asset_${Date.now()}_${i}`,
        title: cleanTitle,
        videoUrl: localUrl,
        blobUrl: localUrl,
        videoFileName: file.name,
        duration: roundedDur,
        rawFile: file
      };
      newAssets.push(assetItem);

      // AUTOMATICALLY add this video as a full slice on the Timeline track!
      newSlices.push({
        id: `slice_${Date.now()}_${i}_${Math.random()}`,
        title: cleanTitle,
        sourceTitle: cleanTitle,
        videoUrl: localUrl,
        videoFileName: file.name,
        startSec: 0,
        endSec: roundedDur
      });
    }

    // Reset file input value so user can upload the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setMediaAssets(prev => [...prev, ...newAssets]);
    setCutSlices(prev => [...prev, ...newSlices]);

    // Switch active video to the first newly added video
    const firstNew = newAssets[0];
    if (firstNew) {
      setSelectedAssetId(firstNew.id);
      setVideoUrl(firstNew.blobUrl || firstNew.videoUrl);
      setVideoTitle(firstNew.title);
      setInPoint(0);
      setOutPoint(firstNew.duration || 30);
    }

    // Calculate sum duration of all newly added videos
    const sumNewDuration = newSlices.reduce((sum, s) => sum + s.endSec, 0);
    showToast(
      'success',
      `⚡ បានដាក់ ${newSlices.length} វីដេអូចូល Timeline ស្វ័យប្រវត្តិ!`,
      `រយៈពេលសរុប៖ ${formatDurationKhmer(sumNewDuration)} (${formatTimecode(sumNewDuration)})`
    );

    // Upload to server storage in background for FFmpeg processing using chunked upload
    setIsUploadingServer(true);
    try {
      for (const file of files) {
        const chunkResult = await uploadMediaInChunks(file, file.name);
        const serverUrl = chunkResult.serverUrl;
        const serverFileName = chunkResult.serverFileName;

        setMediaAssets(prev => prev.map(a => 
          a.videoFileName === file.name || a.title === file.name.replace(/\.[^/.]+$/, '')
            ? { ...a, serverUrl: serverUrl, videoFileName: serverFileName }
            : a
        ));
        setCutSlices(prev => prev.map(s => 
          s.videoFileName === file.name || s.sourceTitle === file.name.replace(/\.[^/.]+$/, '')
            ? { ...s, videoFileName: serverFileName }
            : s
        ));
      }
    } catch (err: any) {
      console.warn('Background chunked multi-upload notice:', err);
    } finally {
      setIsUploadingServer(false);
    }
  };

  // Auto-populate cutSlices if cutSlices is empty and mediaAssets has items
  useEffect(() => {
    if (mediaAssets.length > 0 && cutSlices.length === 0) {
      const autoSlices: VideoCutSlice[] = mediaAssets.map((asset, idx) => ({
        id: `slice_init_${idx}_${Date.now()}`,
        title: asset.title,
        sourceTitle: asset.title,
        videoUrl: asset.videoUrl,
        videoFileName: asset.videoFileName,
        startSec: 0,
        endSec: asset.duration || 0
      }));
      setCutSlices(autoSlices);
    }
  }, [mediaAssets.length]);

  // Sync currentRecap props
  useEffect(() => {
    if (currentRecap?.videoUrl && currentRecap.videoUrl !== videoUrl) {
      setVideoUrl(currentRecap.videoUrl);
      setVideoTitle(currentRecap.movie_title || 'Untitled Video');
    }
  }, [currentRecap]);

  // Video loaded metadata handler
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      setTotalDuration(dur);
      if (outPoint === 0 || outPoint > dur) {
        setOutPoint(Math.min(dur, Math.max(10, inPoint + 30)));
      }
      const roundedDur = Math.round(dur * 10) / 10;
      if (selectedAssetId) {
        setMediaAssets(prev => prev.map(a => a.id === selectedAssetId ? { ...a, duration: roundedDur } : a));
      }
      setCutSlices(prev => prev.map(s => (s.videoUrl === videoUrl && (s.endSec === 0 || !s.endSec)) ? { ...s, endSec: roundedDur } : s));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(totalDuration || 9999, sec));
    }
  };

  // Switch active video asset in trimmer
  const handleSelectAsset = (asset: MediaAsset) => {
    setSelectedAssetId(asset.id);
    const activeUrl = asset.blobUrl || asset.videoUrl;
    setVideoUrl(activeUrl);
    setVideoTitle(asset.title);
    setInPoint(0);
    setOutPoint(asset.duration || totalDuration || 30);
    setSplitEpisodes([]); // Reset split calculation for newly selected video

    if (currentRecap) {
      onUpdateRecap({
        ...currentRecap,
        movie_title: asset.title,
        videoUrl: activeUrl,
        videoFileName: asset.videoFileName
      });
    }

    showToast('info', 'បានប្តូរវីដេអូកាត់ត', asset.title);
  };

  // Delete video asset from media pool
  const handleDeleteAsset = (assetId: string) => {
    deletedAssetIdsRef.current.add(assetId);
    const assetToDelete = mediaAssets.find(a => a.id === assetId);
    if (assetToDelete?.videoUrl) deletedAssetIdsRef.current.add(assetToDelete.videoUrl);
    if (assetToDelete?.blobUrl) deletedAssetIdsRef.current.add(assetToDelete.blobUrl);

    const updated = mediaAssets.filter(a => a.id !== assetId);
    setMediaAssets(updated);

    if (assetToDelete) {
      setCutSlices(prev => prev.filter(s => s.videoUrl !== assetToDelete.videoUrl && s.videoFileName !== assetToDelete.videoFileName));
    }

    if (selectedAssetId === assetId || videoUrl === assetToDelete?.videoUrl) {
      if (updated.length > 0) {
        handleSelectAsset(updated[0]);
      } else {
        setSelectedAssetId('');
        setVideoUrl('');
        setVideoTitle('គ្មានវីដេអូ');
        setTotalDuration(0);
        setCutSlices([]);
        setSplitEpisodes([]);
        if (currentRecap) {
          onUpdateRecap({
            ...currentRecap,
            videoUrl: undefined,
            videoFileName: undefined
          });
        }
      }
    }

    showToast('info', 'បានលុបវីដេអូចេញពី Media Pool', assetToDelete?.title || '');
  };

  // Add all existing media assets to Timeline at once
  const handleAddAllAssetsToTimeline = () => {
    if (mediaAssets.length === 0) {
      showToast('warning', 'មិនទាន់មាន Video', 'សូម Upload វីដេអូជាមុនសិន!');
      return;
    }
    const allSlices: VideoCutSlice[] = mediaAssets.map((asset, idx) => ({
      id: `slice_all_${Date.now()}_${idx}`,
      title: asset.title,
      sourceTitle: asset.title,
      videoUrl: asset.videoUrl,
      videoFileName: asset.videoFileName,
      startSec: 0,
      endSec: asset.duration || 0
    }));
    setCutSlices(allSlices);
    const sumDur = allSlices.reduce((sum, s) => sum + s.endSec, 0);
    showToast('success', `⚡ បានដាក់គ្រប់ ${allSlices.length} វីដេអូចូល Timeline!`, `រយៈពេលសរុប៖ ${formatDurationKhmer(sumDur)}`);
  };

  // Add single video clip directly to slice queue
  const handleAddEntireAsset = (asset: MediaAsset) => {
    const newSlice: VideoCutSlice = {
      id: `slice_${Date.now()}_${Math.random()}`,
      title: asset.title,
      sourceTitle: asset.title,
      videoUrl: asset.videoUrl,
      videoFileName: asset.videoFileName,
      startSec: 0,
      endSec: asset.duration || 0
    };
    setCutSlices(prev => [...prev, newSlice]);
    showToast('success', 'បានដាក់ចូល Timeline', `[${asset.title}] ទាំងមូល`);
  };

  // Drag-and-Drop Reordering state & handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedClipIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedClipIndex === null || draggedClipIndex === targetIndex) {
      setDraggedClipIndex(null);
      setDragOverIndex(null);
      return;
    }
    const clone = [...cutSlices];
    const [draggedItem] = clone.splice(draggedClipIndex, 1);
    clone.splice(targetIndex, 0, draggedItem);
    setCutSlices(clone);
    setDraggedClipIndex(null);
    setDragOverIndex(null);
    showToast('info', 'បានតម្រៀបលំដាប់ឈុត', `រំកិល "${draggedItem.title}" ទៅទីតាំងទី ${targetIndex + 1}`);
  };

  const handleDuplicateSlice = (slice: VideoCutSlice) => {
    const dup: VideoCutSlice = {
      ...slice,
      id: `slice_${Date.now()}_${Math.random()}`,
      title: `${slice.title} (ចម្លង)`
    };
    setCutSlices(prev => [...prev, dup]);
    showToast('success', 'បានចម្លងឈុត', dup.title);
  };

  // Razor / Split tool at Playhead
  const handleRazorSplitAtPlayhead = () => {
    if (currentTime <= inPoint || currentTime >= outPoint) {
      showToast('warning', 'មិនអាចកាត់បាន', 'Playhead ត្រូវតែនៅចន្លោះ In-Point និង Out-Point!');
      return;
    }
    const s1: VideoCutSlice = {
      id: `slice_${Date.now()}_1`,
      title: `${videoTitle} Part 1`,
      sourceTitle: videoTitle,
      videoUrl: videoUrl,
      videoFileName: currentRecap?.videoFileName,
      startSec: Math.round(inPoint * 10) / 10,
      endSec: Math.round(currentTime * 10) / 10
    };
    const s2: VideoCutSlice = {
      id: `slice_${Date.now()}_2`,
      title: `${videoTitle} Part 2`,
      sourceTitle: videoTitle,
      videoUrl: videoUrl,
      videoFileName: currentRecap?.videoFileName,
      startSec: Math.round(currentTime * 10) / 10,
      endSec: Math.round(outPoint * 10) / 10
    };
    setCutSlices(prev => [...prev, s1, s2]);
    showToast('success', '✂️ Razor Split ជោគជ័យ!', `ចែកជា ២ ឈុត [00:00 - ${formatTimecode(currentTime)}] + [${formatTimecode(currentTime)} - ${formatTimecode(outPoint)}]`);
    setInPoint(currentTime);
  };

  const handleRemoveSlice = (id: string) => {
    setCutSlices(prev => prev.filter(s => s.id !== id));
    if (selectedSliceId === id) setSelectedSliceId(null);
    showToast('info', 'បានលុបឈុត', 'ឈុតត្រូវបានលុបចេញពី Timeline');
  };

  // Ensure video is saved to server storage (/api/media/...) before calling backend FFmpeg
  const ensureVideoUploadedToServer = async (targetVideoUrl: string, targetFileName: string, explicitAsset?: MediaAsset): Promise<{ serverUrl: string; serverFileName: string }> => {
    if (targetVideoUrl.startsWith('/api/media/') || targetVideoUrl.startsWith('/api/exports/')) {
      return { serverUrl: targetVideoUrl, serverFileName: targetFileName };
    }

    const activeAsset = explicitAsset || 
      mediaAssets.find(a => a.id === selectedAssetId) ||
      mediaAssets.find(a => a.videoUrl === targetVideoUrl || a.blobUrl === targetVideoUrl) ||
      mediaAssets[0];

    if (activeAsset?.serverUrl && (activeAsset.serverUrl.startsWith('/api/media/') || activeAsset.serverUrl.startsWith('/api/exports/'))) {
      return { serverUrl: activeAsset.serverUrl, serverFileName: activeAsset.videoFileName || targetFileName };
    }

    setProcessStatusMessage('កំពុងផ្ញើវីដេអូទៅកាន់ Server សម្រាប់ការកាត់ត...');
    // IMPORTANT: strictly use active asset's file, NEVER mix with previous recap's file!
    let blob: Blob | null = activeAsset?.rawFile || null;

    // 1. Fallback to blob URL fetch if rawFile is not in memory
    if (!blob && (targetVideoUrl.startsWith('blob:') || activeAsset?.blobUrl || activeAsset?.videoUrl)) {
      const urlToFetch = targetVideoUrl.startsWith('blob:') ? targetVideoUrl : (activeAsset?.blobUrl || activeAsset?.videoUrl);
      if (urlToFetch) {
        try {
          const res = await fetch(urlToFetch);
          if (res.ok) blob = await res.blob();
        } catch (e) {
          console.warn('Could not fetch blob for server upload:', e);
        }
      }
    }

    if (!blob) {
      return { serverUrl: targetVideoUrl, serverFileName: targetFileName };
    }

    try {
      const safeName = activeAsset?.videoFileName || targetFileName || 'video.mp4';
      const chunkResult = await uploadMediaInChunks(
        blob,
        safeName,
        (pct, loadedMB, totalMB, speedMBps) => {
          setProgressPercent(pct);
          setProcessStatusMessage(`កំពុងផ្ញើវីដេអូទៅ Server: ${pct}% (${loadedMB}MB / ${totalMB}MB) ⚡ ${speedMBps} MB/s`);
        }
      );

      let serverUrl = chunkResult.serverUrl;
      let serverFileName = chunkResult.serverFileName;

      // Auto-compress large videos on server
      if (blob.size > 40 * 1024 * 1024) {
        try {
          setProcessStatusMessage('កំពុង Compress សម្រួលទំហំ File ឱ្យស្រាល HD ស្វ័យប្រវត្តិ...');
          const compRes = await fetch('/api/video/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrl: serverUrl, videoFileName: serverFileName, mode: 'smart_hd' })
          });
          if (compRes.ok) {
            const compData = await compRes.json();
            serverUrl = compData.url;
            serverFileName = compData.fileName;
          }
        } catch (compErr) {
          console.warn('Auto compress in ensureVideoUploadedToServer notice:', compErr);
        }
      }

      setVideoUrl(serverUrl);
      setMediaAssets(prev => prev.map(a => 
        (activeAsset && a.id === activeAsset.id) || a.videoUrl === targetVideoUrl || a.videoFileName === targetFileName
          ? { ...a, videoUrl: serverUrl, serverUrl: serverUrl, videoFileName: serverFileName, isCompressed: true }
          : a
      ));
      setCutSlices(prev => prev.map(s => 
        (activeAsset && (s.sourceTitle === activeAsset.title || s.videoUrl === activeAsset.videoUrl)) || s.videoUrl === targetVideoUrl || s.videoFileName === targetFileName
          ? { ...s, videoUrl: serverUrl, videoFileName: serverFileName }
          : s
      ));

      if (currentRecap) {
        onUpdateRecap({
          ...currentRecap,
          videoUrl: serverUrl,
          videoFileName: serverFileName
        });
      }

      return { serverUrl, serverFileName };
    } catch (e: any) {
      console.warn('Chunk upload failed in ensureVideoUploadedToServer:', e);
      return { serverUrl: targetVideoUrl, serverFileName: targetFileName };
    }
  };

  // Merge & Dub handler
  const handleMergeAndDub = async () => {
    if (cutSlices.length === 0) {
      showToast('warning', 'មិនទាន់មានឈុតដែលត្រូវកាត់', 'សូមដាក់ Video ចូល Timeline ជាមុនសិន!');
      return;
    }

    setIsProcessing(true);
    setProcessStatusMessage('កំពុងរៀបចំ និងផ្ញើវីដេអូទៅកាន់ Server...');
    setProgressPercent(15);

    try {
      const activeAsset = mediaAssets.find(a => a.id === selectedAssetId) || mediaAssets[0];
      const resolvedUrl = activeAsset?.videoUrl || videoUrl || currentRecap?.videoUrl || '';
      const resolvedName = activeAsset?.videoFileName || currentRecap?.videoFileName || activeAsset?.title || 'video.mp4';

      const { serverUrl, serverFileName } = await ensureVideoUploadedToServer(resolvedUrl, resolvedName, activeAsset);

      setProcessStatusMessage('កំពុងកាត់ និងបញ្ចូលឈុតវីដេអូជាមួយ FFmpeg Engine...');
      setProgressPercent(40);

      const res = await fetch('/api/video/cut-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: serverUrl,
          videoFileName: serverFileName,
          slices: cutSlices,
          title: `${videoTitle}_Cut_Merged`
        })
      });

      setProgressPercent(85);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to cut and merge video');
      }

      const data = await res.json();
      setProgressPercent(100);
      setMergedVideoResult(data);
      showToast('success', '🎉 កាត់ និងបញ្ចូលវីដេអូជោគជ័យ!', 'កំពុងបញ្ជូនទៅកាន់បន្ទប់បកប្រែ AI Dubbing...');

      if (currentRecap) {
        onUpdateRecap({
          ...currentRecap,
          videoUrl: data.downloadUrl || data.url || currentRecap.videoUrl,
          videoFileName: data.fileName || currentRecap.videoFileName
        });
      }

      setTimeout(() => {
        setIsProcessing(false);
        onSwitchToDubbing();
      }, 1000);
    } catch (err: any) {
      console.error('Merge error:', err);
      showToast('error', 'បរាជ័យក្នុងការបញ្ចូលវីដេអូ', err.message || 'Error occurred');
      setIsProcessing(false);
    }
  };

  // Auto Splitter generator
  const handleGenerateSplitEpisodes = () => {
    const activeDur = (videoRef.current?.duration && videoRef.current.duration > 0) ? videoRef.current.duration : (totalDuration || 0);
    if (activeDur <= 0) {
      showToast('warning', 'មិនទាន់មានវីដេអូ', 'សូម Upload ឬជ្រើសរើសវីដេអូជាមុនសិន!');
      return;
    }
    const chunkSec = splitDurationMinutes > 0 ? splitDurationMinutes * 60 : customSplitSeconds;
    if (chunkSec <= 0) return;

    const episodes: SplitEpisodeItem[] = [];
    let cur = 0;
    let epNum = 1;

    while (cur < activeDur) {
      const end = Math.min(activeDur, cur + chunkSec);
      episodes.push({
        id: `ep_${epNum}_${Date.now()}`,
        episodeNumber: epNum,
        title: `ភាគទី ${epNum}`,
        startSec: Math.round(cur * 10) / 10,
        endSec: Math.round(end * 10) / 10,
        durationSec: Math.round((end - cur) * 10) / 10
      });
      cur = end;
      epNum++;
    }

    setSplitEpisodes(episodes);
    showToast('success', 'គណនាភាគជោគជ័យ!', `បានបែងចែកជា ${episodes.length} ភាគ (ក្នុងមួយភាគ ${splitDurationMinutes} នាទី)`);
  };

  // 1-Click Smart Video Compression (70-85% file size reduction while preserving crisp 1080p HD quality)
  const handleCompressVideo = async (mode: 'smart_hd' | 'extreme' | 'max_clarity' = 'smart_hd') => {
    const activeAsset = mediaAssets.find(a => a.videoUrl === videoUrl || a.id === selectedAssetId) || 
      mediaAssets.find(a => a.id === selectedAssetId) || 
      mediaAssets[0];
    const resolvedVideoUrl = videoUrl || activeAsset?.videoUrl || currentRecap?.videoUrl || '';
    const resolvedVideoFileName = activeAsset?.videoFileName || currentRecap?.videoFileName || videoTitle || 'video.mp4';

    setIsProcessing(true);
    setProcessStatusMessage('កំពុងផ្ញើវីដេអូទៅកាន់ Server...');
    setProgressPercent(15);

    try {
      const { serverUrl, serverFileName } = await ensureVideoUploadedToServer(resolvedVideoUrl, resolvedVideoFileName);

      setProcessStatusMessage('កំពុង Compress សម្រួលទំហំ File (កាត់បន្ថយ 75% រក្សាភាពច្បាស់ HD)...');
      setProgressPercent(45);

      const res = await fetch('/api/video/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: serverUrl,
          videoFileName: serverFileName,
          mode
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to compress video');
      }

      const data = await res.json();
      setProgressPercent(100);

      const newUrl = data.url;
      const newName = data.fileName;

      setVideoUrl(newUrl);
      setMediaAssets(prev => prev.map(a => 
        a.videoUrl === resolvedVideoUrl || a.id === selectedAssetId
          ? { ...a, videoUrl: newUrl, videoFileName: newName }
          : a
      ));
      setCutSlices(prev => prev.map(s => 
        s.videoUrl === resolvedVideoUrl
          ? { ...s, videoUrl: newUrl, videoFileName: newName }
          : s
      ));

      if (currentRecap) {
        onUpdateRecap({
          ...currentRecap,
          videoUrl: newUrl,
          videoFileName: newName
        });
      }

      showToast('success', '⚡ Compress ជោគជ័យ!', `បានកាត់បន្ថយទំហំ ${data.savedPercent || '75%'} រួចរាល់!`);
    } catch (err: any) {
      console.error('Compress error:', err);
      showToast('error', 'បរាជ័យក្នុងការ Compress', err.message || 'Error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  // Batch Series Render into dedicated folder
  const handleBatchSeriesRender = async () => {
    if (splitEpisodes.length === 0) {
      showToast('warning', 'មិនទាន់មានភាគ', 'សូមចុច "គណនាចែកភាគ" ជាមុនសិន!');
      return;
    }

    const activeAsset = mediaAssets.find(a => a.id === selectedAssetId) || 
      mediaAssets.find(a => a.videoUrl === videoUrl || a.blobUrl === videoUrl) || 
      mediaAssets[0];
    const resolvedVideoUrl = activeAsset?.blobUrl || activeAsset?.videoUrl || videoUrl || '';
    const resolvedVideoFileName = activeAsset?.videoFileName || videoTitle || 'video.mp4';
    const resolvedSeriesTitle = selectedFolderName || activeAsset?.title || videoTitle || 'Series_Project';

    setIsProcessing(true);
    setProcessStatusMessage('កំពុងផ្ទៀងផ្ទាត់ និងផ្ញើវីដេអូទៅកាន់ Server...');
    setProgressPercent(15);

    try {
      const { serverUrl, serverFileName } = await ensureVideoUploadedToServer(resolvedVideoUrl, resolvedVideoFileName, activeAsset);

      setProcessStatusMessage('កំពុង Render គ្រប់ភាគទាំងអស់ចូលទៅក្នុង Series Folder...');
      setProgressPercent(35);

      const res = await fetch('/api/video/batch-series-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: serverUrl,
          videoFileName: serverFileName,
          seriesTitle: resolvedSeriesTitle,
          targetFolderId: selectedFolderId || '',
          targetFolderName: selectedFolderName || '',
          episodes: splitEpisodes,
          includeSrt: true
        })
      });

      setProgressPercent(85);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to render series');
      }

      const data = await res.json();
      setProgressPercent(100);
      setBatchExportResult(data);
      setInspectorTab('exports');

      // Automatically register each rendered episode as a recap item in SQLite DB assigned to the target folder
      if (data.files && Array.isArray(data.files)) {
        for (const fileItem of data.files) {
          const epNum = fileItem.episodeNumber || 1;
          const targetFldName = selectedFolderName || resolvedSeriesTitle;
          const epRecap = {
            id: `recap_series_${Date.now()}_ep_${epNum}_${Math.random().toString(36).substring(2, 6)}`,
            movie_title: `${resolvedSeriesTitle} - ${fileItem.title || `ភាគទី ${epNum}`}`,
            seriesTitle: resolvedSeriesTitle,
            folderId: selectedFolderId || '',
            folderName: targetFldName,
            folder_id: selectedFolderId || '',
            folder_name: targetFldName,
            episodeNumber: epNum,
            videoUrl: `/api/exports/${data.folderName}/${fileItem.videoFileName}`,
            videoFileName: fileItem.videoFileName,
            total_recap_duration_est: formatTimecode(fileItem.durationSec || 0),
            duration: fileItem.durationSec || 0,
            recap_segments: [],
            created_at: new Date().toISOString()
          };
          try {
            await fetch('/api/db/recaps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(epRecap)
            });
          } catch (dbErr) {
            console.warn('Could not register series episode in DB:', dbErr);
          }
        }
        if (onRefreshRecaps) {
          onRefreshRecaps();
        }
      }

      const folderMsg = selectedFolderName ? ` និងដាក់ចូល Folder "${selectedFolderName}"` : '';
      showToast('success', '🎉 Render គ្រប់ភាគជោគជ័យ!', `បានរក្សាទុក ${data.totalEpisodes || splitEpisodes.length} ភាគ${folderMsg}`);
    } catch (err: any) {
      console.error('Batch Render Error:', err);
      showToast('error', 'បរាជ័យក្នុងការ Render ភាគ', err.message || 'Error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[#111215] text-[#E0E2EB] flex flex-col font-sans select-none overflow-hidden text-[12px]">
      
      {/* 1. Top CapCut Dark Navigation Bar */}
      <header className="h-11 bg-[#18191D] border-b border-[#24252B] px-3 flex items-center justify-between z-30 shrink-0">
        
        {/* Left: Back to Dubbing Studio, Project Name & Auto-Save */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onSwitchToDubbing}
            className="px-2.5 py-1 rounded-lg bg-[#24262E] hover:bg-[#2F323D] text-slate-300 hover:text-white font-khmer font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-[#343742]"
            title="ត្រឡប់ទៅកាន់បន្ទប់បកប្រែ Dubbing Studio"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dubbing Studio</span>
          </button>

          <div className="h-4 w-px bg-slate-700 mx-0.5" />

          {/* Project Title Badge */}
          <div className="flex items-center gap-1.5 bg-[#1F2026] px-2.5 py-1 rounded-lg border border-[#2D2E37]">
            <Scissors className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-xs text-white">CapCut Video Studio Pro</span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/80 px-1.5 rounded">Auto-Saved</span>
          </div>
        </div>

        {/* Center: Video Count & Total Duration Summary */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#1F2026] border border-[#2D2E37] text-xs font-mono font-bold">
            <span className="text-cyan-300 flex items-center gap-1">
              <Film className="w-3.5 h-3.5" />
              <span>{mediaAssets.length} Videos</span>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-400">
              {formatTimecode(totalCutDuration > 0 ? totalCutDuration : totalDuration)} ({formatDurationKhmer(totalCutDuration > 0 ? totalCutDuration : totalDuration)})
            </span>
          </div>
        </div>

        {/* Right: Direct Actions & Modes */}
        <div className="flex items-center gap-2">
          {/* Quick Import Local Video */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            multiple
            className="hidden"
            onChange={handleDirectVideoSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingServer}
            className="px-3 py-1 rounded-lg bg-[#24262E] hover:bg-[#2F323D] border border-[#373A45] hover:border-cyan-500 text-cyan-300 font-bold text-xs font-khmer flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
            title="Import វីដេអូច្រើនក្នុងពេលតែមួយពីកុំព្យូទ័រ"
          >
            {isUploadingServer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>+ Import Video</span>
          </button>

          {/* Direct Switch to Dubbing */}
          <button
            onClick={onSwitchToDubbing}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs font-khmer flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-cyan-600/20 active:scale-95"
            title="ទៅកាន់បន្ទប់បកប្រែ Khmer Dubbing"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI Dubbing</span>
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT: Media Pool / Resource Browser */}
        <aside className="w-72 bg-[#141518] border-r border-[#24252B] flex flex-col shrink-0">
          
          {/* Media Tabs Header */}
          <div className="flex items-center border-b border-[#24252B] bg-[#18191D] text-[11px] font-khmer font-bold">
            {[
              { id: 'local', label: 'Local', icon: FolderOpen },
              { id: 'library', label: 'Library', icon: Database },
              { id: 'audio', label: 'Audio', icon: Music },
              { id: 'text', label: 'Text', icon: Type },
              { id: 'filters', label: 'Filters', icon: Wand2 }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setMediaSidebarTab(tab.id as any)}
                className={`flex-1 py-2 flex flex-col items-center gap-0.5 cursor-pointer transition ${
                  mediaSidebarTab === tab.id
                    ? 'text-cyan-400 font-bold border-b-2 border-cyan-400 bg-[#1C1E24]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Media Asset Pool Grid */}
          <div className="flex-1 p-2 overflow-y-auto custom-scrollbar space-y-2">
            {mediaAssets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {mediaAssets.map((asset, aIdx) => {
                  const isSelected = selectedAssetId === asset.id || videoUrl === asset.videoUrl;

                  return (
                    <div
                      key={asset.id}
                      onClick={() => handleSelectAsset(asset)}
                      className={`group relative rounded-xl overflow-hidden border transition-all cursor-pointer bg-[#1A1B20] hover:bg-[#202228] ${
                        isSelected ? 'border-cyan-500 ring-1 ring-cyan-500/40 shadow-sm' : 'border-[#292B33] hover:border-[#3E424E]'
                      } p-1.5 flex flex-col`}
                    >
                      {/* Thumbnail Card */}
                      <div className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center w-full h-20">
                        <video
                          src={getSafeMediaUrl(asset.blobUrl || asset.videoUrl)}
                          className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition"
                          preload="metadata"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                        
                        {/* Active Badge */}
                        {isSelected && (
                          <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-cyan-600 text-[8.5px] font-bold text-white shadow-xs z-10 font-khmer">
                            កំពុងកាត់ត
                          </span>
                        )}

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAsset(asset.id);
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/80 hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 cursor-pointer shadow-sm"
                          title="លុបវីដេអូចេញពី Media Pool"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>

                        {/* Duration Pill in Bottom-Right */}
                        {asset.duration ? (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 text-[9px] font-mono text-cyan-300 font-bold border border-white/10">
                            {formatTimecode(asset.duration)}
                          </span>
                        ) : null}

                        {/* Hover Overlay Button to Add to Timeline */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddEntireAsset(asset);
                          }}
                          className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-cyan-600/90 hover:bg-cyan-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg transform active:scale-95"
                          title="ដាក់ចូល Timeline"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Title */}
                      <div className="mt-1 flex items-center justify-between text-[11px] font-khmer min-w-0">
                        <span className={`truncate font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                          {asset.title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center text-slate-500 space-y-2 border border-dashed border-[#2A2B30] rounded-2xl">
                <Upload className="w-7 h-7 text-slate-600 mx-auto" />
                <p className="font-khmer text-xs">ទទេស្អាត</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 rounded-lg bg-cyan-950/80 border border-cyan-700 text-cyan-300 text-[10.5px] font-khmer font-bold cursor-pointer"
                >
                  + Upload Video
                </button>
              </div>
            )}
          </div>

          {/* Quick Auto Add All Button */}
          {mediaAssets.length > 1 && (
            <div className="p-2 border-t border-[#24252B] bg-[#141518]">
              <button
                onClick={handleAddAllAssetsToTimeline}
                className="w-full py-1.5 px-3 rounded-lg bg-[#202228] hover:bg-cyan-950/80 border border-[#2E313B] hover:border-cyan-500 text-cyan-300 text-xs font-khmer font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ ដាក់គ្រប់ Video ({mediaAssets.length}) ចូល Timeline</span>
              </button>
            </div>
          )}
        </aside>

        {/* ========================================================================= */}
        {/* PANEL 2 (CENTER): CapCut Preview Video Monitor */}
        {/* ========================================================================= */}
        <div className="flex-1 bg-[#0D0E11] flex flex-col border-r border-[#24252B] min-w-0">
          
          {/* Monitor Screen Area */}
          <div className="flex-1 relative flex items-center justify-center p-3 overflow-hidden">
            <div className={`relative bg-black rounded-lg overflow-hidden shadow-2xl flex items-center justify-center border border-[#222328] ${
              aspectRatio === '9:16' ? 'w-[260px] h-full max-h-[380px]' : 'w-full h-full max-w-[640px] max-h-[380px]'
            }`}>
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={getSafeMediaUrl(videoUrl)}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-full object-contain"
                  playsInline
                />
              ) : (
                <div className="text-center text-slate-600 space-y-2">
                  <Film className="w-10 h-10 mx-auto opacity-40 text-cyan-400" />
                  <p className="font-khmer text-xs">សូមជ្រើសរើស Video ដើម្បីចាក់មើល</p>
                </div>
              )}

              {/* Title overlay */}
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] text-slate-300 font-khmer border border-white/10 max-w-[200px] truncate">
                {videoTitle}
              </div>
            </div>
          </div>

          {/* Player Bottom Bar (Timecode, VU Meter, Controls, Ratio) */}
          <div className="h-10 bg-[#16171B] border-t border-[#24252B] px-3 flex items-center justify-between text-xs font-mono shrink-0">
            
            {/* Timecode & Audio Level VU meter */}
            <div className="flex items-center gap-3">
              <div className="text-cyan-400 font-bold font-mono text-[11px] flex items-center gap-1.5">
                <span>{formatCapCutTimecode(currentTime)}</span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-400">{formatCapCutTimecode(totalDuration)}</span>
              </div>

              {/* Animated VU Meter Bars */}
              <div className="hidden sm:flex items-center gap-0.5 h-3">
                <div className="w-1 h-3 bg-emerald-500 rounded-xs animate-pulse" />
                <div className="w-1 h-2 bg-emerald-500 rounded-xs" />
                <div className="w-1 h-2.5 bg-yellow-500 rounded-xs" />
                <div className="w-1 h-1.5 bg-rose-500 rounded-xs" />
              </div>
            </div>

            {/* Central Transport Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => seekTo(currentTime - 5)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#25272F] transition cursor-pointer"
                title="-5 វិនាទី"
              >
                <Rewind className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={togglePlay}
                className="w-7 h-7 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition cursor-pointer shadow-md"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
              </button>

              <button
                onClick={() => seekTo(currentTime + 5)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#25272F] transition cursor-pointer"
                title="+5 វិនាទី"
              >
                <FastForward className="w-3.5 h-3.5" />
              </button>

              {/* Set In/Out point buttons */}
              <div className="h-3 w-[1px] bg-[#2A2B30] mx-1" />

              <button
                onClick={() => {
                  setInPoint(currentTime);
                  showToast('info', 'Set In-Point', formatTimecode(currentTime));
                }}
                className="px-1.5 py-0.5 rounded bg-[#24262E] hover:bg-rose-950 text-rose-300 text-[10px] font-bold border border-[#3A3D47] hover:border-rose-600 transition cursor-pointer"
                title="កំណត់ In-Point ["
              >
                [ In
              </button>

              <button
                onClick={() => {
                  setOutPoint(currentTime);
                  showToast('info', 'Set Out-Point', formatTimecode(currentTime));
                }}
                className="px-1.5 py-0.5 rounded bg-[#24262E] hover:bg-amber-950 text-amber-300 text-[10px] font-bold border border-[#3A3D47] hover:border-amber-600 transition cursor-pointer"
                title="កំណត់ Out-Point ]"
              >
                Out ]
              </button>
            </div>

            {/* Right: Aspect Ratio & Fullscreen */}
            <div className="flex items-center gap-1.5">
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as any)}
                className="bg-[#202228] border border-[#2E313B] text-slate-300 text-[10px] px-1.5 py-0.5 rounded focus:outline-none cursor-pointer"
              >
                <option value="original">Original</option>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Shorts/TikTok)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    if (document.fullscreenElement) document.exitFullscreen();
                    else videoRef.current.requestFullscreen();
                  }
                }}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#25272F] transition cursor-pointer"
                title="Fullscreen"
              >
                <Maximize className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PANEL 3 (RIGHT): CapCut Inspector & AI Actions */}
        {/* ========================================================================= */}
        <div className="w-72 lg:w-80 bg-[#16171B] flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
          
          {/* Inspector Tabs */}
          <div className="flex border-b border-[#24252B] bg-[#131417] text-xs font-khmer">
            {[
              { id: 'dubbing', label: '🚀 AI Dubbing' },
              { id: 'basic', label: 'Basic' },
              { id: 'splitter', label: '⏱️ ចែកភាគ' },
              { id: 'exports', label: '📁 Folder' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setInspectorTab(tab.id as any)}
                className={`flex-1 py-2 text-center text-[11px] transition cursor-pointer ${
                  inspectorTab === tab.id
                    ? 'text-cyan-400 font-bold border-b-2 border-cyan-400 bg-[#1C1E24]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: AI Dubbing Hub */}
          {inspectorTab === 'dubbing' && (
            <div className="p-3 space-y-3 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="p-3 bg-[#1C1E24] border border-[#2D3039] rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-khmer">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>AI Dubbing Hub</span>
                    </span>
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-800">
                      {cutSlices.length} ឈុតលើ Timeline
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-khmer text-slate-400 border-t border-[#292B33] pt-2">
                    <div className="flex justify-between">
                      <span>វីដេអូដើមសរុប៖</span>
                      <span className="text-slate-200 font-bold font-mono">{mediaAssets.length} Videos</span>
                    </div>
                    <div className="flex justify-between">
                      <span>រយៈពេលសរុប៖</span>
                      <span className="text-amber-300 font-bold font-mono">{formatTimecode(totalCutDuration)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>គិតជានាទី៖</span>
                      <span className="text-emerald-400">{formatDurationKhmer(totalCutDuration)}</span>
                    </div>
                  </div>
                </div>

                {/* Slices Mini-List with Instant Delete */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-khmer text-slate-400">
                    <span>បញ្ជីឈុត ({cutSlices.length})</span>
                    {cutSlices.length > 0 && (
                      <button
                        onClick={() => setCutSlices([])}
                        className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                      >
                        សម្អាត
                      </button>
                    )}
                  </div>

                  <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                    {cutSlices.map((slice, idx) => (
                      <div
                        key={slice.id}
                        onClick={() => {
                          setSelectedSliceId(slice.id);
                          if (slice.videoUrl && slice.videoUrl !== videoUrl) setVideoUrl(slice.videoUrl);
                          seekTo(slice.startSec);
                        }}
                        className={`p-1.5 rounded-lg border flex items-center justify-between gap-1 text-[11px] cursor-pointer transition ${
                          selectedSliceId === slice.id ? 'bg-[#222530] border-cyan-500 text-white' : 'bg-[#18191E] border-[#25272E] text-slate-300 hover:border-[#383B46]'
                        }`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="w-4 h-4 rounded bg-black/40 text-slate-400 text-[9px] font-mono flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-khmer truncate">{slice.title}</span>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-amber-400">
                          <span>{formatTimecode(slice.endSec - slice.startSec)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSlice(slice.id);
                            }}
                            className="p-0.5 text-slate-500 hover:text-rose-400 transition"
                            title="លុប"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Big CTA */}
              <button
                type="button"
                disabled={isProcessing || cutSlices.length === 0}
                onClick={handleMergeAndDub}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-khmer font-bold text-xs shadow-lg shadow-cyan-600/30 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>🚀 បញ្ចូលគ្នា & បញ្ជូនទៅបកប្រែ (AI Dubbing)</span>
              </button>
            </div>
          )}

          {/* Tab 2: Basic Video & Audio Adjustments */}
          {inspectorTab === 'basic' && (
            <div className="p-3 space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 font-khmer">Playback Speed</label>
                <div className="grid grid-cols-4 gap-1">
                  {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        setPlaybackRate(rate);
                        if (videoRef.current) videoRef.current.playbackRate = rate;
                      }}
                      className={`py-1 rounded text-xs font-mono font-bold border transition ${
                        playbackRate === rate ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-[#1C1E24] border-[#2A2B30] text-slate-400 hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#24252B]">
                <div className="flex justify-between text-xs font-khmer text-slate-300">
                  <span>Volume</span>
                  <span className="font-mono text-cyan-400">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    if (videoRef.current) videoRef.current.volume = Math.min(1, val / 100);
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Tab 3: Auto Episode Splitter */}
          {inspectorTab === 'splitter' && (
            <div className="p-3 space-y-3 flex-1 flex flex-col justify-between overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {/* 1. Project Folder Selection */}
                <div className="space-y-1.5 p-2.5 bg-[#17181D] border border-[#2B2D37] rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-amber-400 font-khmer flex items-center gap-1.5">
                      📁 ជ្រើសរើស Folder ក្នុង Project
                    </label>
                    {!isCreatingNewFolder && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewFolder(true)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-khmer flex items-center gap-0.5 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> បង្កើតថ្មី
                      </button>
                    )}
                  </div>

                  {isCreatingNewFolder ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="ឈ្មោះ Folder ថ្មី..."
                        value={newFolderNameInput}
                        onChange={(e) => setNewFolderNameInput(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const name = newFolderNameInput.trim();
                            if (!name) return;
                            if (onSaveFolder) {
                              await onSaveFolder({ name, color: '#3b82f6' });
                            }
                            setSelectedFolderName(name);
                            setSelectedFolderId(`f_${Date.now()}`);
                            setIsCreatingNewFolder(false);
                            setNewFolderNameInput('');
                            showToast('success', 'បានបង្កើត Folder', name);
                          }
                        }}
                        className="flex-1 bg-[#0E0F12] border border-cyan-500/50 rounded-lg px-2 py-1 text-xs text-white font-khmer focus:outline-none focus:border-cyan-400"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const name = newFolderNameInput.trim();
                          if (!name) return;
                          if (onSaveFolder) {
                            await onSaveFolder({ name, color: '#3b82f6' });
                          }
                          setSelectedFolderName(name);
                          setSelectedFolderId(`f_${Date.now()}`);
                          setIsCreatingNewFolder(false);
                          setNewFolderNameInput('');
                          showToast('success', 'បានបង្កើត Folder', name);
                        }}
                        className="px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] font-khmer cursor-pointer"
                      >
                        យល់ព្រម
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingNewFolder(false);
                          setNewFolderNameInput('');
                        }}
                        className="px-2 py-1 rounded-lg bg-[#25272E] text-slate-400 hover:text-white text-[11px] font-khmer cursor-pointer"
                      >
                        បោះបង់
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedFolderId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedFolderId(val);
                        const match = folders.find(f => f.id === val);
                        if (match) {
                          setSelectedFolderName(match.name);
                        } else if (val === '') {
                          setSelectedFolderName('');
                        }
                      }}
                      className="w-full bg-[#0E0F12] border border-[#30333E] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-khmer focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="">🗂️ មិនទាន់កំណត់ Folder (Default)</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedFolderName && (
                    <div className="text-[10px] text-emerald-400 font-khmer flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" /> ភាគដែល Render នឹងត្រូវដាក់ក្នុង៖ <b>"{selectedFolderName}"</b>
                    </div>
                  )}
                </div>

                {/* 2. 1-Click Video Compressor Box */}
                <div className="p-3 bg-[#18191E] border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300 font-khmer">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>⚡ សម្រួលទំហំ File (Compress Size)</span>
                    </div>
                    <span className="text-[10px] bg-amber-950/80 text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono font-bold">
                      កាត់បន្ថយ ~75%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-khmer">
                    សាកសមបំផុតសម្រាប់វីដេអូ Export ពី CapCut ដែលមានទំហំធំ (GB) ឱ្យមកនៅត្រឹម (MB) ដោយរក្សាភាពច្បាស់ HD ដដែល!
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCompressVideo('smart_hd')}
                      disabled={isProcessing}
                      className="py-1.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[11px] font-khmer transition cursor-pointer flex items-center justify-center gap-1"
                      title="កាត់បន្ថយទំហំ 75% គុណភាព 1080p HD"
                    >
                      <span>🚀 Smart HD (75%)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompressVideo('extreme')}
                      disabled={isProcessing}
                      className="py-1.5 px-2 rounded-lg bg-[#24262E] hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-bold text-[11px] font-khmer transition cursor-pointer flex items-center justify-center gap-1"
                      title="កាត់បន្ថយទំហំ 85% សម្រាប់ទូរស័ព្ទ / Social"
                    >
                      <span>📱 Extra Small (85%)</span>
                    </button>
                  </div>
                </div>

                {/* 3. Split Duration Presets */}
                <h3 className="font-bold text-xs text-slate-200 font-khmer">⏱️ កំណត់រយៈពេលក្នុងមួយភាគ</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { min: 1, label: '1 នាទី (Shorts)' },
                    { min: 3, label: '3 នាទី (TikTok)' },
                    { min: 5, label: '5 នាទី (Standard)' },
                    { min: 10, label: '10 នាទី (Long)' }
                  ].map((p) => (
                    <button
                      key={p.min}
                      onClick={() => {
                        setSplitDurationMinutes(p.min);
                        setCustomSplitSeconds(p.min * 60);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs font-khmer transition cursor-pointer ${
                        splitDurationMinutes === p.min ? 'bg-cyan-950 border-cyan-500 text-cyan-200 font-bold' : 'bg-[#1C1E24] border-[#2A2B30] text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleGenerateSplitEpisodes}
                  className="w-full py-2 rounded-xl bg-[#24262E] hover:bg-cyan-900 border border-[#373A45] hover:border-cyan-500 text-cyan-300 font-bold text-xs font-khmer transition cursor-pointer"
                >
                  ⚡ គណនាចែកភាគ ({splitDurationMinutes} នាទី/ភាគ)
                </button>

                {splitEpisodes.length > 0 && (
                  <div className="space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {splitEpisodes.map((ep) => (
                      <div key={ep.id} className="p-1.5 bg-[#18191E] border border-[#25272E] rounded text-[11px] font-mono flex justify-between text-slate-300">
                        <span>{ep.title}</span>
                        <span className="text-amber-400">{formatTimecode(ep.durationSec)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {splitEpisodes.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchSeriesRender}
                  disabled={isProcessing}
                  className={`w-full py-2.5 mt-3 rounded-xl font-khmer font-bold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                    isProcessing 
                      ? 'bg-slate-800 text-cyan-400 border border-cyan-500/40 cursor-not-allowed animate-pulse' 
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white cursor-pointer shadow-blue-900/30'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      <span>{processStatusMessage || 'កំពុង Render...'} ({progressPercent}%)</span>
                    </>
                  ) : (
                    <>
                      <span>📁 Render ចូល {selectedFolderName ? `Folder "${selectedFolderName}"` : 'Series Folder'} ({splitEpisodes.length} ភាគ)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Tab 4: Exports */}
          {inspectorTab === 'exports' && (
            <div className="p-3 space-y-3">
              <h3 className="font-bold text-xs text-slate-200 font-khmer">📁 Series Folder Hub</h3>
              {batchExportResult ? (
                <div className="p-3 bg-[#1C1E24] border border-[#2D3039] rounded-xl space-y-2 text-xs font-khmer">
                  <div className="text-emerald-400 font-bold">🎉 Render ជោគជ័យ!</div>
                  <div className="text-slate-300">Folder: {batchExportResult.folderName}</div>
                  <div className="text-slate-400">ចំនួនភាគ៖ {batchExportResult.totalEpisodes} ភាគ</div>
                  <a
                    href={batchExportResult.zipUrl}
                    download={batchExportResult.zipFileName}
                    className="block w-full text-center py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
                  >
                    📥 Download ZIP Archive
                  </a>
                </div>
              ) : (
                <div className="p-4 text-center text-slate-500 text-xs font-khmer border border-dashed border-[#2A2B30] rounded-xl">
                  មិនទាន់មានការ Render Folder
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. Bottom Half: CapCut Full-Width Pro Multi-Track Timeline */}
      {/* ========================================================================= */}
      <div className="h-64 sm:h-72 bg-[#141518] border-t border-[#24252B] flex flex-col shrink-0">
        
        {/* Timeline Top Toolbar (Razor, Delete, Undo/Redo, Zoom, Magnet) */}
        <div className="h-9 bg-[#18191C] border-b border-[#24252B] px-3 flex items-center justify-between text-xs shrink-0">
          
          {/* Left Tools: Selection, Razor Split, Delete, Undo, Redo */}
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded bg-[#24262E] text-cyan-400 border border-cyan-500/50"
              title="Selection Tool"
            >
              <MousePointer className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleRazorSplitAtPlayhead}
              className="p-1.5 rounded hover:bg-[#24262E] text-slate-300 hover:text-cyan-400 transition cursor-pointer"
              title="Razor Split at Playhead (Ctrl+B)"
            >
              <Split className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                if (selectedSliceId) handleRemoveSlice(selectedSliceId);
                else if (cutSlices.length > 0) handleRemoveSlice(cutSlices[cutSlices.length - 1].id);
              }}
              className="p-1.5 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title="Delete Selected Clip"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className="h-3.5 w-[1px] bg-[#2A2B30] mx-1" />

            <button className="p-1.5 rounded hover:bg-[#24262E] text-slate-400 hover:text-white transition" title="Undo">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button className="p-1.5 rounded hover:bg-[#24262E] text-slate-400 hover:text-white transition" title="Redo">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center: Record Mic, Magnet Snap */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMagnetEnabled(!isMagnetEnabled)}
              className={`p-1.5 rounded text-xs flex items-center gap-1 transition cursor-pointer ${
                isMagnetEnabled ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-white'
              }`}
              title="Auto Magnet Snap"
            >
              <Magnet className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Zoom Slider & Fit */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTimelineZoom(Math.max(0.5, timelineZoom - 0.2))}
              className="text-slate-400 hover:text-white p-1"
            >
              <ZoomOut className="w-3 h-3" />
            </button>

            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
              className="w-20 accent-cyan-400 cursor-pointer h-1 bg-[#282A32] rounded"
            />

            <button
              onClick={() => setTimelineZoom(Math.min(3, timelineZoom + 0.2))}
              className="text-slate-400 hover:text-white p-1"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Timeline Tracks & Ruler Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Track Headers (Left fixed column) */}
          <div className="w-28 bg-[#16171B] border-r border-[#24252B] flex flex-col text-[10px] font-khmer text-slate-400 shrink-0">
            {/* Empty space for Ruler height */}
            <div className="h-6 border-b border-[#24252B] px-2 flex items-center text-slate-600 font-mono text-[9px]">
              TRACKS
            </div>

            {/* Video Track Header */}
            <div className="h-20 border-b border-[#24252B] p-2 flex flex-col justify-between bg-[#191B20]">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span className="flex items-center gap-1">
                  <Film className="w-3 h-3 text-teal-400" />
                  <span>Video 1</span>
                </span>
                <span className="text-[9px] text-teal-400 font-mono">Main</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500">
                <button
                  onClick={() => setIsVideoTrackMuted(!isVideoTrackMuted)}
                  className={`p-1 rounded hover:bg-black/30 ${isVideoTrackMuted ? 'text-rose-400' : 'hover:text-white'}`}
                >
                  {isVideoTrackMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setIsVideoTrackLocked(!isVideoTrackLocked)}
                  className={`p-1 rounded hover:bg-black/30 ${isVideoTrackLocked ? 'text-amber-400' : 'hover:text-white'}`}
                >
                  {isVideoTrackLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Audio Track Header */}
            <div className="h-14 border-b border-[#24252B] p-2 flex flex-col justify-between bg-[#17181D]">
              <div className="flex items-center justify-between text-slate-300 font-bold">
                <span className="flex items-center gap-1">
                  <Music className="w-3 h-3 text-blue-400" />
                  <span>Audio 1</span>
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-500">
                <button
                  onClick={() => setIsAudioTrackMuted(!isAudioTrackMuted)}
                  className={`p-1 rounded hover:bg-black/30 ${isAudioTrackMuted ? 'text-rose-400' : 'hover:text-white'}`}
                >
                  {isAudioTrackMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>

          {/* Timeline Canvas with Time Ruler & Horizontal Multi-Tracks */}
          <div
            className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#111215]"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
              const computedSec = Math.max(0, (clickX / (120 * timelineZoom)) * 10);
              seekTo(computedSec);
            }}
          >
            {/* Dynamic Width Canvas based on duration & zoom */}
            <div
              className="relative min-h-full"
              style={{ width: `${Math.max(1200, (totalCutDuration || totalDuration || 60) * 15 * timelineZoom)}px` }}
            >
              {/* 1. Time Ruler Header */}
              <div className="h-6 bg-[#16171B] border-b border-[#24252B] flex items-center relative text-[9px] font-mono text-slate-500 pointer-events-none">
                {Array.from({ length: Math.ceil((totalCutDuration || totalDuration || 120) / 10) + 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute flex flex-col items-center"
                    style={{ left: `${i * 150 * timelineZoom}px` }}
                  >
                    <span className="text-slate-400">{formatTimecode(i * 10)}</span>
                    <div className="w-[1px] h-2 bg-[#33353E] mt-0.5" />
                  </div>
                ))}
              </div>

              {/* 2. White Playhead Needle Indicator */}
              <div
                className="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center -ml-[5px]"
                style={{ left: `${(currentTime / 10) * 150 * timelineZoom}px` }}
              >
                {/* Playhead Top Needle Handle */}
                <div className="w-3 h-3 bg-white rounded-xs shadow-md rotate-45 transform -mt-1 border border-black/50" />
                {/* Vertical Line */}
                <div className="w-[1.5px] flex-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              </div>

              {/* 3. TRACK 1: Video Track (CapCut Teal Filmstrip Pattern #008080) */}
              <div className="h-20 border-b border-[#202227] relative flex items-center px-1 bg-[#131417]/80">
                {cutSlices.length > 0 ? (
                  cutSlices.map((slice, idx) => {
                    const sliceDur = Math.max(1, slice.endSec - slice.startSec);
                    const clipWidthPx = Math.max(80, sliceDur * 15 * timelineZoom);
                    const isDragged = draggedClipIndex === idx;
                    const isDragOver = dragOverIndex === idx;
                    const isSelected = selectedSliceId === slice.id;

                    return (
                      <div
                        key={slice.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={() => { setDraggedClipIndex(null); setDragOverIndex(null); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSliceId(slice.id);
                          if (slice.videoUrl && slice.videoUrl !== videoUrl) {
                            setVideoUrl(slice.videoUrl);
                            setVideoTitle(slice.sourceTitle || videoTitle);
                          }
                          seekTo(slice.startSec);
                        }}
                        style={{ width: `${clipWidthPx}px` }}
                        className={`h-16 rounded-lg relative overflow-hidden border transition-all cursor-grab active:cursor-grabbing select-none flex flex-col justify-between p-1 shrink-0 mr-1 shadow-md ${
                          isDragged
                            ? 'opacity-40 border-dashed border-cyan-400 bg-cyan-950/40'
                            : isDragOver
                            ? 'border-2 border-amber-400 bg-amber-950/60 scale-[1.02]'
                            : isSelected
                            ? 'border-2 border-white bg-gradient-to-r from-teal-700 via-teal-800 to-teal-700 ring-2 ring-cyan-500/50'
                            : 'border-teal-600/80 bg-gradient-to-r from-[#006666] via-[#008080] to-[#006666] hover:border-teal-400'
                        }`}
                      >
                        {/* Filmstrip Top Bar: Title, Timecode & Delete */}
                        <div className="flex items-center justify-between text-[10px] text-white font-khmer font-bold z-10 drop-shadow-md">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="w-3.5 h-3.5 rounded bg-black/40 text-cyan-300 text-[8px] font-mono flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="truncate">{slice.title}</span>
                          </div>

                          <div className="flex items-center gap-1 font-mono text-[9px] text-cyan-200">
                            <span>{formatTimecode(slice.endSec - slice.startSec)}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSlice(slice.id);
                              }}
                              className="p-0.5 rounded hover:bg-rose-600 text-white/80 hover:text-white transition cursor-pointer"
                              title="Delete Clip"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>

                        {/* Filmstrip Repeating Thumbnail Pattern Canvas */}
                        <div className="absolute inset-0 top-4 bottom-3 flex items-center opacity-40 pointer-events-none overflow-hidden">
                          {Array.from({ length: Math.ceil(clipWidthPx / 45) }).map((_, fIdx) => (
                            <div key={fIdx} className="w-11 h-8 bg-black/50 border-r border-white/20 shrink-0 flex items-center justify-center">
                              <Film className="w-3 h-3 text-white/30" />
                            </div>
                          ))}
                        </div>

                        {/* Bottom Waveform Strip inside Video Track */}
                        <div className="h-2.5 w-full flex items-end gap-0.5 opacity-60 z-10 pointer-events-none">
                          {Array.from({ length: Math.ceil(clipWidthPx / 4) }).map((_, wIdx) => (
                            <div
                              key={wIdx}
                              className="w-0.5 bg-cyan-200 rounded-t-xs"
                              style={{ height: `${20 + ((wIdx * 17) % 80)}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-slate-600 text-xs font-khmer pl-4 flex items-center gap-2">
                    <Scissors className="w-4 h-4" />
                    <span>ទទេស្អាត — Upload វីដេអូ ឬចុច "+ Import" ដើម្បីដាក់ចូល Timeline</span>
                  </div>
                )}
              </div>

              {/* 4. TRACK 2: Audio Track (CapCut Blue Waveform Block #1d4ed8) */}
              <div className="h-14 border-b border-[#202227] relative flex items-center px-1 bg-[#111215]">
                {cutSlices.length > 0 && (
                  <div
                    style={{ width: `${Math.max(120, totalCutDuration * 15 * timelineZoom)}px` }}
                    className="h-10 rounded-lg bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 border border-blue-600 p-1.5 flex flex-col justify-between relative overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center justify-between text-[9px] font-mono text-blue-200 z-10">
                      <span className="flex items-center gap-1 font-bold">
                        <Music className="w-2.5 h-2.5 text-blue-300" />
                        <span>Master Audio Track</span>
                      </span>
                      <span>{formatTimecode(totalCutDuration)}</span>
                    </div>

                    {/* Audio Waveform visualization */}
                    <div className="h-4 flex items-end gap-0.5 z-10">
                      {Array.from({ length: 120 }).map((_, aIdx) => (
                        <div
                          key={aIdx}
                          className="flex-1 bg-blue-300/80 rounded-t-xs"
                          style={{ height: `${15 + ((aIdx * 23) % 85)}%` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* Rendering / Processing Fullscreen Glass Modal Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#18191E] border border-cyan-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center relative">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <Scissors className="w-4 h-4 text-cyan-200 absolute" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-khmer">
                កំពុងកាត់ត និង Render ជាភាគ...
              </h3>
              <p className="text-xs text-slate-400 font-khmer">
                {processStatusMessage || 'សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងដំណើរការ...'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full space-y-1.5">
              <div className="w-full bg-[#25272E] rounded-full h-2.5 overflow-hidden border border-slate-700">
                <div 
                  className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300 shadow-sm"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>ដំណើរការ៖</span>
                <span className="text-cyan-400 font-bold">{progressPercent}%</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-khmer bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
              ⚡ ប្រើប្រាស់បច្ចេកវិទ្យា Direct Stream Slicing ល្បឿនលឿន & រក្សាគុណភាពដើម ១០០%
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />

    </div>
  );
};
