import React, { useState, useRef } from 'react';
import { 
  FileText, Upload, Sparkles, Wand2, Globe, Clock, Flame, 
  Play, RotateCcw, AlertCircle, FileCode, Check, Video, Music, Film, X
} from 'lucide-react';
import { GenerationParams, SourceLanguage, RecapStyle } from '../types';
import { SAMPLE_TRANSCRIPTS } from '../data/sampleTranscripts';

interface TranscriptInputProps {
  onGenerate: (params: GenerationParams) => void;
  isLoading: boolean;
}

export const TranscriptInput: React.FC<TranscriptInputProps> = ({
  onGenerate,
  isLoading
}) => {
  const [inputMode, setInputMode] = useState<'video' | 'text'>('video');
  const [transcript, setTranscript] = useState<string>('');
  
  // Media Upload States
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaBase64, setMediaBase64] = useState<string | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('auto');
  const [recapStyle, setRecapStyle] = useState<RecapStyle>('dramatic_action');
  const [targetDurationMin, setTargetDurationMin] = useState<number>(3);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  const handleTextFileUpload = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setTranscript(content);
        setSelectedSampleId(null);
      }
    };
    reader.readAsText(file);
  };

  const handleMediaFileUpload = (file: File) => {
    if (!file) return;
    setMediaFile(file);
    setIsProcessingFile(true);

    // Create Object URL for instant local video/audio player preview
    const blobUrl = URL.createObjectURL(file);
    setMediaPreviewUrl(blobUrl);

    // Read as Base64 for Gemini multimodal input
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setMediaBase64(result);
        setIsProcessingFile(false);

        // AUTO-GENERATE IMMEDIATELY WHEN VIDEO FILE IS UPLOADED!
        onGenerate({
          transcript: transcript.trim(),
          mediaData: result,
          mediaMimeType: file.type,
          mediaFileName: file.name,
          mediaUrl: blobUrl,
          inputMode: 'video',
          sourceLanguage,
          recapStyle,
          targetDurationMin,
        });
      } else {
        setIsProcessingFile(false);
      }
    };
    reader.onerror = () => {
      setIsProcessingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const clearMediaFile = () => {
    setMediaFile(null);
    setMediaBase64(null);
    setIsProcessingFile(false);
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
      setMediaPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('video/') || droppedFile.type.startsWith('audio/')) {
        setInputMode('video');
        handleMediaFileUpload(droppedFile);
      } else {
        handleTextFileUpload(droppedFile);
      }
    }
  };

  const loadSample = (sampleId: string) => {
    const sample = SAMPLE_TRANSCRIPTS.find(s => s.id === sampleId);
    if (sample) {
      setTranscript(sample.content);
      setSourceLanguage(sample.languageCode);
      setSelectedSampleId(sample.id);
      setInputMode('text');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'text' && !transcript.trim()) return;
    if (inputMode === 'video' && !mediaBase64 && !transcript.trim()) return;

    onGenerate({
      transcript: transcript.trim(),
      mediaData: mediaBase64 || undefined,
      mediaMimeType: mediaFile?.type || undefined,
      mediaFileName: mediaFile?.name || undefined,
      mediaUrl: mediaPreviewUrl || undefined,
      inputMode,
      sourceLanguage,
      recapStyle,
      targetDurationMin,
      customNotes
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-[#16191E] border border-[#2D2F36] rounded p-5 sm:p-6 text-[#E0E0E0] relative">
      
      {/* Title & Input Mode Switcher */}
      <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2D2F36]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded bg-[#0A0C10] text-amber-500 border border-[#2D2F36]">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-white uppercase tracking-wider">
              1. Input Foreign Movie Media or Transcript
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Upload movie video clip (MP4, WEBM, MOV) or subtitle transcript to generate dramatic Khmer recap script (អត្ថបទសម្រាយរឿងខ្មែរ).
          </p>
        </div>

        {/* Input Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-[#0A0C10] p-1 rounded border border-[#2D2F36] self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setInputMode('video')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition flex items-center gap-1.5 ${
              inputMode === 'video'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Upload Video / Audio (វីដេអូរឿង)</span>
          </button>

          <button
            type="button"
            onClick={() => setInputMode('text')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition flex items-center gap-1.5 ${
              inputMode === 'text'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Subtitle / SRT Text (អត្ថបទ)</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* MODE 1: VIDEO / AUDIO FILE UPLOAD */}
        {inputMode === 'video' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest font-mono text-gray-400 flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-amber-500" />
                Upload Movie Video or Audio File (ទាញទម្លាក់វីដេអូរឿង)
              </label>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                AI Multimodal Vision & Speech Translation
              </span>
            </div>

            {!mediaFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => mediaFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-[#2D2F36] bg-[#0A0C10] hover:border-amber-500/60'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#16191E] border border-[#2D2F36] text-amber-500 flex items-center justify-center mx-auto mb-3">
                  <Video className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Click or drag & drop movie video or audio clip here
                </h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto mb-3">
                  Supports MP4, WEBM, MOV, MP3, WAV, M4A up to 50MB. Gemini AI will listen, watch, and write the full Khmer movie recap script!
                </p>
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#16191E] border border-[#2D2F36] rounded text-[11px] font-mono text-amber-400">
                  <Upload className="w-3 h-3 text-amber-500" />
                  <span>Choose Video File (ជ្រើសរើសវីដេអូរឿង)</span>
                </div>
              </div>
            ) : (
              <div className="bg-[#0A0C10] border border-[#2D2F36] rounded p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#2D2F36] pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center">
                      {mediaFile.type.startsWith('video/') ? <Video className="w-5 h-5" /> : <Music className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono truncate max-w-xs sm:max-w-md">
                        {mediaFile.name}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-mono flex items-center gap-2">
                        <span>{mediaFile.type} • {formatFileSize(mediaFile.size)}</span>
                        {isProcessingFile && (
                          <span className="text-amber-400 font-bold animate-pulse">
                            • ⏳ Reading Video...
                          </span>
                        )}
                        {!isProcessingFile && mediaBase64 && (
                          <span className="text-emerald-400 font-bold">
                            • ✅ Ready for AI
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearMediaFile}
                    className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition"
                    title="Remove File"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Local Video Preview Player */}
                {mediaPreviewUrl && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-gray-400 block">
                      VIDEO PREVIEW & TIMESTAMP SYNC PLAYER:
                    </span>
                    {mediaFile.type.startsWith('video/') ? (
                      <video
                        src={mediaPreviewUrl}
                        controls
                        className="w-full max-h-60 rounded bg-black border border-[#2D2F36] object-contain shadow-inner"
                      />
                    ) : (
                      <audio
                        src={mediaPreviewUrl}
                        controls
                        className="w-full mt-2"
                      />
                    )}

                    {/* Prominent Direct Generate Action Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isLoading || isProcessingFile || !mediaBase64}
                        className={`w-full py-3 px-4 rounded font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                          isLoading || isProcessingFile || !mediaBase64
                            ? 'bg-[#2D2F36] text-gray-500 cursor-not-allowed border border-[#3D4049]'
                            : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 active:scale-98 ring-2 ring-amber-500/50 animate-pulse'
                        }`}
                      >
                        {isLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            <span>Gemini AI កំពុងទស្សនា និងសរសេរអត្ថបទសម្រាយរឿងខ្មែរ...</span>
                          </>
                        ) : isProcessingFile ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-500/30 border-t-gray-400 rounded-full animate-spin" />
                            <span>កំពុងរៀបចំហ្វាយវីដេអូ... (Preparing Video...)</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 text-black" />
                            <span>🚀 ចុចទីនេះដើម្បីបង្កើតអត្ថបទសម្រាយរឿងខ្មែរ (Generate Khmer Script Now)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <input
              ref={mediaFileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska,audio/mp3,audio/wav,audio/m4a,audio/aac"
              onChange={(e) => e.target.files?.[0] && handleMediaFileUpload(e.target.files[0])}
              className="hidden"
            />

            {/* Optional transcript accompaniment */}
            <div className="pt-2">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block mb-1">
                Optional Subtitles or Notes to accompany video:
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Optional: Paste foreign dialogue transcript or specific scene notes to help precision..."
                rows={3}
                className="w-full p-2.5 bg-[#0A0C10] border border-[#2D2F36] rounded text-xs font-mono text-gray-200 focus:outline-none focus:border-amber-500 placeholder:text-gray-600"
              />
            </div>
          </div>
        )}

        {/* MODE 2: TEXT TRANSCRIPT / SUBTITLES */}
        {inputMode === 'text' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest font-mono text-gray-400 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                Source Subtitle or Script Text
              </label>
              {transcript && (
                <button
                  type="button"
                  onClick={() => { setTranscript(''); setSelectedSampleId(null); }}
                  className="text-xs text-gray-400 hover:text-red-400 transition flex items-center gap-1 font-mono"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>

            {/* Quick Sample Selector */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest mr-1">
                PRESET SCRIPTS:
              </span>
              {SAMPLE_TRANSCRIPTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSample(s.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition border flex items-center gap-1 ${
                    selectedSampleId === s.id
                      ? 'bg-amber-500 text-black border-amber-500 font-bold'
                      : 'bg-[#0A0C10] hover:bg-[#2D2F36] border-[#2D2F36] text-gray-300'
                  }`}
                >
                  <span>{s.language}</span>
                  <span className={`text-[10px] ${selectedSampleId === s.id ? 'text-black/80' : 'text-gray-500'}`}>
                    ({s.genre.split('/')[0]})
                  </span>
                </button>
              ))}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`relative rounded border transition-all ${
                dragActive
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-[#2D2F36] bg-[#0A0C10] hover:border-[#3D4049]'
              }`}
            >
              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setSelectedSampleId(null);
                }}
                placeholder={`Paste raw transcript or SRT subtitles here...\nExample SRT format:\n\n1\n00:00:01,000 --> 00:00:15,000\nCommander Marcus leads an elite hacker team into the cyber vault...`}
                rows={7}
                className="w-full p-3.5 bg-transparent text-[#E0E0E0] text-xs font-mono focus:outline-none resize-y placeholder:text-gray-600 leading-relaxed"
              />

              {!transcript && (
                <div className="p-3 bg-[#16191E]/80 border-t border-[#2D2F36] rounded-b flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-amber-500" />
                    <span>Drag & drop .srt, .vtt, or .txt file here, or</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-500 hover:underline font-semibold"
                    >
                      browse files
                    </button>
                  </div>
                  <span className="text-gray-500 font-mono text-[11px]">SRT / VTT / TXT</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.vtt,.txt,.json,.csv"
                onChange={(e) => e.target.files?.[0] && handleTextFileUpload(e.target.files[0])}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Configurations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Source Language */}
          <div className="bg-[#0A0C10] border border-[#2D2F36] rounded p-3">
            <label className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-amber-500" />
              Source Language
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value as SourceLanguage)}
              className="w-full bg-[#16191E] border border-[#2D2F36] rounded px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
            >
              <option value="auto">Auto Detect Language</option>
              <option value="en">English (អង់គ្លេស)</option>
              <option value="zh">Chinese / 中文 (ចិន)</option>
              <option value="ko">Korean / 한국어 (កូរ៉េ)</option>
              <option value="th">Thai / ภาษาไทย (ថៃ)</option>
            </select>
          </div>

          {/* Recap Style */}
          <div className="bg-[#0A0C10] border border-[#2D2F36] rounded p-3">
            <label className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Recap Style (ស្ត្រាយសម្រាយ)
            </label>
            <select
              value={recapStyle}
              onChange={(e) => setRecapStyle(e.target.value as RecapStyle)}
              className="w-full bg-[#16191E] border border-[#2D2F36] rounded px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
            >
              <option value="dramatic_action">⚡ Dramatic Action & Suspense</option>
              <option value="emotional_romance">💖 Emotional Romance & Melodrama</option>
              <option value="dark_mystery">👻 Dark Mystery / Horror Thriller</option>
              <option value="fast_comedy">🔥 Fast-Paced Comedy & Fun</option>
              <option value="intense_thriller">🗡️ Intense Mind Games & Revenge</option>
            </select>
          </div>

          {/* Target Duration */}
          <div className="bg-[#0A0C10] border border-[#2D2F36] rounded p-3">
            <label className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Estimated Duration
            </label>
            <select
              value={targetDurationMin}
              onChange={(e) => setTargetDurationMin(Number(e.target.value))}
              className="w-full bg-[#16191E] border border-[#2D2F36] rounded px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
            >
              <option value={2}>~2 Minutes (Short Clip / Reel / TikTok)</option>
              <option value={3}>~3 Minutes (Standard Social Video)</option>
              <option value={5}>~5 Minutes (Full YouTube Movie Recap)</option>
              <option value={8}>~8-10 Minutes (Extended Cinema Deep Dive)</option>
            </select>
          </div>

        </div>

        {/* Custom Notes / Prompt tweaks */}
        <div>
          <label className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-widest mb-1 block">
            Custom Scriptwriting Instructions (Optional)
          </label>
          <input
            type="text"
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="e.g., Emphasize the villain's secret motive, use intense energetic narration, highlight main plot twist..."
            className="w-full bg-[#0A0C10] border border-[#2D2F36] rounded px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-2 flex items-center justify-between gap-4">
          <div className="text-xs text-gray-400 hidden sm:flex items-center gap-1.5 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Generates timestamped JSON schema & Khmer TTS script</span>
          </div>

          <button
            type="submit"
            disabled={isLoading || (inputMode === 'text' && !transcript.trim()) || (inputMode === 'video' && !mediaBase64 && !transcript.trim())}
            className={`w-full sm:w-auto px-6 py-2.5 rounded font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isLoading || (inputMode === 'text' && !transcript.trim()) || (inputMode === 'video' && !mediaBase64 && !transcript.trim())
                ? 'bg-[#2D2F36] text-gray-500 cursor-not-allowed border border-[#3D4049]'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20 active:scale-98'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Translating & Writing Khmer Script...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-black" />
                <span>Generate Khmer Recap Script (សម្រាយរឿង)</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

