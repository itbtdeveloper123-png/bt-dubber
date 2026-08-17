import React from 'react';
import { Home, Menu, Share2, Download, Film, History, Sparkles, Ratio, Upload, Key } from 'lucide-react';

interface StudioHeaderProps {
  movieTitle?: string;
  savedCount: number;
  onOpenSaved: () => void;
  aspectRatio: '16:9' | '9:16' | '1:1';
  onChangeAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  onExport: () => void;
  onOpenUploadModal?: () => void;
  onOpenApiKeyModal?: () => void;
  hasCustomApiKey?: boolean;
  onOpenTikTokModal?: () => void;
  onToast?: (type: 'success' | 'warning' | 'error' | 'info', title: string, message?: string) => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  movieTitle = 'Khmer Movie Recap Studio',
  savedCount,
  onOpenSaved,
  aspectRatio,
  onChangeAspectRatio,
  onExport,
  onOpenUploadModal,
  onOpenApiKeyModal,
  hasCustomApiKey = false,
  onOpenTikTokModal,
  onToast
}) => {
  return (
    <header className="h-11 sm:h-12 bg-white border-b border-gray-200 text-gray-800 px-2 sm:px-3 flex items-center justify-between z-30 select-none shadow-xs shrink-0">
      
      {/* Left: Home, Menu & Breadcrumbs */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        <button 
          onClick={onOpenSaved}
          title="Home / Saved Projects"
          className="p-1 sm:p-1.5 hover:bg-gray-100 rounded text-gray-600 transition flex items-center gap-1 text-xs font-medium shrink-0"
        >
          <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-700" />
        </button>
        <button 
          onClick={onOpenSaved}
          className="p-1 sm:p-1.5 hover:bg-gray-100 rounded text-gray-600 transition shrink-0"
          title="Project Menu"
        >
          <Menu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <div className="h-3.5 sm:h-4 w-[1px] bg-gray-300 mx-0.5 shrink-0" />

        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-xs font-medium text-gray-600 min-w-0">
          <span className="text-gray-900 font-semibold flex items-center gap-1 shrink-0">
            <Film className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Dubber Studio</span>
          </span>
          <span className="text-gray-400 shrink-0">/</span>
          <span className="text-gray-800 font-semibold truncate max-w-[100px] sm:max-w-[160px] md:max-w-[220px] lg:max-w-[280px] xl:max-w-[380px]">
            {movieTitle}
          </span>
        </div>
      </div>

      {/* Right: Upload Video, Aspect Ratio, Saved Projects, API Key, Share, Publish */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* API Key Settings Button */}
        {onOpenApiKeyModal && (
          <button
            onClick={onOpenApiKeyModal}
            className={`px-2 sm:px-2.5 py-1 rounded text-xs font-khmer font-bold transition flex items-center gap-1 sm:gap-1.5 shrink-0 border cursor-pointer ${
              hasCustomApiKey
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-2xs animate-pulse'
            }`}
            title="កំណត់ Gemini API Key ដោយផ្ទាល់"
          >
            <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden md:inline">{hasCustomApiKey ? 'API Key ភ្ជាប់រួច' : '🔑 ដាក់ API Key'}</span>
            <span className="md:hidden">Key</span>
          </button>
        )}

        {/* Prominent Upload Video Button */}
        {onOpenUploadModal && (
          <button
            onClick={onOpenUploadModal}
            className="px-2 sm:px-3 py-1 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-khmer font-bold text-xs transition flex items-center gap-1 sm:gap-1.5 shadow-2xs active:scale-95 shrink-0 cursor-pointer"
            title="Upload / Import New Video File"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="hidden sm:inline">Upload វីដេអូ</span>
            <span className="sm:hidden">Upload</span>
          </button>
        )}

        {/* TikTok Drama Episodes Importer Button */}
        {onOpenTikTokModal && (
          <button
            onClick={onOpenTikTokModal}
            className="px-2 sm:px-3 py-1 rounded bg-gradient-to-r from-pink-500/10 to-rose-500/10 hover:from-pink-500/20 hover:to-rose-500/20 border border-pink-300 text-pink-700 font-khmer font-bold text-xs transition flex items-center gap-1 sm:gap-1.5 shadow-2xs active:scale-95 shrink-0 cursor-pointer"
            title="ទាញយករឿងភាគពី TikTok / Douyin តាម Link"
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-600 shrink-0" />
            <span className="hidden sm:inline">📥 ទាញយក TikTok</span>
            <span className="sm:hidden">TikTok</span>
          </button>
        )}

        {/* Aspect Ratio Selector */}
        <div className="flex items-center bg-gray-100 border border-gray-200 rounded px-1.5 sm:px-2 py-1 text-xs font-medium text-gray-700 gap-1 sm:gap-1.5 shrink-0">
          <Ratio className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <span className="text-gray-500 hidden xl:inline">Ratio:</span>
          <select
            value={aspectRatio}
            onChange={(e) => onChangeAspectRatio(e.target.value as any)}
            className="bg-transparent font-bold text-gray-900 focus:outline-none cursor-pointer text-[11px] sm:text-xs"
          >
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (TikTok/Reels)</option>
            <option value="1:1">1:1 (Square)</option>
          </select>
        </div>

        {/* Saved Projects History Button */}
        <button
          onClick={onOpenSaved}
          className="px-2 sm:px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-medium text-gray-700 transition flex items-center gap-1 sm:gap-1.5 shrink-0 cursor-pointer"
          title="Saved Projects History"
        >
          <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="hidden md:inline">Projects</span>
          {savedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-bold">
              {savedCount}
            </span>
          )}
        </button>

        {/* Share Button */}
        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: movieTitle, url: window.location.href }).catch(() => {});
            } else {
              navigator.clipboard.writeText(window.location.href);
              if (onToast) {
                onToast('success', 'បាន Copy Link ជោគជ័យ!', 'Link គម្រោងត្រូវបានចម្លងទៅ Clipboard រួចរាល់។');
              }
            }
          }}
          className="px-2 sm:px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-medium text-gray-700 transition flex items-center gap-1 sm:gap-1.5 shrink-0 cursor-pointer"
          title="Share Project Link"
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">Share</span>
        </button>

        {/* Publish / Export Button */}
        <button
          onClick={onExport}
          className="px-2.5 sm:px-3.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1 sm:gap-1.5 active:scale-98 shrink-0"
          title="Publish / Export Project"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Publish</span>
        </button>
      </div>

    </header>
  );
};
