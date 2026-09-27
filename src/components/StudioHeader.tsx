import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Share2, Download, Film, History, Ratio, 
  CheckCircle2, Loader2, Pencil, Check, Stamp, 
  Type, Eraser, Sparkles, ChevronDown, MoreHorizontal,
  Layers, AlertCircle, Zap, RefreshCw, Image, Menu, X
} from 'lucide-react';

interface StudioHeaderProps {
  movieTitle?: string;
  savedCount: number;
  onOpenSaved: () => void;
  aspectRatio: '16:9' | '9:16' | '1:1';
  onChangeAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  onExport: () => void;
  onInsertToSequence?: () => void;
  onRenameTitle?: (newTitle: string) => void;
  onOpenWatermark?: () => void;
  onOpenSubtitleModal?: () => void;
  onOpenWatermarkCleaner?: () => void;
  onOpenLipSync?: () => void;
  onOpenCompressor?: () => void;
  onOpenBgmModal?: () => void;
  onOpenUpdateModal?: () => void;
  onOpenThumbnailModal?: () => void;
  onToast?: (type: 'success' | 'warning' | 'error' | 'info', title: string, message?: string) => void;
  saveStatus?: 'saved' | 'saving' | 'error';
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  movieTitle = 'Khmer Movie Recap Studio',
  savedCount,
  onOpenSaved,
  aspectRatio,
  onChangeAspectRatio,
  onExport,
  onInsertToSequence,
  onRenameTitle,
  onOpenWatermark,
  onOpenSubtitleModal,
  onOpenWatermarkCleaner,
  onOpenLipSync,
  onOpenCompressor,
  onOpenBgmModal,
  onOpenUpdateModal,
  onOpenThumbnailModal,
  onToast,
  saveStatus = 'saved'
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(movieTitle);
  const [isAiToolsOpen, setIsAiToolsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const aiToolsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitleDraft(movieTitle);
  }, [movieTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // Click outside listener to close dropdowns cleanly
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (aiToolsRef.current && !aiToolsRef.current.contains(e.target as Node)) {
        setIsAiToolsOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCommitRename = () => {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== movieTitle && onRenameTitle) {
      onRenameTitle(trimmed);
    } else {
      setTitleDraft(movieTitle);
    }
  };

  const handleShare = () => {
    setIsMoreOpen(false);
    if (navigator.share) {
      navigator.share({ title: movieTitle, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      if (onToast) {
        onToast('success', 'បាន Copy Link ជោគជ័យ!', 'Link គម្រោងត្រូវបានចម្លងទៅ Clipboard រួចរាល់។');
      }
    }
  };

  return (
    <header className="h-12 bg-white border-b border-gray-200 text-gray-800 px-3 sm:px-4 flex items-center justify-between z-30 select-none shadow-2xs shrink-0 relative">
      
      {/* 1. Left Section: Logo, Breadcrumbs, Title & Compact Save Status */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        
        {/* Home Button */}
        <button 
          onClick={onOpenSaved}
          title="Home / Saved Projects"
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition flex items-center shrink-0 cursor-pointer"
        >
          <Home className="w-4 h-4 text-gray-700" />
        </button>

        <div className="h-4 w-[1px] bg-gray-200 shrink-0" />

        {/* Brand & Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 min-w-0">
          <div className="flex items-center gap-1 font-bold text-gray-900 shrink-0">
            <Film className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">BT-Dubber</span>
          </div>

          <span className="text-gray-300 shrink-0">/</span>

          {/* Editable Movie Title */}
          {isEditingTitle ? (
            <div className="flex items-center gap-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitRename();
                  if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                    setTitleDraft(movieTitle);
                  }
                }}
                onBlur={handleCommitRename}
                className="bg-white border border-blue-500 rounded-lg px-2 py-0.5 text-xs font-bold font-khmer text-gray-900 focus:outline-none shadow-xs w-36 sm:w-56 md:w-72"
                placeholder="បញ្ចូលឈ្មោះរឿង..."
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCommitRename();
                }}
                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="group flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg hover:bg-gray-100 border border-transparent hover:border-gray-200 transition text-left cursor-pointer max-w-[140px] sm:max-w-[200px] md:max-w-[260px] lg:max-w-[340px] min-w-0 truncate"
              title="ចុចដើម្បីប្តូរឈ្មោះរឿង"
            >
              <span className="text-gray-900 font-bold font-khmer truncate text-xs">
                {movieTitle}
              </span>
              <Pencil className="w-3 h-3 text-gray-400 group-hover:text-blue-600 transition shrink-0 opacity-0 group-hover:opacity-100" />
            </button>
          )}
        </div>

