import React, { useState, useRef, useMemo } from 'react';
import { 
  X, Upload, Film, Link as LinkIcon, Sparkles, Check, Play, 
  AlertCircle, Layers, Folder, FolderPlus, Music, Loader2, 
  CheckCircle2, RefreshCw, Trash2, ArrowRight, Clock, ShieldCheck, PlayCircle
} from 'lucide-react';
import { getSafeMediaUrl } from '../utils/mediaUtils';
import { MovieRecapResult, TranslationMode } from '../types';
import { processAndExtractAudio } from '../utils/mediaExtractor';
import { extractBgmInstrumentalTrack } from '../utils/vocalRemover';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (file: File, episodeInfo?: { episodeNumber: number; seriesTitle: string; previousContext: string }) => void;
  onSelectSampleVideo: (videoUrl: string, title: string) => void;
  isLoading: boolean;
  isProcessingFile: boolean;
  previousRecapSummary?: string;
  defaultMovieTitle?: string;
  customApiKey?: string;
  translationMode?: TranslationMode;
  onBatchComplete?: (recaps: MovieRecapResult[], folderName: string) => void;
  onInsertFolderToSequence?: (folderName: string, items: MovieRecapResult[]) => void;
  onSelectRecap?: (recap: MovieRecapResult) => void;
}

const SAMPLE_VIDEOS = [
  {
    id: 'sample_flower',
    title: 'Flower Macro Cinematic (ធម្មជាតិដ៏ស្រស់ស្អាត)',
    genre: 'Cinema / 4K',
    duration: '00:06',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'sample_oceans',
    title: 'Oceans Nature Cinema (រឿងជីវិតបាតសមុទ្រ)',
    genre: 'Documentary / Nature',
    duration: '00:46',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
  }
];

export interface BatchQueueItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  episodeNumber: number;
  status: 'pending' | 'uploading' | 'translating' | 'extracting_bgm' | 'done' | 'error';
  progressPercent: number;
  statusText?: string;
  recapResult?: MovieRecapResult;
  errorText?: string;
}

// Natural parser for episode numbers from filenames
const parseEpisodeNumber = (fileName: string, fallbackIdx: number): number => {
  const patterns = [
    /(?:ep|episode|ភាគ|ភាគទី|e|part|第)\s*0*(\d+)/i,
    /#\s*0*(\d+)/,
    /[-_ ]0*(\d+)\s*\./,
    /^0*(\d+)\s*[-_ .]/,
    /(\d+)/
  ];
  for (const p of patterns) {
    const m = fileName.match(p);
    if (m && m[1]) {
      const val = parseInt(m[1], 10);
      if (!isNaN(val) && val > 0 && val < 5000) return val;
    }
  }
  return fallbackIdx + 1;
};

