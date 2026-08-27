import React, { useState, useMemo } from 'react';
import { MovieRecapResult, RecapFolder } from '../types';
import { 
  X, Trash2, Clock, Film, ExternalLink, Calendar, 
  FolderPlus, Folder, FolderOpen, ChevronDown, ChevronRight, 
  Search, Plus, Tag, Music, Edit2, Check, MoveRight, Layers, MoreVertical
} from 'lucide-react';

interface SavedRecapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedRecaps: MovieRecapResult[];
  onSelectRecap: (recap: MovieRecapResult) => void;
  onDeleteRecap: (recap: MovieRecapResult) => void;
  onClearAll: () => void;
  folders?: RecapFolder[];
  onSaveFolder?: (folder: Partial<RecapFolder>) => Promise<void>;
  onDeleteFolder?: (folderId: string) => Promise<void>;
  onAssignRecapFolder?: (recapId: string, folderName: string, folderId?: string) => Promise<void>;
  onInsertFolderToSequence?: (folderName: string, items: MovieRecapResult[]) => void;
  onOpenExportForFolder?: (folderName: string, items: MovieRecapResult[]) => void;
}

export const SavedRecapsModal: React.FC<SavedRecapsModalProps> = ({
  isOpen,
  onClose,
  savedRecaps,
  onSelectRecap,
  onDeleteRecap,
  onClearAll,
  folders = [],
  onSaveFolder,
  onDeleteFolder,
  onAssignRecapFolder,
  onInsertFolderToSequence,
  onOpenExportForFolder
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolderTab, setActiveFolderTab] = useState<string>('all');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  
  // Folder Creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  
  // Folder Editing state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  // Moving recap to folder menu state
  const [movingRecapId, setMovingRecapId] = useState<string | null>(null);

  // Toggle folder collapse
  const toggleFolderCollapse = (folderKey: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderKey]: !prev[folderKey]
    }));
  };

  // Create new folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    if (onSaveFolder) {
      await onSaveFolder({
        name,
        color: newFolderColor
      });
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  // Save renamed folder
  const handleRenameFolder = async (folderId: string) => {
    const name = editingFolderName.trim();
    if (!name) {
      setEditingFolderId(null);
      return;
    }
    if (onSaveFolder) {
      await onSaveFolder({
        id: folderId,
        name
      });
    }
    setEditingFolderId(null);
  };

  // Delete folder
  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (window.confirm(`តើអ្នកពិតជាចង់លុប Folder "${folderName}" មែនទេ? (វីដេអូក្នុង folder នឹងត្រូវបានផ្ទេរទៅ Uncategorized)`)) {
      if (onDeleteFolder) {
        await onDeleteFolder(folderId);
      }
    }
  };

  // Assign recap to folder
  const handleAssignFolder = async (recap: MovieRecapResult, folder: RecapFolder | null) => {
    const recapId = (recap as any).id;
    if (!recapId) return;
    if (onAssignRecapFolder) {
      await onAssignRecapFolder(
        recapId,
        folder ? folder.name : '',
        folder ? folder.id : ''
      );
    }
    setMovingRecapId(null);
  };

  // Filter recaps based on search query
  const filteredRecaps = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return savedRecaps;
    return savedRecaps.filter((r) => {
      const titleMatch = (r.movie_title || '').toLowerCase().includes(q);
      const seriesMatch = (r.seriesTitle || '').toLowerCase().includes(q);
      const folderMatch = (r.folderName || '').toLowerCase().includes(q);
      return titleMatch || seriesMatch || folderMatch;
    });
  }, [savedRecaps, searchQuery]);

  // Group recaps by folder
  const groupedData = useMemo(() => {
    // Collect all unique folders (both from database folders list and inferred from recaps)
    const folderMap = new Map<string, { folder: RecapFolder; items: MovieRecapResult[] }>();
    const seenLowerNames = new Map<string, string>(); // lowerName -> folderId

    // 1. Initialize registered DB folders without duplicate names
    folders.forEach((f) => {
      const lower = (f.name || '').trim().toLowerCase();
      if (!lower) return;
      if (!seenLowerNames.has(lower)) {
        seenLowerNames.set(lower, f.id);
        folderMap.set(f.id, { folder: f, items: [] });
      }
    });

    // 2. Also register any seriesTitle/folderName found on recaps if not in DB folders
    const uncategorizedItems: MovieRecapResult[] = [];

    filteredRecaps.forEach((recap) => {
      const targetFolderId = recap.folderId;
      const targetFolderName = (recap.folderName || recap.seriesTitle || '').trim();
      const lowerFolderName = targetFolderName.toLowerCase();

      if (targetFolderId && folderMap.has(targetFolderId)) {
        folderMap.get(targetFolderId)!.items.push(recap);
      } else if (lowerFolderName && seenLowerNames.has(lowerFolderName)) {
        const canonicalId = seenLowerNames.get(lowerFolderName)!;
        if (folderMap.has(canonicalId)) {
          folderMap.get(canonicalId)!.items.push(recap);
        } else {
          uncategorizedItems.push(recap);
        }
      } else if (targetFolderName) {
        const tempFolder: RecapFolder = {
          id: `auto_${targetFolderName}`,
          name: targetFolderName,
          color: '#6366F1'
        };
        seenLowerNames.set(lowerFolderName, tempFolder.id);
        folderMap.set(tempFolder.id, { folder: tempFolder, items: [recap] });
      } else {
        uncategorizedItems.push(recap);
      }
    });

    return {
      folderEntries: Array.from(folderMap.values()),
      uncategorizedItems
    };
  }, [filteredRecaps, folders]);

  // Palette colors for folders
  const FOLDER_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#64748B'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn font-sans">
      <div className="bg-[#0f141f] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl text-slate-200 overflow-hidden">
        
        {/* 1. Modal Header */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-black shadow-md shadow-amber-500/20 font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white font-khmer flex items-center gap-2">
                <span>គ្រប់គ្រង Folder & វីដេអូដែលបានរក្សាទុក</span>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono px-2 py-0.2 rounded-full font-bold">
                  {savedRecaps.length}
                </span>
              </h3>
              <p className="text-[10px] text-slate-400 font-khmer">
                រៀបចំគម្រោងរឿងភាគតាម Folder ក្នុង SQLite Database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreatingFolder(!isCreatingFolder)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-khmer font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer active:scale-95"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>+ បង្កើត Folder</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Create Folder Inline Panel (Conditional) */}
        {isCreatingFolder && (
          <form 
            onSubmit={handleCreateFolder}
            className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-2.5 animate-slideDown font-khmer text-xs"
          >
            <div className="flex items-center gap-1.5 text-blue-400 font-bold">
              <FolderPlus className="w-4 h-4" />
              <span>ឈ្មោះ Folder ថ្មី៖</span>
            </div>

            <input
              type="text"
              required
              autoFocus
              placeholder="ឧទាហរណ៍៖ ស្រមោលអតីតកាលគ្រួសារជីន..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />

            {/* Color Picker dots */}
            <div className="flex items-center gap-1">
              {FOLDER_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setNewFolderColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full transition transform cursor-pointer ${
                    newFolderColor === c ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="submit"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer transition shadow-xs"
              >
                បង្កើត
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(false)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer transition"
              >
                បោះបង់
              </button>
            </div>
          </form>
        )}

        {/* 3. Search Bar & Folder Navigation Filter Tabs */}
        <div className="p-3 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          
          {/* Search Box */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ស្វែងរកតាមចំណងជើង ឬឈ្មោះ Folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-khmer"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Folder Tabs Filter */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5 max-w-full sm:max-w-md">
            <button
              onClick={() => setActiveFolderTab('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-khmer font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                activeFolderTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              ទាំងអស់ ({savedRecaps.length})
            </button>

            <button
              onClick={() => setActiveFolderTab('uncategorized')}
              className={`px-2.5 py-1 rounded-lg text-xs font-khmer font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                activeFolderTab === 'uncategorized'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              គ្មាន Folder ({groupedData.uncategorizedItems.length})
            </button>

            {groupedData.folderEntries.map(({ folder, items }) => (
              <button
                key={folder.id}
                onClick={() => setActiveFolderTab(folder.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-khmer font-bold whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeFolderTab === folder.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color || '#3B82F6' }} />
                <span>{folder.name}</span>
                <span className="text-[10px] opacity-80">({items.length})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Main Scrollable List Body */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3.5 flex-1 custom-scrollbar">
          {savedRecaps.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2 font-khmer">
              <Film className="w-10 h-10 mx-auto text-slate-700" />
              <p className="text-sm font-bold text-slate-400">មិនទាន់មានគម្រោងដែលបានរក្សាទុកទេ</p>
              <p className="text-xs text-slate-600">រាល់ពេលលោកអ្នកបកប្រែ វីដេអូនឹងត្រូវបាន Auto-Save ចូល SQLite ទីនេះ</p>
            </div>
          ) : (
            <>
              {/* Folders Accordion List */}
              {groupedData.folderEntries
                .filter(({ folder }) => activeFolderTab === 'all' || activeFolderTab === folder.id)
                .map(({ folder, items }) => {
                  const isCollapsed = !!collapsedFolders[folder.id];
                  const isEditing = editingFolderId === folder.id;

                  return (
                    <div 
                      key={folder.id}
                      className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg"
                    >
                      {/* Folder Header */}
                      <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2">
                        <div 
                          onClick={() => toggleFolderCollapse(folder.id)}
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none group"
                        >
                          <button className="text-slate-400 group-hover:text-white transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          <div 
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                            style={{ backgroundColor: folder.color || '#3B82F6' }}
                          >
                            {isCollapsed ? <Folder className="w-3.5 h-3.5 fill-current" /> : <FolderOpen className="w-3.5 h-3.5 fill-current" />}
                          </div>

                          {isEditing ? (
                            <div 
                              onClick={(e) => e.stopPropagation()} 
                              className="flex items-center gap-1.5 min-w-0 flex-1"
                            >
                              <input
                                type="text"
                                value={editingFolderName}
                                onChange={(e) => setEditingFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameFolder(folder.id);
                                  if (e.key === 'Escape') setEditingFolderId(null);
                                }}
                                autoFocus
                                className="bg-slate-950 border border-blue-500 rounded-lg px-2 py-0.5 text-xs text-white font-khmer font-bold w-48 focus:outline-none"
                              />
                              <button
                                onClick={() => handleRenameFolder(folder.id)}
                                className="p-1 text-emerald-400 hover:text-emerald-300"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-xs sm:text-sm text-slate-100 font-khmer truncate group-hover:text-blue-400 transition">
                                {folder.name}
                              </h4>
                            </div>
                          )}

                          <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold shrink-0">
                            {items.length} ភាគ
                          </span>
                        </div>

                        {/* Folder Actions (Insert Entire Folder, Export Folder, Rename, Delete) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {items.length > 0 && onOpenExportForFolder && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenExportForFolder(folder.name, items);
                              }}
                              className="px-2.5 sm:px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs font-khmer flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
                              title="Render គ្រប់ភាគទាំងអស់ក្នុង Folder នេះម្តងទាំងអស់ ឬ Merge ជារឿងពេញ"
                            >
                              <Film className="w-3.5 h-3.5 text-amber-300" />
                              <span>⚡ Export Folder ({items.length})</span>
                            </button>
                          )}
                          {items.length > 0 && onInsertFolderToSequence && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInsertFolderToSequence(folder.name, items);
                              }}
                              className="px-2.5 sm:px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs font-khmer flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer"
                              title="បញ្ជូនភាគទាំងអស់ក្នុង Folder នេះទៅកាន់ Page កាត់តភាគ"
                            >
                              <Film className="w-3.5 h-3.5" />
                              <span>🎬 បញ្ជូនទៅកាត់ត ({items.length})</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition cursor-pointer"
                            title="ប្តូរឈ្មោះ Folder"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id, folder.name)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition cursor-pointer"
                            title="លុប Folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Folder Items List (when expanded) */}
                      {!isCollapsed && (
                        <div className="p-2 sm:p-2.5 space-y-1.5">
                          {items.length === 0 ? (
                            <div className="py-4 text-center text-xs text-slate-500 font-khmer">
                              មិនទាន់មានវីដេអូក្នុង Folder នេះនៅឡើយទេ
                            </div>
                          ) : (
                            items.map((recap, idx) => (
                              <RecapListItem
                                key={`folder_${folder.id}_${(recap as any).id || recap.movie_title}_${idx}`}
                                recap={recap}
                                globalIdx={savedRecaps.indexOf(recap)}
                                folders={folders}
                                isMoving={movingRecapId === ((recap as any).id || recap.movie_title)}
                                onToggleMove={() => {
                                  const id = (recap as any).id || recap.movie_title;
                                  setMovingRecapId(movingRecapId === id ? null : id);
                                }}
                                onSelectRecap={() => {
                                  onSelectRecap(recap);
                                  onClose();
                                }}
                                onDeleteRecap={() => onDeleteRecap(recap)}
                                onAssignFolder={(targetF) => handleAssignFolder(recap, targetF)}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Uncategorized Items Section */}
              {(activeFolderTab === 'all' || activeFolderTab === 'uncategorized') && groupedData.uncategorizedItems.length > 0 && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                  <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center">
                        <Folder className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-300 font-khmer">
                        វីដេអូទូទៅ (គ្មាន Folder)
                      </h4>
                      <span className="bg-slate-800 text-slate-400 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                        {groupedData.uncategorizedItems.length}
                      </span>
                    </div>

                    {onInsertFolderToSequence && (
                      <button
                        type="button"
                        onClick={() => onInsertFolderToSequence('វីដេអូទូទៅ', groupedData.uncategorizedItems)}
                        className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 text-xs font-khmer font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5 text-amber-500" />
                        <span>🎬 បញ្ជូនទាំងអស់ទៅកាត់ត ({groupedData.uncategorizedItems.length})</span>
                      </button>
                    )}
                  </div>

                  <div className="p-2 sm:p-2.5 space-y-1.5">
                    {groupedData.uncategorizedItems.map((recap, idx) => (
                      <RecapListItem
                        key={`uncat_${(recap as any).id || recap.movie_title}_${idx}`}
                        recap={recap}
                        globalIdx={savedRecaps.indexOf(recap)}
                        folders={folders}
                        isMoving={movingRecapId === ((recap as any).id || recap.movie_title)}
                        onToggleMove={() => {
                          const id = (recap as any).id || recap.movie_title;
                          setMovingRecapId(movingRecapId === id ? null : id);
                        }}
                        onSelectRecap={() => {
                          onSelectRecap(recap);
                          onClose();
                        }}
                        onDeleteRecap={() => onDeleteRecap(recap)}
                        onAssignFolder={(targetF) => handleAssignFolder(recap, targetF)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 5. Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            onClick={onClearAll}
            className="text-xs text-slate-500 hover:text-red-400 font-khmer transition flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>សម្អាត History ទាំងអស់</span>
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-khmer font-bold transition cursor-pointer"
          >
            បិទ (Close)
          </button>
        </div>

      </div>
    </div>
  );
};

// Sub-component for individual recap row item
interface RecapListItemProps {
  recap: MovieRecapResult;
  globalIdx: number;
  folders: RecapFolder[];
  isMoving: boolean;
  onToggleMove: () => void;
  onSelectRecap: () => void;
  onDeleteRecap: () => void;
  onAssignFolder: (folder: RecapFolder | null) => void;
}

const RecapListItem: React.FC<RecapListItemProps> = ({
  recap,
  folders,
  isMoving,
  onToggleMove,
  onSelectRecap,
  onDeleteRecap,
  onAssignFolder
}) => {
  return (
    <div className="relative bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 rounded-xl p-2.5 flex items-center justify-between gap-3 transition group">
      
      {/* Clickable Info Area */}
      <div 
        onClick={onSelectRecap}
        className="flex-1 min-w-0 cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-1">
          {recap.episodeNumber && (
            <span className="bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[9px] font-bold px-1.5 py-0.2 rounded font-khmer shrink-0">
              ភាគ {recap.episodeNumber}
            </span>
          )}
          
          <h5 className="font-bold text-slate-200 group-hover:text-amber-400 transition text-xs truncate font-khmer">
            {recap.movie_title || 'Untitled Recap'}
          </h5>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1 text-amber-400">
            <Clock className="w-3 h-3 text-amber-500" />
            {recap.total_recap_duration_est || '00:00'}
          </span>
          <span>•</span>
          <span>{(recap.recap_segments || []).length} ឃ្លា</span>

          {recap.bgmTrackUrl && (
            <>
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-0.5">
                <Music className="w-2.5 h-2.5" />
                <span>BGM</span>
              </span>
            </>
          )}

          {recap.created_at && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-500">
                <Calendar className="w-2.5 h-2.5" />
                {new Date(recap.created_at).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions (Move to Folder, Open, Delete) */}
      <div className="flex items-center gap-1.5 shrink-0">
        
        {/* Move to Folder Button & Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMove();
            }}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-khmer font-bold transition flex items-center gap-1 cursor-pointer"
            title="ផ្លាស់ប្តូរ Folder"
          >
            <Folder className="w-3 h-3 text-indigo-400" />
            <span className="hidden sm:inline">Folder</span>
          </button>

          {/* Folder Choice Menu */}
          {isMoving && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 font-khmer text-xs animate-fadeIn"
            >
              <p className="text-[10px] text-slate-400 px-2 py-1 font-bold border-b border-slate-800 mb-1">
                ជ្រើសរើស Folder៖
              </p>
              
              <div className="max-h-40 overflow-y-auto space-y-0.5 custom-scrollbar">
                {/* Remove from folder option */}
                <button
                  type="button"
                  onClick={() => onAssignFolder(null)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3 h-3 text-red-400" />
                  <span>ដកចេញពី Folder (None)</span>
                </button>

                {folders.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => onAssignFolder(f)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 text-[11px] flex items-center gap-1.5 cursor-pointer truncate"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color || '#3B82F6' }} />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Open Button */}
        <button
          type="button"
          onClick={onSelectRecap}
          className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <span>Open</span>
          <ExternalLink className="w-3 h-3" />
        </button>

        {/* Delete Button */}
        <button
          type="button"
          onClick={onDeleteRecap}
          className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition cursor-pointer"
          title="លុបចោល"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
};