        {/* Compact Auto-Save Indicator */}
        <div className="hidden md:flex items-center shrink-0">
          {saveStatus === 'saving' ? (
            <span className="flex items-center gap-1 text-[10.5px] font-khmer text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Saving...</span>
            </span>
          ) : saveStatus === 'error' ? (
            <span className="flex items-center gap-1 text-[10.5px] font-khmer text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              <AlertCircle className="w-2.5 h-2.5" />
              <span>មិនទាន់ Save</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10.5px] font-khmer text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
              <span>Auto-Saved</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Center/Right Section: Clean, Organized Workspace Controls */}
      {/* 2. Center/Right Section: Clean, Organized Workspace Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        
        {/* Mobile Header Quick Actions (md:hidden) */}
        <div className="flex md:hidden items-center gap-1.5">
          {/* Quick Export Button */}
          <button
            onClick={onExport}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 active:scale-95 text-white text-xs font-khmer font-bold flex items-center gap-1 shadow-xs cursor-pointer shrink-0"
            title="Export Video"
          >
            <Download className="w-3.5 h-3.5 shrink-0 text-white" />
            <span>Export</span>
          </button>

          {/* Mobile All-in-One Menu Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-bold font-khmer flex items-center gap-1 cursor-pointer transition active:scale-95 shrink-0"
            title="បើកម៉ឺនុយ & ឧបករណ៍ទាំងអស់"
          >
            <Menu className="w-4 h-4 text-blue-600" />
            <span className="text-[11.5px]">ម៉ឺនុយ</span>
            {savedCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Desktop Header Controls (hidden on mobile, visible md+) */}
        <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
          {/* Quick Insert to Multi-Episode Timeline */}
          {onInsertToSequence && (
            <button
              onClick={onInsertToSequence}
              className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-khmer font-bold flex items-center gap-1 sm:gap-1.5 shadow-xs shadow-purple-500/25 transition active:scale-95 cursor-pointer shrink-0"
              title="បញ្ជូនវីដេអូ និងស្គ្រីបនេះទៅកាន់បន្ទប់កាត់តភាគ (Insert to Sequence Timeline)"
            >
              <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="hidden sm:inline">កាត់តភាគ</span>
            </button>
          )}

          {/* Quick Reels Cover / Thumbnail Creator Button */}
          {onOpenThumbnailModal && (
            <button
              onClick={onOpenThumbnailModal}
              className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-pink-600 via-rose-600 to-amber-500 hover:from-pink-500 hover:to-amber-400 text-white rounded-xl text-xs font-khmer font-bold flex items-center gap-1 sm:gap-1.5 shadow-xs shadow-pink-500/25 transition active:scale-95 cursor-pointer shrink-0"
              title="បង្កើតរូបភាព Thumbnail / Cover សម្រាប់ Facebook Reels ងាយស្រួលរកភាគ (Reels Cover Creator)"
            >
              <Image className="w-3.5 h-3.5 text-yellow-200 shrink-0" />
              <span className="hidden sm:inline">Cover Reels</span>
            </button>
          )}

          {/* Aspect Ratio Selector */}
          <div className="flex items-center bg-gray-100 border border-gray-200/80 rounded-xl px-2 py-1 text-xs font-medium text-gray-700 gap-1 shrink-0">
            <Ratio className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <select
              value={aspectRatio}
              onChange={(e) => onChangeAspectRatio(e.target.value as any)}
              className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer text-xs pr-1"
              title="ផ្លាស់ប្តូរទំហំ Video"
            >
              <option value="16:9">16:9 (Landscape)</option>
              <option value="9:16">9:16 (TikTok/Reels)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
          </div>