export const VideoUploadModal: React.FC<VideoUploadModalProps> = ({
  isOpen,
  onClose,
  onFileUpload,
  onSelectSampleVideo,
  isLoading,
  isProcessingFile,
  previousRecapSummary,
  defaultMovieTitle,
  customApiKey = '',
  translationMode = 'word_by_word_lip_sync',
  onBatchComplete,
  onInsertFolderToSequence,
  onSelectRecap
}) => {
  const [activeTab, setActiveTab] = useState<'folder_batch' | 'upload' | 'sample' | 'link'>('folder_batch');
  const [dragActive, setDragActive] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');

  // Single file Episode Continuity States
  const [isEpisodic, setIsEpisodic] = useState<boolean>(!!previousRecapSummary);
  const [seriesTitle, setSeriesTitle] = useState<string>(defaultMovieTitle || '');
  const [episodeNumber, setEpisodeNumber] = useState<number>(previousRecapSummary ? 2 : 1);
  const [previousContext, setPreviousContext] = useState<string>(previousRecapSummary || '');

  // Folder Batch Upload States
  const [batchFolderName, setBatchFolderName] = useState<string>('');
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [batchTranslationMode, setBatchTranslationMode] = useState<TranslationMode>(translationMode);
  const [autoExtractBgm, setAutoExtractBgm] = useState<boolean>(true);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const getEpisodeInfo = () => {
    if (!isEpisodic) return undefined;
    return {
      episodeNumber: episodeNumber || 1,
      seriesTitle: seriesTitle.trim() || 'រឿងភាគ',
      previousContext: previousContext.trim()
    };
  };

  // Helper: Format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Handle folder or multiple files selection
  const handleProcessIncomingFiles = (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    // Filter only video or audio files
    const videoFiles = rawFiles.filter(f => {
      const ext = f.name.toLowerCase();
      return f.type.startsWith('video/') || 
             f.type.startsWith('audio/') || 
             ext.endsWith('.mp4') || 
             ext.endsWith('.mkv') || 
             ext.endsWith('.mov') || 
             ext.endsWith('.webm') || 
             ext.endsWith('.avi') || 
             ext.endsWith('.ts') ||
             ext.endsWith('.flv');
    });

    if (videoFiles.length === 0) return;

    // Detect folder name from webkitRelativePath
    let detectedFolder = 'រឿងភាគថ្មី (Series Project)';
    const firstRel = (videoFiles[0] as any).webkitRelativePath;
    if (firstRel && typeof firstRel === 'string' && firstRel.includes('/')) {
      detectedFolder = firstRel.split('/')[0] || detectedFolder;
    } else if (defaultMovieTitle) {
      detectedFolder = defaultMovieTitle;
    }
    setBatchFolderName(detectedFolder);

    // Map & sort by parsed episode number
    const mapped: BatchQueueItem[] = videoFiles.map((file, idx) => ({
      id: `batch_item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      file,
      fileName: file.name,
      fileSize: file.size,
      episodeNumber: parseEpisodeNumber(file.name, idx),
      status: 'pending',
      progressPercent: 0,
      statusText: 'រង់ចាំបកប្រែ'
    }));

    // Natural sort by episodeNumber
    mapped.sort((a, b) => a.episodeNumber - b.episodeNumber);

    setBatchQueue(mapped);
    setActiveTab('folder_batch');
  };

  // Drag & Drop handlers
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1 || (e.dataTransfer.files[0] as any).webkitRelativePath) {
        handleProcessIncomingFiles(e.dataTransfer.files);
      } else {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
          onFileUpload(file, getEpisodeInfo());
          onClose();
        }
      }
    }
  };

  // Process a single episode in the batch
  const processSingleEpisode = async (
    item: BatchQueueItem,
    folderTitle: string,
    prevEpisodeContext: string = ''
  ): Promise<MovieRecapResult> => {
    const file = item.file;
    const epNum = item.episodeNumber;
    const epMovieTitle = `${folderTitle} - ភាគទី ${epNum}`;

    // 1. Upload video file to server storage for permanent /api/media/... URL
    setBatchQueue(prev => prev.map(x => x.id === item.id ? { ...x, status: 'uploading', statusText: '📤 កំពុង Upload វីដេអូ...' } : x));
    
    let serverVideoUrl = URL.createObjectURL(file);
    try {
      const reader = new FileReader();
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = (reader.result as string).split(',')[1] || (reader.result as string);
          resolve(res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploadRes = await fetch('/api/upload-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, fileName: file.name, autoCompress: true })
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        serverVideoUrl = uploadData.fileUrl || uploadData.url || `/api/media/${uploadData.fileName}`;
      }
    } catch (uploadErr) {
      console.warn('Server upload media failed, using local Blob URL:', uploadErr);
    }

    // 2. Extract Audio & Call Gemini AI to Translate
    setBatchQueue(prev => prev.map(x => x.id === item.id ? { ...x, status: 'translating', statusText: '🎙️ Gemini AI កំពុងបកប្រែ...' } : x));
    
    const { base64: audioBase64, mimeType } = await processAndExtractAudio(file);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (customApiKey) headers['x-gemini-api-key'] = customApiKey;

    const recapRes = await fetch('/api/recap/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mediaData: audioBase64,
        mediaMimeType: mimeType,
        mediaFileName: file.name,
        mediaUrl: serverVideoUrl,
        inputMode: 'video',
        translationMode: batchTranslationMode,
        sourceLanguage: 'auto',
        recapStyle: 'dramatic_action',
        targetDurationMin: 3,
        episodeNumber: epNum,
        seriesTitle: folderTitle,
        previousContext: prevEpisodeContext,
        customApiKey: customApiKey || undefined
      })
    });

    if (!recapRes.ok) {
      const err = await recapRes.json().catch(() => ({}));
      throw new Error(err.error || `Gemini AI returned error ${recapRes.status}`);
    }

    const recapData: MovieRecapResult = await recapRes.json();

    // 3. AI Python Demucs Vocal Remover (Isolate BGM) if enabled
    let bgmTrackUrl = '';
    let bgmFileName = '';
    if (autoExtractBgm) {
      setBatchQueue(prev => prev.map(x => x.id === item.id ? { ...x, status: 'extracting_bgm', statusText: '🎵 AI កំពុងញែក BGM...' } : x));
      try {
        const bgmRes = await extractBgmInstrumentalTrack(file, undefined, file.name, serverVideoUrl);
        bgmTrackUrl = bgmRes.blobUrl;
        bgmFileName = bgmRes.file.name;
      } catch (bgmErr) {
        console.warn(`Demucs BGM separation failed for ${file.name}:`, bgmErr);
      }
    }

    // 4. Save permanently into SQLite Database under Folder Name
    const fullRecap: MovieRecapResult = {
      ...recapData,
      movie_title: epMovieTitle,
      seriesTitle: folderTitle,
      folderName: folderTitle,
      episodeNumber: epNum,
      videoUrl: serverVideoUrl,
      videoFileName: file.name,
      mediaType: 'video',
      bgmTrackUrl: bgmTrackUrl || undefined,
      bgmFileName: bgmFileName || undefined,
      created_at: new Date().toISOString()
    };

    try {
      await fetch('/api/db/recaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRecap)
      });
    } catch (dbErr) {
      console.warn('Auto-save recap to SQLite failed:', dbErr);
    }

    // Auto-create folder in DB if needed
    try {
      await fetch('/api/db/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderTitle, color: '#3B82F6' })
      });
    } catch {}

    return fullRecap;
  };

  // Run full batch processing for all pending episodes in sequence
  const handleRunBatchAll = async () => {
    if (batchQueue.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    isCancelledRef.current = false;

    const folderTitle = (batchFolderName || 'ស៊េរីរឿងថ្មី').trim();
    const completedResults: MovieRecapResult[] = [];
    let runningContext = '';

    for (let i = 0; i < batchQueue.length; i++) {
      if (isCancelledRef.current) break;
      const item = batchQueue[i];
      if (item.status === 'done') {
        if (item.recapResult) completedResults.push(item.recapResult);
        continue;
      }

      try {
        const recap = await processSingleEpisode(item, folderTitle, runningContext);
        completedResults.push(recap);
        
        // Update context for next episode
        if (recap.recap_segments && recap.recap_segments.length > 0) {
          runningContext = `[ភាគទី ${recap.episodeNumber}]: ` + recap.recap_segments.slice(-3).map(s => s.khmer_script).join(' ');
        }

        setBatchQueue(prev => prev.map(x => x.id === item.id ? {
          ...x,
          status: 'done',
          progressPercent: 100,
          statusText: '✅ រួចរាល់ក្នុង DB',
          recapResult: recap
        } : x));

      } catch (err: any) {
        console.error(`Batch item ${item.fileName} failed:`, err);
        setBatchQueue(prev => prev.map(x => x.id === item.id ? {
          ...x,
          status: 'error',
          statusText: '❌ បរាជ័យ',
          errorText: err.message || 'Error'
        } : x));
      }
    }

    setIsBatchProcessing(false);
    if (onBatchComplete && completedResults.length > 0) {
      onBatchComplete(completedResults, folderTitle);
    }
  };

  // Process single item individually
  const handleProcessIndividualItem = async (item: BatchQueueItem) => {
    const folderTitle = (batchFolderName || 'ស៊េរីរឿងថ្មី').trim();
    try {
      const recap = await processSingleEpisode(item, folderTitle);
      setBatchQueue(prev => prev.map(x => x.id === item.id ? {
        ...x,
        status: 'done',
        progressPercent: 100,
        statusText: '✅ រួចរាល់ក្នុង DB',
        recapResult: recap
      } : x));
    } catch (err: any) {
      setBatchQueue(prev => prev.map(x => x.id === item.id ? {
        ...x,
        status: 'error',
        statusText: '❌ បរាជ័យ',
        errorText: err.message
      } : x));
    }
  };

  // Open single item directly in Studio
  const handleOpenInStudio = (item: BatchQueueItem) => {
    if (item.recapResult && onSelectRecap) {
      onSelectRecap(item.recapResult);
      onClose();
    } else {
      onFileUpload(item.file, {
        episodeNumber: item.episodeNumber,
        seriesTitle: batchFolderName || 'រឿងភាគ',
        previousContext: ''
      });
      onClose();
    }
  };

  // Completed items count
  const doneCount = batchQueue.filter(x => x.status === 'done').length;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn font-sans">
      <div className="bg-[#0f141f] rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[92vh] text-slate-200">
        
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white font-khmer flex items-center gap-2">
                <span>នាំចូលវីដេអូ (Upload Folder & Multi-Episodes)</span>
                {batchQueue.length > 0 && (
                  <span className="bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[10px] font-mono px-2 py-0.2 rounded-full font-bold">
                    {batchQueue.length} ភាគ
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 font-khmer">
                Upload ទាំង Folder ចូល ហើយបកប្រែ + ញែក BGM ម្តងទាំងអស់ ឬម្តងមួយភាគ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-3 text-xs font-semibold overflow-x-auto custom-scrollbar">
          
          {/* TAB 1: Folder Batch (FEATURED) */}
          <button
            onClick={() => setActiveTab('folder_batch')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap font-khmer font-bold ${
              activeTab === 'folder_batch'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-4 h-4 text-blue-400" />
            <span>📁 Upload ទាំង Folder / Batch</span>
            {batchQueue.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded-full">
                {batchQueue.length}
              </span>
            )}
          </button>

          {/* TAB 2: Single Video File */}
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap font-khmer ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload វីដេអូទោល (Single File)</span>
          </button>

          {/* TAB 3: Sample Videos */}
          <button
            onClick={() => setActiveTab('sample')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap font-khmer ${
              activeTab === 'sample'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-4 h-4 text-purple-400" />
            <span>វីដេអូគំរូ (Sample Clips)</span>
          </button>

          {/* TAB 4: Link URL */}
          <button
            onClick={() => setActiveTab('link')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap font-khmer ${
              activeTab === 'link'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-4 h-4 text-emerald-400" />
            <span>Video Link (URL)</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* ======================================================== */}
          {/* TAB 1: FOLDER BATCH & MULTI-EPISODES UPLOAD & QUEUE      */}
          {/* ======================================================== */}
          {activeTab === 'folder_batch' && (
            <div className="space-y-4 font-khmer">
              
              {/* Hidden Inputs for Folder and Multi-Files */}
              <input
                ref={folderInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => e.target.files && handleProcessIncomingFiles(e.target.files)}
                className="hidden"
              />
              <input
                ref={multiFileInputRef}
                type="file"
                multiple
                accept="video/*,audio/*,.mp4,.mkv,.mov,.webm,.ts,.avi,.flv"
                onChange={(e) => e.target.files && handleProcessIncomingFiles(e.target.files)}
                className="hidden"
              />

              {/* 1. Upload Dropzone (When queue is empty or to add more) */}
              {batchQueue.length === 0 ? (
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition flex flex-col items-center justify-center gap-3 ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-500/20' 
                      : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
                    <FolderPlus className="w-7 h-7" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-100">
                      អូសទម្លាក់ Folder វីដេអូ ឬជ្រើសរើសច្រើន Files
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      ជ្រើសរើស Folder ដែលមានវីដេអូរឿងភាគទាំងអស់ (MP4, MKV, MOV, WEBM) ដើម្បីបកប្រែ និងញែក BGM ដោយស្វ័យប្រវត្តិ
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-blue-600/20 transition cursor-pointer active:scale-95"
                    >
                      <Folder className="w-4 h-4" />
                      <span>ជ្រើសរើស Folder វីដេអូ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => multiFileInputRef.current?.click()}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>ជ្រើសរើសច្រើន Files</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* 2. Batch Queue Dashboard & Controls */
                <div className="space-y-3.5">
                  
                  {/* Folder Settings Bar */}
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          📁 ឈ្មោះ Folder / ស៊េរីរឿង (Series Title)៖
                        </label>
                        <input
                          type="text"
                          value={batchFolderName}
                          onChange={(e) => setBatchFolderName(e.target.value)}
                          placeholder="ឧទាហរណ៍៖ ស្រមោលអតីតកាលគ្រួសារជីន..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          🎙️ ទម្រង់នៃការបកប្រែ (Translation Mode)៖
                        </label>
                        <select
                          value={batchTranslationMode}
                          onChange={(e) => setBatchTranslationMode(e.target.value as TranslationMode)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="word_by_word_lip_sync">🗣️ បកប្រែបញ្ចូលសំឡេងខ្មែរ (Word-by-Word Lip Sync)</option>
                          <option value="movie_recap">🎬 សម្រាយរឿងបែបភាពយន្ត (Dramatic Movie Recap)</option>
                          <option value="character_dialogue">🎭 សំឡេងតាមតួអង្គ (Character Dubbing)</option>
                          <option value="hybrid_recap_dub">⚡ កូនកាត់ (Hybrid Dub & Recap)</option>
                        </select>
                      </div>
                    </div>

                    {/* Auto BGM Extraction Checkbox */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-850 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={autoExtractBgm}
                          onChange={(e) => setAutoExtractBgm(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                        <span className="flex items-center gap-1 font-bold text-emerald-400">
                          <Music className="w-3.5 h-3.5" />
                          <span>ញែក និងរក្សាទុកសំឡេង BGM ភ្លាមៗ (Python AI Demucs)</span>
                        </span>
                      </label>

                      <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                        <span>សរុប {batchQueue.length} ភាគ</span>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('តើអ្នកចង់សម្អាតបញ្ជី Folder នេះមែនទេ?')) {
                              setBatchQueue([]);
                            }
                          }}
                          className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>សម្អាត</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Batch Action Bar */}
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                    
                    {/* Left: Overall Progress Info */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold font-mono text-xs shrink-0">
                        {doneCount}/{batchQueue.length}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>វឌ្ឍនភាព៖ {doneCount} ភាគរួចរាល់ ({Math.round((doneCount / batchQueue.length) * 100)}%)</span>
                          {isBatchProcessing && (
                            <span className="text-amber-400 flex items-center gap-1 text-[11px] animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>កំពុងដំណើរការ...</span>
                            </span>
                          )}
                        </div>
                        <div className="w-48 sm:w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
                            style={{ width: `${(doneCount / batchQueue.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right: Master Actions */}
                    <div className="flex items-center gap-2">
                      {isBatchProcessing ? (
                        <button
                          type="button"
                          onClick={() => {
                            isCancelledRef.current = true;
                            setIsBatchProcessing(false);
                          }}
                          className="px-3.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 rounded-xl text-xs font-bold cursor-pointer transition"
                        >
                          ⏹️ បញ្ឈប់ (Cancel)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleRunBatchAll}
                          disabled={doneCount === batchQueue.length}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer active:scale-95"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>🚀 បកប្រែ & ញែក BGM ទាំងអស់ ({batchQueue.length - doneCount})</span>
                        </button>
                      )}

                      {doneCount > 0 && onInsertFolderToSequence && (
                        <button
                          type="button"
                          onClick={() => {
                            const completedRecaps = batchQueue
                              .filter(x => x.status === 'done' && x.recapResult)
                              .map(x => x.recapResult!);
                            if (completedRecaps.length > 0) {
                              onInsertFolderToSequence(batchFolderName || 'ស៊េរីរឿងថ្មី', completedRecaps);
                              onClose();
                            }
                          }}
                          className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer active:scale-95"
                        >
                          <Film className="w-3.5 h-3.5" />
                          <span>🎬 បញ្ជូនទៅកាត់តភាគ ({doneCount})</span>
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Episode Queue Items List */}
                  <div className="space-y-1.5 max-h-[42vh] overflow-y-auto custom-scrollbar pr-1">
                    {batchQueue.map((item, idx) => {
                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                            item.status === 'done'
                              ? 'bg-emerald-950/30 border-emerald-500/40'
                              : item.status === 'translating' || item.status === 'extracting_bgm' || item.status === 'uploading'
                              ? 'bg-blue-950/40 border-blue-500/50 shadow-xs ring-1 ring-blue-500/20'
                              : item.status === 'error'
                              ? 'bg-red-950/30 border-red-500/40'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {/* Left: Episode Badge & File Details */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[10px] font-bold px-2 py-0.5 rounded-lg font-khmer">
                                ភាគ {item.episodeNumber}
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <h5 className="font-bold text-xs text-slate-200 truncate" title={item.fileName}>
                                {item.fileName}
                              </h5>
                              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                                <span>{formatBytes(item.fileSize)}</span>
                                <span>•</span>
                                <span className={
                                  item.status === 'done' ? 'text-emerald-400 font-bold' :
                                  item.status === 'error' ? 'text-red-400 font-bold' :
                                  item.status === 'translating' || item.status === 'extracting_bgm' ? 'text-amber-400 font-bold animate-pulse' :
                                  'text-slate-400'
                                }>
                                  {item.statusText}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Actions for this episode */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.status === 'done' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenInStudio(item)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                              >
                                <PlayCircle className="w-3.5 h-3.5" />
                                <span>បើកក្នុង Studio</span>
                              </button>
                            ) : item.status === 'translating' || item.status === 'extracting_bgm' || item.status === 'uploading' ? (
                              <div className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-lg text-xs font-bold animate-pulse">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>កំពុងបកប្រែ</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleProcessIndividualItem(item)}
                                disabled={isBatchProcessing}
                                className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95"
                                title="បកប្រែតែភាគនេះមួយប៉ុណ្ណោះ"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>បកប្រែភាគនេះ</span>
                              </button>
                            )}

                            {/* Open in Studio Directly Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenInStudio(item)}
                              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                              title="បើកវីដេអូនេះក្នុង Dubbing Studio"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove from queue button */}
                            {!isBatchProcessing && (
                              <button
                                type="button"
                                onClick={() => setBatchQueue(prev => prev.filter(x => x.id !== item.id))}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition cursor-pointer"
                                title="ដកចេញពីបញ្ជី"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: SINGLE LOCAL FILE UPLOAD                          */}
          {/* ======================================================== */}
          {activeTab === 'upload' && (
            <div className="space-y-4 font-khmer">
              
              {/* Episode Continuity Toggle Box */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3 font-khmer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        កំណត់សម្រាយរឿងតាមភាគ (Episode Continuity)
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        ជួយឱ្យ Gemini AI យល់ពីសាច់រឿងភាគមុន និងបកប្រែបន្តបានត្រឹមត្រូវ
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isEpisodic} 
                      onChange={(e) => setIsEpisodic(e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-700 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {isEpisodic && (
                  <div className="pt-2 border-t border-slate-850 grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        ឈ្មោះរឿងរួម (Series Title)
                      </label>
                      <input 
                        type="text"
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.target.value)}
                        placeholder="ឧ. ស្រមោលអតីតកាលគ្រួសារជីន"
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        ភាគទី (Episode #)
                      </label>
                      <input 
                        type="number"
                        min={1}
                        value={episodeNumber}
                        onChange={(e) => setEpisodeNumber(parseInt(e.target.value) || 1)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        សម្រាយ/បរិបទភាគមុន (Previous Episode Context)
                      </label>
                      <textarea
                        rows={2}
                        value={previousContext}
                        onChange={(e) => setPreviousContext(e.target.value)}
                        placeholder="សង្ខេបរឿងភាគមុន ដើម្បីឱ្យ AI បកប្រែភាគនេះបន្តសាច់រឿងបានត្រូវ..."
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Single File Upload Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-950/30' 
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,audio/*,.mp4,.mkv,.mov,.webm,.avi"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      onFileUpload(e.target.files[0], getEpisodeInfo());
                      onClose();
                    }
                  }}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400">
                  <Upload className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">
                    ចុច ឬអូសទម្លាក់វីដេអូទោលចូលទីនេះ
                  </h3>
                  <p className="text-xs text-slate-400">
                    ទ្រទ្រង់ MP4, MKV, MOV, WEBM, AVI ឬ Audio MP3/WAV
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: SAMPLE CLIPS                                      */}
          {/* ======================================================== */}
          {activeTab === 'sample' && (
            <div className="space-y-3 font-khmer">
              <p className="text-xs text-slate-400 mb-2">
                សាកល្បងជាមួយវីដេអូគំរូខាងក្រោម ដើម្បីពិនិត្យមើលលទ្ធផលបកប្រែ៖
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SAMPLE_VIDEOS.map((sample) => (
                  <div
                    key={sample.id}
                    onClick={() => {
                      onSelectSampleVideo(sample.url, sample.title);
                      onClose();
                    }}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-blue-500/60 rounded-xl cursor-pointer group transition space-y-2"
                  >
                    <div className="relative rounded-lg overflow-hidden aspect-video bg-black">
                      <img 
                        src={sample.thumbnail} 
                        alt={sample.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center group-hover:scale-110 transition shadow-lg">
                          <Play className="w-4 h-4 ml-0.5 fill-white" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 bg-black/80 font-mono text-[10px] text-white px-1.5 py-0.5 rounded font-bold">
                        {sample.duration}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-blue-400 transition truncate">
                        {sample.title}
                      </h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {sample.genre}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: DIRECT URL LINK                                   */}
          {/* ======================================================== */}
          {activeTab === 'link' && (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (videoUrlInput.trim()) {
                onSelectSampleVideo(getSafeMediaUrl(videoUrlInput.trim()), 'Imported Movie Video');
                onClose();
              }
            }} className="space-y-4 font-khmer">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  តំណភ្ជាប់វីដេអូ (Direct Video MP4 URL)៖
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/video.mp4"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                នាំចូលវីដេអូ (Import Video)
              </button>
            </form>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-khmer">
          <span className="text-slate-500 text-[11px]">
            {batchQueue.length > 0 ? `📁 ${batchQueue.length} ភាគក្នុង Folder Queue` : 'Dubber AI Studio'}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
          >
            បិទ (Close)
          </button>
        </div>

      </div>
    </div>
  );
};
