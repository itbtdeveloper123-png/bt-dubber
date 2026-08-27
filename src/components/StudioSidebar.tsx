import React, { useState } from 'react';
import {
  Mic, Scissors, Upload, Sparkles, Key, History, Film,
  Plus, CheckCircle2, Clock, ChevronRight, Database, X, Play, Radio, Layers
} from 'lucide-react';
import { MovieRecapResult } from '../types';

interface StudioSidebarProps {
  activeMode: 'dubbing' | 'sequence' | 'cutter';
  onSwitchMode: (mode: 'dubbing' | 'sequence' | 'cutter') => void;
  onOpenUpload: () => void;
  onOpenTikTokModal?: () => void;
  onOpenApiKeyModal?: () => void;
  onOpenVoiceCloningModal?: () => void;
  hasCustomApiKey?: boolean;
  onInsertToSequence?: () => void;
  onInsertFolderToSequence?: (folderName: string, items: MovieRecapResult[]) => void;
  savedRecaps: MovieRecapResult[];
  currentRecap?: MovieRecapResult | null;
  onSelectRecap: (recap: MovieRecapResult) => void;
  onOpenSavedModal: () => void;
}

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  activeMode,
  onSwitchMode,
  onOpenUpload,
  onOpenTikTokModal,
  onOpenApiKeyModal,
  onOpenVoiceCloningModal,
  hasCustomApiKey = false,
  onInsertToSequence,
  onInsertFolderToSequence,
  savedRecaps = [],
  currentRecap,
  onSelectRecap,
  onOpenSavedModal
}) => {
  const [showRecentDrawer, setShowRecentDrawer] = useState(false);

  return (
    <>
      {/* Backdrop overlay for closing drawer cleanly */}
      {showRecentDrawer && (
        <div
          className="fixed inset-0 bg-black/40 z-30 transition-opacity backdrop-blur-2xs"
          onClick={() => setShowRecentDrawer(false)}
        />
      )}

      {/* Main Left Sidebar Dock */}
      <aside className="relative w-14 sm:w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-2.5 justify-between text-slate-400 z-35 shrink-0 select-none shadow-xl">

        {/* Top: Brand Icon & Navigation Modes */}
        <div className="flex flex-col items-center gap-2 w-full px-1.5">

          {/* Logo / Brand */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 mb-0.5 shrink-0">
            <Film className="w-4 h-4" />
          </div>

          {/* Mode 1: Dubbing Studio */}
          <button
            onClick={() => onSwitchMode('dubbing')}
            className={`w-full py-2 rounded-xl flex flex-col items-center justify-center transition cursor-pointer group relative ${activeMode === 'dubbing'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            title="🎙️ Dubbing Studio (បកប្រែសំឡេង & Script)"
          >
            <Mic className="w-4 h-4" />
            <span className="text-[9px] font-bold mt-1 font-khmer">បកប្រែ</span>
            {activeMode === 'dubbing' && (
              <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-3 bg-blue-400 rounded-l-full shadow-sm" />
            )}
          </button>

          {/* Mode 2: Video Cutter & Episode Splitter */}
          <button
            onClick={() => onSwitchMode('cutter')}
            className={`w-full py-2 rounded-xl flex flex-col items-center justify-center transition cursor-pointer group relative ${activeMode === 'cutter'
                ? 'bg-gradient-to-tr from-rose-600 to-amber-600 text-white shadow-lg shadow-rose-600/30'
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            title="✂️ Video Cutter & Auto Episode Splitter (កាត់យកមួយដុំ, បំបែកភាគ & Render Folder)"
          >
            <Scissors className="w-4 h-4" />
            <span className="text-[8.5px] font-bold mt-1 font-khmer">កាត់&ចែកភាគ</span>
            {activeMode === 'cutter' && (
              <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-3 bg-rose-400 rounded-l-full shadow-sm" />
            )}
          </button>

          {/* Mode 3: CapCut Timeline (Episode Assembler) */}
          <button
            onClick={() => onSwitchMode('sequence')}
            className={`w-full py-2 rounded-xl flex flex-col items-center justify-center transition cursor-pointer group relative ${activeMode === 'sequence'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            title="🎬 CapCut Timeline (បន្ទប់កាត់ត & តម្រៀបភាគ)"
          >
            <Layers className="w-4 h-4" />
            <span className="text-[9px] font-bold mt-1 font-khmer">កាត់តភាគ</span>
            {activeMode === 'sequence' && (
              <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-3 bg-indigo-400 rounded-l-full shadow-sm" />
            )}
          </button>

          {/* Quick Action: Insert to Timeline */}
          {onInsertToSequence && (
            <button
              onClick={onInsertToSequence}
              className="w-full py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900 border border-purple-800/60 text-purple-300 hover:text-white flex flex-col items-center justify-center transition shadow-2xs cursor-pointer active:scale-95"
              title="➕ ដាក់វីដេអូនេះចូល Timeline កាត់ត"
            >
              <Plus className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[8px] font-bold mt-0.5 font-khmer">+Timeline</span>
            </button>
          )}

          <div className="w-8 h-[1px] bg-slate-800 my-0.5" />

          {/* Recent Translated Videos Drawer Toggle */}
          <button
            onClick={() => setShowRecentDrawer(!showRecentDrawer)}
            className={`w-full py-2 rounded-xl flex flex-col items-center justify-center transition cursor-pointer relative ${showRecentDrawer
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'hover:bg-slate-800 text-slate-400 hover:text-amber-300'
              }`}
            title="🕒 វីដេអូបកប្រែថ្មីៗ (Recent SQLite Recaps)"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span className="text-[9px] font-bold mt-1 font-khmer">ថ្មីៗ</span>
            {savedRecaps.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs">
                {savedRecaps.length > 9 ? '9+' : savedRecaps.length}
              </span>
            )}
          </button>

          {/* Upload Video Button */}
          <button
            onClick={onOpenUpload}
            className="w-full py-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-blue-400 flex flex-col items-center justify-center transition cursor-pointer"
            title="Upload វីដេអូ (Upload Local Video File)"
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span className="text-[9px] font-bold mt-1 font-khmer">Upload</span>
          </button>

          {/* AI Voice Cloning Button */}
          {onOpenVoiceCloningModal && (
            <button
              onClick={onOpenVoiceCloningModal}
              className="w-full py-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-purple-400 flex flex-col items-center justify-center transition cursor-pointer group"
              title="🎙️ AI Voice Cloning (ក្លូនសំឡេងផ្ទាល់ខ្លួន)"
            >
              <Radio className="w-4 h-4 text-purple-400 group-hover:scale-110 transition" />
              <span className="text-[8px] font-bold mt-1 font-khmer">Voice</span>
            </button>
          )}

          {/* TikTok Importer Button */}
          {onOpenTikTokModal && (
            <button
              onClick={onOpenTikTokModal}
              className="w-full py-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-pink-400 flex flex-col items-center justify-center transition cursor-pointer"
              title="📥 ទាញយក TikTok Drama"
            >
              <Sparkles className="w-4 h-4 text-pink-400" />
              <span className="text-[9px] font-bold mt-1 font-khmer">TikTok</span>
            </button>
          )}

        </div>

        {/* Bottom: SQLite Status & API Key */}
        <div className="w-full px-1.5 flex flex-col items-center gap-2">

          {/* SQLite DB Status */}
          <div
            onClick={onOpenSavedModal}
            className="w-full py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-slate-500 hover:text-emerald-400 transition cursor-pointer"
            title="ទិន្នន័យត្រូវបានរក្សាទុកក្នុង SQLite Database"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[8px] font-mono text-emerald-400 font-bold mt-0.5">DB</span>
          </div>

          {/* API Key Modal Button */}
          {onOpenApiKeyModal && (
            <button
              onClick={onOpenApiKeyModal}
              title="កំណត់ Gemini API Key (API Key Settings)"
              className={`w-full py-2 rounded-xl flex flex-col items-center justify-center transition cursor-pointer ${hasCustomApiKey
                  ? 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/60'
                  : 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-400 border border-amber-800/60 animate-pulse'
                }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span className="text-[8px] font-bold mt-0.5 font-khmer">API Key</span>
            </button>
          )}
        </div>

        {/* Slide-out Recent Recaps Drawer (Bounded below header, never overlaps StudioHeader) */}
        {showRecentDrawer && (
          <div className="absolute top-0 bottom-0 left-full w-80 bg-slate-900/98 backdrop-blur-xl border-r border-slate-800 shadow-2xl z-40 flex flex-col animate-slideRight font-sans select-none">

            {/* Drawer Header */}
            <div className="p-3.5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <History className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white font-khmer">វីដេអូបកប្រែថ្មីៗ (SQLite DB)</h4>
                  <p className="text-[10px] text-slate-400 font-khmer">ចុចដើម្បីបើក Script & សំឡេងភ្លាមៗ</p>
                </div>
              </div>

              <button
                onClick={() => setShowRecentDrawer(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Recent Recaps List Grouped by Folders */}
            <div className="p-2.5 overflow-y-auto flex-1 space-y-2.5 custom-scrollbar">
              {savedRecaps.length > 0 ? (
                (() => {
                  // Group items by folder
                  const groups: { name: string; color: string; items: MovieRecapResult[] }[] = [];
                  const uncategorized: MovieRecapResult[] = [];

                  savedRecaps.forEach((recap) => {
                    const fName = recap.folderName || recap.seriesTitle;
                    if (fName) {
                      let g = groups.find((x) => x.name.toLowerCase() === fName.toLowerCase());
                      if (!g) {
                        g = { name: fName, color: '#3B82F6', items: [] };
                        groups.push(g);
                      }
                      g.items.push(recap);
                    } else {
                      uncategorized.push(recap);
                    }
                  });

                  return (
                    <>
                      {/* Folders with multiple episodes */}
                      {groups.map((group) => (
                        <div
                          key={group.name}
                          className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-xs"
                        >
                          <div className="p-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                              <h5 className="text-[11px] font-bold text-slate-200 font-khmer truncate">
                                📁 {group.name}
                              </h5>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="bg-slate-800 text-slate-300 text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold">
                                {group.items.length} ភាគ
                              </span>

                              {onInsertFolderToSequence && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onInsertFolderToSequence(group.name, group.items);
                                    setShowRecentDrawer(false);
                                  }}
                                  className="px-1.5 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-[9px] font-khmer font-bold flex items-center gap-1 transition cursor-pointer"
                                  title="បញ្ជូន Folder នេះទៅកាត់តភាគទាំងអស់"
                                >
                                  <Film className="w-2.5 h-2.5" />
                                  <span>កាត់ត</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="p-1.5 space-y-1.5">
                            {group.items.map((recap, idx) => {
                              const isSelected = currentRecap?.movie_title === recap.movie_title;
                              return (
                                <div
                                  key={(recap as any).id || `${recap.movie_title}_${idx}`}
                                  onClick={() => {
                                    onSelectRecap(recap);
                                    onSwitchMode('dubbing');
                                    setShowRecentDrawer(false);
                                  }}
                                  className={`p-2 rounded-lg border transition cursor-pointer group flex items-center justify-between gap-2 ${isSelected
                                      ? 'bg-blue-950/80 border-blue-500/80 shadow-xs'
                                      : 'bg-slate-900/70 hover:bg-slate-850 border-slate-800/80'
                                    }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="bg-blue-600/30 text-blue-300 text-[8px] font-bold px-1 rounded font-khmer">
                                        ភាគ {recap.episodeNumber || idx + 1}
                                      </span>
                                      <span className="text-[8px] font-mono text-slate-400">
                                        {recap.total_recap_duration_est || '00:45'}
                                      </span>
                                    </div>
                                    <h6 className="text-[11px] font-bold text-slate-200 group-hover:text-blue-300 transition truncate font-khmer">
                                      {recap.movie_title}
                                    </h6>
                                  </div>

                                  <div className="w-5 h-5 rounded-full bg-slate-800 group-hover:bg-blue-600 text-slate-400 group-hover:text-white flex items-center justify-center transition shrink-0">
                                    <Play className="w-2 h-2 ml-0.5 fill-current" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Standalone / Uncategorized */}
                      {uncategorized.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {groups.length > 0 && (
                            <p className="text-[10px] text-slate-500 font-khmer px-1">
                              វីដេអូទូទៅ ({uncategorized.length})
                            </p>
                          )}
                          {uncategorized.map((recap, idx) => {
                            const isSelected = currentRecap?.movie_title === recap.movie_title;
                            return (
                              <div
                                key={(recap as any).id || `${recap.movie_title}_${idx}`}
                                onClick={() => {
                                  onSelectRecap(recap);
                                  onSwitchMode('dubbing');
                                  setShowRecentDrawer(false);
                                }}
                                className={`p-2.5 rounded-xl border transition cursor-pointer group flex flex-col justify-between space-y-1.5 ${isSelected
                                    ? 'bg-blue-950/80 border-blue-500/80 shadow-md ring-1 ring-blue-500/30'
                                    : 'bg-slate-950/70 hover:bg-slate-850 border-slate-800 hover:border-slate-700'
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0">
                                    <h5 className="text-xs font-bold text-slate-200 group-hover:text-blue-300 transition truncate font-khmer">
                                      {recap.movie_title}
                                    </h5>
                                    <span className="text-[9px] font-mono text-slate-400">
                                      {recap.total_recap_duration_est || '00:45'}
                                    </span>
                                  </div>
                                  <div className="w-6 h-6 rounded-full bg-slate-800 group-hover:bg-blue-600 text-slate-400 group-hover:text-white flex items-center justify-center transition shrink-0 mt-1">
                                    <Play className="w-2.5 h-2.5 ml-0.5 fill-current" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()
              ) : (
                <div className="py-12 text-center text-xs text-slate-500 font-khmer space-y-2">
                  <Database className="w-7 h-7 text-slate-600 mx-auto" />
                  <p>មិនទាន់មានវីដេអូបកប្រែក្នុង Database</p>
                </div>
              )}
            </div>

            {/* Drawer Footer: Open Full Projects Modal */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80">
              <button
                onClick={() => {
                  setShowRecentDrawer(false);
                  onOpenSavedModal();
                }}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold font-khmer transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>មើលគម្រោងទាំងអស់ ({savedRecaps.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        )}

      </aside>
    </>
  );
};