          {/* Consolidated AI Tools Dropdown Menu */}
          <div className="relative shrink-0" ref={aiToolsRef}>
            <button
              type="button"
              onClick={() => setIsAiToolsOpen(!isAiToolsOpen)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-khmer font-bold flex items-center gap-1.5 transition cursor-pointer border shadow-2xs ${
                isAiToolsOpen
                  ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-200'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
              }`}
              title="ឧបករណ៍ AI ជំនួយការកាត់ត (AI Studio Tools)"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="hidden md:inline">ឧបករណ៍ AI</span>
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isAiToolsOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* AI Tools Dropdown Box */}
            {isAiToolsOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 z-50 font-khmer text-xs animate-fadeIn space-y-0.5">
                
                {/* Tool 0: Facebook Reels Thumbnail Creator */}
                {onOpenThumbnailModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenThumbnailModal();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-rose-50 text-gray-700 hover:text-rose-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Image className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        <span>Cover & Thumbnail Reels</span>
                        <span className="text-[9px] bg-pink-100 text-pink-700 px-1 py-0.2 rounded font-bold">Safe-Zone</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-sans">ដាក់ភាគធំៗ, ស្ទីល Facebook 1:1</div>
                    </div>
                  </button>
                )}
                
                {/* Tool 1: Subtitle Karaoke */}
                {onOpenSubtitleModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenSubtitleModal();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-amber-50 text-gray-700 hover:text-amber-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Type className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">ស្ទីល Subtitle Karaoke</div>
                      <div className="text-[10px] text-gray-400 font-sans">Font ខ្មែរ, ពណ៌ & Effect</div>
                    </div>
                  </button>
                )}

                {/* Tool 2: Watermark Cleaner */}
                {onOpenWatermarkCleaner && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenWatermarkCleaner();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-teal-50 text-gray-700 hover:text-teal-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                      <Eraser className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">លុប Logo & Watermark</div>
                      <div className="text-[10px] text-gray-400 font-sans">Blur / Smart Delogo</div>
                    </div>
                  </button>
                )}

                {/* Tool 2.5: AI BGM Separator (Kaggle/Colab GPU) */}
                {onOpenBgmModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenBgmModal();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-emerald-50 text-gray-700 hover:text-emerald-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        <span>AI BGM Separator</span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold">GPU 10s</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-sans">Kaggle / Colab GPU Turbo</div>
                    </div>
                  </button>
                )}

                {/* Tool 3: Lip Sync */}
                {onOpenLipSync && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenLipSync();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-pink-50 text-gray-700 hover:text-pink-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center shrink-0 text-xs">
                      👄
                    </div>
                    <div>
                      <div className="font-bold">Wav2Lip AI Lip-Sync</div>
                      <div className="text-[10px] text-gray-400 font-sans">តម្រឹមមាត់តួអង្គ ១០០%</div>
                    </div>
                  </button>
                )}

                {/* Tool 4: Channel Watermark */}
                {onOpenWatermark && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenWatermark();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-purple-50 text-gray-700 hover:text-purple-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                      <Stamp className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">ដាក់ Watermark ឆានែល</div>
                      <div className="text-[10px] text-gray-400 font-sans">Logo / អក្សរឈ្មោះផេក</div>
                    </div>
                  </button>
                )}

                {/* Tool 5: Video Compressor */}
                {onOpenCompressor && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAiToolsOpen(false);
                      onOpenCompressor();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-left hover:bg-rose-50 text-gray-700 hover:text-rose-950 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>បង្រួមទំហំ Video</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-200/80 text-rose-800 font-bold font-sans">
                          Fast
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-sans">សន្សំទំហំ 70-85% លឿន</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Projects History Button */}
          <button
            onClick={onOpenSaved}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
            title="Saved Projects in SQLite Database"
          >
            <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden lg:inline font-khmer text-xs font-semibold">គម្រោង</span>
            {savedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                {savedCount}
              </span>
            )}
          </button>

          {/* Primary Export Button */}
          <button
            onClick={onExport}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-khmer font-bold flex items-center gap-1.5 shadow-xs shadow-blue-500/25 active:scale-95 transition cursor-pointer shrink-0"
            title="Export Video MP4, Subtitles & Audio Hub"
          >
            <Download className="w-3.5 h-3.5 shrink-0 text-white" />
            <span>Export</span>
          </button>

          {/* Version Control & Auto-Update Button */}
          <button
            onClick={onOpenUpdateModal}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
            title="Version Control & Auto-Update"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-800">
              {typeof window !== 'undefined' && window.electronAPI?.version ? `v${window.electronAPI.version}` : 'v1.2.2'}
            </span>
          </button>

          {/* More Actions Dropdown (...) */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className="p-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 transition cursor-pointer shadow-2xs"
              title="More Options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isMoreOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 z-50 font-khmer text-xs animate-fadeIn space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenUpdateModal?.();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl text-left hover:bg-indigo-50 text-indigo-700 flex items-center gap-2 transition cursor-pointer font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>🔄 ពិនិត្យមើល Version ថ្មី</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full px-2.5 py-1.5 rounded-xl text-left hover:bg-gray-100 text-gray-700 flex items-center gap-2 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>ចែករំលែក Link</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. Mobile All-in-One Slide-Up Action Sheet / Drawer (iOS style) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-fadeIn select-text">
          {/* Backdrop close area */}
          <div 
            className="flex-1 w-full"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Sheet Card */}
          <div className="bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto p-4 space-y-4 shadow-2xl border-t border-gray-200 animate-slideInRight pb-safe">
            
            {/* Drawer Top Handle & Title */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  ⚡
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 font-khmer text-sm">ម៉ឺនុយ & ឧបករណ៍កាត់ត</h3>
                  <p className="text-[11px] text-gray-400 font-khmer truncate max-w-[220px]">{movieTitle}</p>
                </div>
              </div>

              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition cursor-pointer"
                title="បិទ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. Aspect Ratio Selector (Large touch buttons) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-khmer">
                📐 ទំហំវីដេអូ (Aspect Ratio)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: '16:9', label: '16:9 ផ្តេក', desc: 'YouTube / TV' },
                  { id: '9:16', label: '9:16 បញ្ឈរ', desc: 'Reels / TikTok' },
                  { id: '1:1', label: '1:1 ការ៉េ', desc: 'FB Post' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onChangeAspectRatio(item.id as any);
                    }}
                    className={`p-2 rounded-xl text-center border font-khmer transition cursor-pointer ${
                      aspectRatio === item.id
                        ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-xs'
                        : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[9.5px] text-gray-400">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Creative AI & Editing Tools (Grid) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-khmer">
                ✨ ឧបករណ៍ AI & កាត់ត (AI Studio Tools)
              </label>
              <div className="grid grid-cols-2 gap-2">
                
                {/* Reels Cover Creator */}
                {onOpenThumbnailModal && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenThumbnailModal();
                    }}
                    className="p-2.5 rounded-xl border border-pink-200 bg-pink-50/50 hover:bg-pink-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-pink-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Image className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-pink-950 font-khmer">Cover Reels</div>
                      <div className="text-[9.5px] text-pink-700 truncate">AI Master Cover</div>
                    </div>
                  </button>
                )}

                {/* Insert to Sequence Timeline */}
                {onInsertToSequence && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onInsertToSequence();
                    }}
                    className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-purple-950 font-khmer">កាត់តភាគ</div>
                      <div className="text-[9.5px] text-purple-700 truncate">Sequence Timeline</div>
                    </div>
                  </button>
                )}

                {/* Subtitle Karaoke */}
                {onOpenSubtitleModal && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenSubtitleModal();
                    }}
                    className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Type className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-950 font-khmer">Subtitle Karaoke</div>
                      <div className="text-[9.5px] text-amber-700 truncate">Font ខ្មែរ & Effects</div>
                    </div>
                  </button>
                )}

                {/* Channel Watermark */}
                {onOpenWatermark && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenWatermark();
                    }}
                    className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Stamp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-indigo-950 font-khmer">Watermark ឆានែល</div>
                      <div className="text-[9.5px] text-indigo-700 truncate">Logo / ឈ្មោះផេក</div>
                    </div>
                  </button>
                )}

                {/* Wav2Lip AI Lip Sync */}
                {onOpenLipSync && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenLipSync();
                    }}
                    className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs text-xs">
                      👄
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-rose-950 font-khmer">AI Lip-Sync</div>
                      <div className="text-[9.5px] text-rose-700 truncate">តម្រឹមមាត់តួអង្គ</div>
                    </div>
                  </button>
                )}

                {/* Watermark Cleaner */}
                {onOpenWatermarkCleaner && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenWatermarkCleaner();
                    }}
                    className="p-2.5 rounded-xl border border-teal-200 bg-teal-50/50 hover:bg-teal-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Eraser className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-teal-950 font-khmer">លុប Watermark</div>
                      <div className="text-[9.5px] text-teal-700 truncate">Smart Delogo</div>
                    </div>
                  </button>
                )}

                {/* AI BGM Separator */}
                {onOpenBgmModal && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenBgmModal();
                    }}
                    className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-emerald-950 font-khmer">AI BGM Separator</div>
                      <div className="text-[9.5px] text-emerald-700 truncate">GPU Vocal Remover</div>
                    </div>
                  </button>
                )}

                {/* Video Compressor */}
                {onOpenCompressor && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenCompressor();
                    }}
                    className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-left transition flex items-start gap-2 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-blue-950 font-khmer">បង្រួម Video</div>
                      <div className="text-[9.5px] text-blue-700 truncate">សន្សំទំហំ 80%</div>
                    </div>
                  </button>
                )}

              </div>
            </div>

            {/* 3. Projects, Updates & Links */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-khmer">
                📁 គម្រោង & ប្រព័ន្ធ
              </label>
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenSaved();
                  }}
                  className="w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-xs font-khmer font-bold text-gray-800 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-600" />
                    <span>គម្រោងដែលបាន Save</span>
                  </div>
                  {savedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                      {savedCount} គម្រោង
                    </span>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenUpdateModal?.();
                    }}
                    className="p-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center gap-2 text-xs font-khmer font-semibold text-gray-700 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ពិនិត្យមើល Version</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="p-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center gap-2 text-xs font-khmer font-semibold text-gray-700 transition cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>ចែករំលែក Link</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4. Full-width Primary Export Button */}
            <div className="pt-2">
              <button
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onExport();
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-khmer font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 active:scale-98 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Export Video MP4 & Files</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </header>
  );
};
