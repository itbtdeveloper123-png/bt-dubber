import React, { useState, useEffect } from 'react';
import { RecapStudio } from './components/RecapStudio';
import { SavedRecapsModal } from './components/SavedRecapsModal';
import { GenerationParams, MovieRecapResult, TranslationMode } from './types';
import { DEFAULT_DEMO_RECAP } from './data/sampleTranscripts';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { processAndExtractAudio } from './utils/mediaExtractor';
import { convertVideoToH264MP4, isLikelyUnsupportedVideo } from './utils/videoTranscoder';

export default function App() {
  const [currentRecap, setCurrentRecap] = useState<MovieRecapResult | null>(DEFAULT_DEMO_RECAP);
  const [translationMode, setTranslationMode] = useState<TranslationMode>('movie_recap');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRecaps, setSavedRecaps] = useState<MovieRecapResult[]>([]);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState<boolean>(false);

  // Load saved recaps from LocalStorage on initial mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('khmer_recap_saved_scripts');
      if (stored) {
        setSavedRecaps(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to parse saved recaps from localStorage:', e);
    }
  }, []);

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
      const response = await fetch('/api/recap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned error status ${response.status}`);
      }

      const data: MovieRecapResult = await response.json();
      data.created_at = new Date().toISOString();
      if (params.mediaUrl) {
        data.videoUrl = params.mediaUrl;
        data.videoFileName = params.mediaFileName;
        data.mediaType = (params.inputMode === 'video' || params.mediaMimeType?.startsWith('video/')) ? 'video' : 'audio';
      }
      if (currentRecap?.rawFile) {
        data.rawFile = currentRecap.rawFile;
      }
      setCurrentRecap(data);

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

  const handleSaveCurrentRecap = () => {
    if (!currentRecap) return;
    const exists = savedRecaps.some(
      r => r.movie_title === currentRecap.movie_title && r.created_at === currentRecap.created_at
    );
    if (!exists) {
      const updated = [currentRecap, ...savedRecaps];
      saveRecapsToStorage(updated);
    }
  };

  const handleDeleteSavedRecap = (index: number) => {
    const updated = savedRecaps.filter((_, i) => i !== index);
    saveRecapsToStorage(updated);
  };

  const handleClearAllSaved = () => {
    saveRecapsToStorage([]);
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

      {/* Main Studio View */}
      {currentRecap ? (
        <RecapStudio
          recapData={currentRecap}
          onUpdateRecap={(updated) => setCurrentRecap(updated)}
          onSaveRecap={handleSaveCurrentRecap}
          isSaved={isCurrentSaved}
          onOpenSaved={() => setIsSavedModalOpen(true)}
          savedCount={savedRecaps.length}
          onFileUpload={handleFileUpload}
          isLoading={isLoading}
          isProcessingFile={isProcessingFile}
          translationMode={translationMode}
          onChangeTranslationMode={setTranslationMode}
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
      )}

      {/* Saved Recaps History Modal */}
      <SavedRecapsModal
        isOpen={isSavedModalOpen}
        onClose={() => setIsSavedModalOpen(false)}
        savedRecaps={savedRecaps}
        onSelectRecap={(recap) => setCurrentRecap(recap)}
        onDeleteRecap={handleDeleteSavedRecap}
        onClearAll={handleClearAllSaved}
      />

    </div>
  );
}
