import React from 'react';
import { Home, Menu, Share2, Download, Film, History, Sparkles, Ratio, Upload } from 'lucide-react';

interface StudioHeaderProps {
  movieTitle?: string;
  savedCount: number;
  onOpenSaved: () => void;
  aspectRatio: '16:9' | '9:16' | '1:1';
  onChangeAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  onExport: () => void;
  onOpenUploadModal?: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  movieTitle = 'Khmer Movie Recap Studio',
  savedCount,
  onOpenSaved,
  aspectRatio,
  onChangeAspectRatio,
  onExport,
  onOpenUploadModal
}) => {
  return (
    <header className="h-12 bg-white border-b border-gray-200 text-gray-800 px-3 flex items-center justify-between z-30 select-none shadow-xs">
      
      {/* Left: Home, Menu & Breadcrumbs */}
      <div className="flex items-center gap-2.5">
        <button 
          onClick={onOpenSaved}
          title="Home / Saved Projects"
          className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition flex items-center gap-1 text-xs font-medium"
        >
          <Home className="w-4 h-4 text-gray-700" />
        </button>
        <button 
          onClick={onOpenSaved}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition"
          title="Project Menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-0.5" />

        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <span className="text-gray-900 font-semibold flex items-center gap-1">
            <Film className="w-3.5 h-3.5 text-blue-600" />
            <span>Dubber Studio</span>
          </span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-800 font-semibold truncate max-w-[200px] sm:max-w-xs">
            {movieTitle}
          </span>
        </div>
      </div>

      {/* Right: Upload Video, Aspect Ratio, Saved Projects, Share, Publish */}
      <div className="flex items-center gap-2">
        {/* Prominent Upload Video Button */}
        {onOpenUploadModal && (
          <button
            onClick={onOpenUploadModal}
            className="px-3 py-1 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-khmer font-bold text-xs transition flex items-center gap-1.5 shadow-2xs active:scale-95"
            title="Upload / Import New Video File"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>Upload វីដេអូ</span>
          </button>
        )}

        {/* Aspect Ratio Selector */}
        <div className="flex items-center bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs font-medium text-gray-700 gap-1.5">
          <Ratio className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-500 hidden sm:inline">Ratio:</span>
          <select
            value={aspectRatio}
            onChange={(e) => onChangeAspectRatio(e.target.value as any)}
            className="bg-transparent font-bold text-gray-900 focus:outline-none cursor-pointer"
          >
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (TikTok/Reels)</option>
            <option value="1:1">1:1 (Square)</option>
          </select>
        </div>

        {/* Saved Projects History Button */}
        <button
          onClick={onOpenSaved}
          className="px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-medium text-gray-700 transition flex items-center gap-1.5"
        >
          <History className="w-3.5 h-3.5 text-amber-600" />
          <span className="hidden sm:inline">Projects</span>
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
              alert('Link copied to clipboard!');
            }
          }}
          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-medium text-gray-700 transition flex items-center gap-1.5"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Share</span>
        </button>

        {/* Publish / Export Button */}
        <button
          onClick={onExport}
          className="px-3.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 active:scale-98"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Publish</span>
        </button>
      </div>

    </header>
  );
};
