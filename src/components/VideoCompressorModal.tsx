import React, { useState, useRef } from 'react';
import { 
  X, Zap, Sparkles, Download, CheckCircle2, AlertCircle, 
  Loader2, ArrowRight, Play, RefreshCw, FileVideo, HardDrive, 
  Film, ShieldCheck, Gauge, Check, Smartphone, Monitor, Video
} from 'lucide-react';
import { MovieRecapResult } from '../types';

interface VideoCompressorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRecap?: MovieRecapResult;
  onApplyCompressedVideo?: (videoUrl: string, videoFileName: string) => void;
  onToast?: (type: 'success' | 'warning' | 'error' | 'info', title: string, message?: string) => void;
}

type CompressMode = 'smart_hd' | 'tiktok_fast' | 'mobile_light' | 'max_clarity';

interface CompressionResult {
  url: string;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  savedPercent: string;
  mode: string;
}

export const VideoCompressorModal: React.FC<VideoCompressorModalProps> = ({
  isOpen,
  onClose,
  currentRecap,
  onApplyCompressedVideo,
  onToast
}) => {
  const [selectedSource, setSelectedSource] = useState<'current' | 'upload'>('current');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [compressMode, setCompressMode] = useState<CompressMode>('smart_hd');
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const formatMB = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/i.test(file.name)) {
        setUploadedFile(file);
        setSelectedSource('upload');
        setResult(null);
      } else {
        if (onToast) onToast('warning', 'សូមជ្រើសរើស File វីដេអូ!', 'អនុញ្ញាតតែ File MP4, MOV, MKV, WEBM ប៉ុណ្ណោះ');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setSelectedSource('upload');
      setResult(null);
    }
  };

  const handleStartCompress = async () => {
    try {
      setIsCompressing(true);
      setProgress(10);
      setStatusMessage('⚡ កំពុងរៀបចំ Video Engine និងវិភាគ Bitrate...');
      setResult(null);

      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed++;
        setProgress((prev) => {
          if (prev < 40) {
            setStatusMessage(`⚡ កំពុងដំណើរការ Fast Transcoding (${elapsed}s)...`);
            return prev + 6;
          }
          if (prev < 80) {
            setStatusMessage(`⚡ កំពុងបង្រួមទំហំ និងរក្សាគុណភាព HD (${elapsed}s)...`);
            return prev + 4;
          }
          if (prev < 95) {
            setStatusMessage(`⚡ កំពុង Finalize Optimized MP4 (${elapsed}s)...`);
            return Math.min(95, prev + 1);
          }
          return prev;
        });
      }, 1000);

      let payload: any = { mode: compressMode };

      if (selectedSource === 'current' && currentRecap) {
        payload.videoUrl = currentRecap.videoUrl;
        payload.videoFileName = currentRecap.videoFileName;
      } else if (uploadedFile) {
        // If file is selected from client, upload it first
        setStatusMessage('⚡ កំពុង Upload វីដេអូទៅកាន់ Engine...');
        const formData = new FormData();
        formData.append('video', uploadedFile);
        formData.append('title', uploadedFile.name);

        const upRes = await fetch('/api/upload-media', {
          method: 'POST',
          body: formData
        });

        if (!upRes.ok) {
          throw new Error('ការ Upload វីដេអូទៅកាន់ Server បរាជ័យ');
        }

        const upData = await upRes.json();
        payload.videoUrl = upData.url;
        payload.videoFileName = upData.fileName;
      } else {
        throw new Error('សូមជ្រើសរើសវីដេអូដើម្បីធ្វើការបង្រួម (Compress)!');
      }

      setStatusMessage('⚡ កំពុងបង្រួមទំហំវីដេអូដោយប្រើ FFmpeg VeryFast Engine...');

      const res = await fetch('/api/video/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      clearInterval(timer);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || 'ការបង្រួមទំហំវីដេអូបរាជ័យ');
      }

      const data: CompressionResult = await res.json();
      setProgress(100);
      setStatusMessage(`🎉 បង្រួមទំហំជោគជ័យ! សន្សំបាន ${data.savedPercent}`);
      setResult(data);
      setIsCompressing(false);

      if (onToast) {
        onToast('success', 'បង្រួមទំហំវីដេអូជោគជ័យ!', `សន្សំទំហំបាន ${data.savedPercent} (${formatMB(data.originalSize)} ➔ ${formatMB(data.compressedSize)})`);
      }
    } catch (err: any) {
      setIsCompressing(false);
      setProgress(0);
      setStatusMessage('');
      if (onToast) {
        onToast('error', 'ការបង្រួមទំហំមានបញ្ហា', err.message);
      }
    }
  };

  const handleApplyToStudio = () => {
    if (result && onApplyCompressedVideo) {
      onApplyCompressedVideo(result.url, result.fileName);
      if (onToast) {
        onToast('success', 'បានដាក់ចូល Studio រួចរាល់!', 'វីដេអូដែលបានបង្រួមរួច ត្រូវបានដាក់ជាវីដេអូមេក្នុងគម្រោង។');
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-khmer text-white flex items-center gap-2">
                1-Click Video Compressor Studio
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-sans">
                  Ultra Fast
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-khmer">
                បង្រួមទំហំ Video ឱ្យស្រាល (70-85%) ដើម្បីដំណើរការ AI Dubbing, Timeline & Upload លឿន
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-200 text-xs sm:text-sm font-khmer">
          
          {/* Step 1: Select Video Source */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Film className="w-4 h-4 text-amber-400" />
              ១. ជ្រើសរើសវីដេអូដែលត្រូវបង្រួម (Video Source)
            </label>

            <div className="grid grid-cols-2 gap-2">
              {/* Option A: Current Studio Video */}
              <button
                type="button"
                onClick={() => { setSelectedSource('current'); setResult(null); }}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  selectedSource === 'current'
                    ? 'bg-amber-500/10 border-amber-500/60 ring-2 ring-amber-500/20'
                    : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-400'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${selectedSource === 'current' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white text-xs truncate">
                    វីដេអូក្នុង Studio បច្ចុប្បន្ន
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {currentRecap?.videoFileName || currentRecap?.movie_title || 'គ្មានវីដេអូ'}
                  </div>
                </div>
              </button>

              {/* Option B: Upload New File */}
              <button
                type="button"
                onClick={() => { setSelectedSource('upload'); setResult(null); }}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  selectedSource === 'upload'
                    ? 'bg-blue-500/10 border-blue-500/60 ring-2 ring-blue-500/20'
                    : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-400'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${selectedSource === 'upload' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-400'}`}>
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white text-xs truncate">
                    Upload File ពីកុំព្យូទ័រ
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {uploadedFile ? `${uploadedFile.name} (${formatMB(uploadedFile.size)})` : 'ជ្រើសរើស File MP4/MOV'}
                  </div>
                </div>
              </button>
            </div>

            {/* Drag & Drop Area if Upload mode selected */}
            {selectedSource === 'upload' && (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center transition cursor-pointer ${
                  dragActive
                    ? 'border-blue-400 bg-blue-500/10'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-800/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,.mp4,.mov,.mkv,.webm"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-1.5 text-xs text-slate-400">
                  <FileVideo className="w-8 h-8 text-blue-400 animate-bounce" />
                  <span className="font-bold text-slate-200">
                    {uploadedFile ? uploadedFile.name : 'ចុចទីនេះ ឬទម្លាក់ File វីដេអូចូល (Drag & Drop)'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {uploadedFile ? `ទំហំ: ${formatMB(uploadedFile.size)}` : 'គាំទ្រ MP4, MKV, MOV, WEBM (ទំហំរហូតដល់ 4GB)'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Compression Profiles */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-purple-400" />
              ២. ជ្រើសរើសកម្រិតបង្រួម (Compression Profile)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* Profile 1: Smart HD 1080p */}
              <div
                onClick={() => setCompressMode('smart_hd')}
                className={`p-3 rounded-2xl border transition cursor-pointer relative ${
                  compressMode === 'smart_hd'
                    ? 'bg-gradient-to-r from-amber-500/15 to-rose-500/15 border-amber-500/60 ring-2 ring-amber-500/20'
                    : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    🚀 Smart HD (1080p Light)
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold">
                    សន្សំ ~70%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  រក្សាកម្រិតច្បាស់ 1080p Full HD ប៉ុន្តែបញ្ចុះ Bitrate ឱ្យស្រាល។ ស័ក្តិសមសម្រាប់ YouTube/Recap។
                </p>
              </div>

              {/* Profile 2: TikTok / Reels Fast 720p */}
              <div
                onClick={() => setCompressMode('tiktok_fast')}
                className={`p-3 rounded-2xl border transition cursor-pointer relative ${
                  compressMode === 'tiktok_fast'
                    ? 'bg-gradient-to-r from-purple-500/15 to-pink-500/15 border-purple-500/60 ring-2 ring-purple-500/20'
                    : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    ⚡ TikTok / Reels Fast (720p)
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold">
                    សន្សំ ~85%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  បម្លែងជា 720p Ultra Fast, ល្បឿន Render លឿនដូចផ្លេកបន្ទោរ ស័ក្តិសមសម្រាប់ TikTok & Shorts។
                </p>
              </div>

              {/* Profile 3: Mobile & Telegram Light */}
              <div
                onClick={() => setCompressMode('mobile_light')}
                className={`p-3 rounded-2xl border transition cursor-pointer relative ${
                  compressMode === 'mobile_light'
                    ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border-emerald-500/60 ring-2 ring-emerald-500/20'
                    : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    📱 Mobile / Telegram Light
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold">
                    សន្សំ ~90%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  បង្រួមឱ្យនៅក្រោម 25MB ងាយស្រួលផ្ញើតាម Telegram ឬមើលលើទូរស័ព្ទដៃ។
                </p>
              </div>

              {/* Profile 4: Maximum Clarity */}
              <div
                onClick={() => setCompressMode('max_clarity')}
                className={`p-3 rounded-2xl border transition cursor-pointer relative ${
                  compressMode === 'max_clarity'
                    ? 'bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border-blue-500/60 ring-2 ring-blue-500/20'
                    : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    💎 Maximum Clarity (Crisp HD)
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold">
                    សន្សំ ~45%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  រក្សាគុណភាពកម្រិតខ្ពស់បំផុតដោយគ្មានការបាត់បង់ Detail។
                </p>
              </div>

            </div>
          </div>

          {/* Progress / Status Area */}
          {isCompressing && (
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  {statusMessage}
                </span>
                <span className="text-amber-400">{progress}%</span>
              </div>
              <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Compression Result Comparison Card */}
          {result && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/40 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  បង្រួមទំហំជោគជ័យ ១០០%!
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30">
                  🎉 សន្សំបាន {result.savedPercent}
                </span>
              </div>

              {/* Before vs After Stats */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-sans uppercase">ទំហំដើម (Before)</div>
                  <div className="text-sm font-bold text-rose-400 mt-0.5">{formatMB(result.originalSize)}</div>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-sans uppercase">ទំហំថ្មី (After)</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{formatMB(result.compressedSize)}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                {onApplyCompressedVideo && (
                  <button
                    type="button"
                    onClick={handleApplyToStudio}
                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold font-khmer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    ប្រើប្រាស់ក្នុង Studio ឥឡូវនេះ (Use in Studio)
                  </button>
                )}

                <a
                  href={result.url}
                  download={result.fileName}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold font-khmer flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  ទាញយក MP4
                </a>
              </div>
            </div>
          )}

        </div>

        {/* Footer Controls */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>ដំណើរការលើ Local GPU/CPU មិនបាត់បង់ទិន្នន័យ</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-khmer transition cursor-pointer"
            >
              បិទ
            </button>

            <button
              type="button"
              disabled={isCompressing || (selectedSource === 'current' && !currentRecap?.videoUrl && !currentRecap?.videoFileName) || (selectedSource === 'upload' && !uploadedFile)}
              onClick={handleStartCompress}
              className={`px-5 py-2 rounded-xl text-xs font-bold font-khmer flex items-center gap-2 shadow-lg transition active:scale-95 cursor-pointer ${
                isCompressing || (selectedSource === 'current' && !currentRecap?.videoUrl && !currentRecap?.videoFileName) || (selectedSource === 'upload' && !uploadedFile)
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white shadow-amber-500/25'
              }`}
            >
              {isCompressing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>កំពុងបង្រួម...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>ចាប់ផ្តើមបង្រួម (Compress Now)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
