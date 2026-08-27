import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Plus, Film, Search, Upload, Clock, Check, Sparkles, AlertCircle, Database, Layers, FolderOpen
} from 'lucide-react';
import { MovieRecapResult, EpisodeClip } from '../types';
import { parseTimecode, formatTimecode } from '../utils/sequenceUtils';

interface ClipLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddClipToSequence: (clip: EpisodeClip) => void;
  onAddMultipleClips?: (clips: EpisodeClip[]) => void;
  existingClipsCount: number;
  savedRecaps?: MovieRecapResult[];
}

export const ClipLibraryModal: React.FC<ClipLibraryModalProps> = ({
  isOpen,
  onClose,
  onAddClipToSequence,
  onAddMultipleClips,
  existingClipsCount,
  savedRecaps = []
}) => {
  const [activeTab, setActiveTab] = useState<'db_recaps' | 'upload_video' | 'series'>('series');
  const [dbRecaps, setDbRecaps] = useState<MovieRecapResult[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileUrl, setUploadFileUrl] = useState('');
  const [uploadDuration, setUploadDuration] = useState(15);
  const [uploadEpisodeNum, setUploadEpisodeNum] = useState(existingClipsCount + 1);

  // Fetch all saved recaps from SQLite Database
  useEffect(() => {
    if (!isOpen) return;

    const fetchDbRecaps = async () => {
      setIsLoadingDb(true);
      try {
        const res = await fetch('/api/db/recaps');
        if (res.ok) {
          const data = await res.json();
          setDbRecaps(data);
        }
      } catch (err) {
        console.warn('Failed to fetch recaps from SQLite DB:', err);
      } finally {
        setIsLoadingDb(false);
      }
    };

    fetchDbRecaps();
  }, [isOpen]);

  // ── Series grouping logic ─────────────────────────────────────────────────
  // Merge DB recaps with in-memory savedRecaps (deduplicate by id or title)
  const allRecaps = useMemo(() => {
    const merged = [...dbRecaps];
    for (const r of savedRecaps) {
      const rid = (r as any).id;
      const alreadyIn = merged.some(
        (m) => (rid && (m as any).id === rid) || m.movie_title === r.movie_title
      );
      if (!alreadyIn) merged.push(r);
    }
    return merged;
  }, [dbRecaps, savedRecaps]);

  // Group recaps into Series: key = folderId > folderName > seriesTitle
  const seriesGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; recaps: MovieRecapResult[] }>();
    for (const r of allRecaps) {
      const key =
        (r.folderId && r.folderName ? `folder::${r.folderId}` : null) ??
        (r.folderName ? `fname::${r.folderName}` : null) ??
        (r.seriesTitle ? `series::${r.seriesTitle}` : null);
      if (!key) continue;
      const label = r.folderName || r.seriesTitle || key;
      if (!map.has(key)) map.set(key, { key, label, recaps: [] });
      map.get(key)!.recaps.push(r);
    }
    // Sort each group by episodeNumber then title
    for (const g of map.values()) {
      g.recaps.sort((a, b) => {
        const ea = a.episodeNumber ?? 0;
        const eb = b.episodeNumber ?? 0;
        if (ea !== eb && ea > 0 && eb > 0) return ea - eb;
        return (a.movie_title || '').localeCompare(b.movie_title || '', undefined, { numeric: true });
      });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [allRecaps]);

  // Convert a MovieRecapResult array into EpisodeClips
  const recapsToClips = (recaps: MovieRecapResult[], startEpOffset = 0): EpisodeClip[] =>
    recaps.map((recap, i) => ({
      id: `clip_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      recapId: (recap as any).id,
      episodeNumber: recap.episodeNumber || startEpOffset + i + 1,
      title: recap.movie_title || `ភាគ ${startEpOffset + i + 1}`,
      videoUrl: recap.videoUrl || '',
      videoFileName: recap.videoFileName,
      duration: parseTimecode(recap.total_recap_duration_est) || 30,
      trimStart: 0,
      trimEnd: 0,
      speed: 1.0,
      volume: 1.0,
      bgmTrackUrl: recap.bgmTrackUrl,
      segments: recap.recap_segments || []
    }));

  if (!isOpen) return null;

  const filteredRecaps = allRecaps.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      (r.movie_title || '').toLowerCase().includes(q) ||
      (r.seriesTitle || '').toLowerCase().includes(q) ||
      (r.genre_tag || '').toLowerCase().includes(q)
    );
  });

  const handleSelectRecap = (recap: MovieRecapResult) => {
    const rawDurSeconds = parseTimecode(recap.total_recap_duration_est) || 30;
    const newClip: EpisodeClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recapId: (recap as any).id,
      episodeNumber: recap.episodeNumber || existingClipsCount + 1,
      title: recap.movie_title || `ភាគ ${existingClipsCount + 1}`,
      videoUrl: recap.videoUrl || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      videoFileName: recap.videoFileName,
      duration: rawDurSeconds,
      trimStart: 0,
      trimEnd: 0,
      speed: 1.0,
      volume: 1.0,
      bgmTrackUrl: recap.bgmTrackUrl,
      segments: recap.recap_segments || []
    };

    onAddClipToSequence(newClip);
    onClose();
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setUploadFileName(file.name);
      setUploadFileUrl(url);

      // Probe duration
      const tempVideo = document.createElement('video');
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        setUploadDuration(Math.round(tempVideo.duration) || 15);
      };
    }
  };

  const handleConfirmUpload = () => {
    if (!uploadFileUrl) return;

    const newClip: EpisodeClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      episodeNumber: uploadEpisodeNum,
      title: uploadFileName.replace(/\.[^/.]+$/, '') || `ភាគ ${uploadEpisodeNum}`,
      videoUrl: uploadFileUrl,
      videoFileName: uploadFileName,
      duration: uploadDuration,
      trimStart: 0,
      trimEnd: 0,
      speed: 1.0,
      volume: 1.0
    };

    onAddClipToSequence(newClip);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn font-sans select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-khmer">បន្ថែមភាគទៅក្នុង Timeline កាត់ត</h3>
              <p className="text-xs text-slate-400 font-khmer">
                ជ្រើសរើសវីដេអូបកប្រែដែលបានរក្សាទុកក្នុង SQLite ឬ Upload វីដេអូថ្មី
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-1 overflow-x-auto">
          {/* Tab: Series/Folder (primary) */}
          <button
            onClick={() => setActiveTab('series')}
            className={`pb-2.5 px-3 font-khmer text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'series'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ភ្ជាប់ Series/Folder ⭐</span>
            {seriesGroups.length > 0 && (
              <span className="bg-purple-600/30 text-purple-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {seriesGroups.length}
              </span>
            )}
          </button>

          {/* Tab: DB Recaps */}
          <button
            onClick={() => setActiveTab('db_recaps')}
            className={`pb-2.5 px-3 font-khmer text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'db_recaps'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>ភាគម្ដងក្ដី ({allRecaps.length})</span>
          </button>

          {/* Tab: Upload */}
          <button
            onClick={() => setActiveTab('upload_video')}
            className={`pb-2.5 px-3 font-khmer text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'upload_video'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload វីដេអូ</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">

          {/* ── TAB: SERIES / FOLDER ─────────────────────────────── */}
          {activeTab === 'series' && (
            <div className="space-y-3">
              {seriesGroups.length === 0 ? (
                <div className="py-14 text-center space-y-2">
                  <Layers className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 font-khmer">មិនមាន Series ឬ Folder ណាមួយទេ</p>
                  <p className="text-[11px] text-slate-600 font-khmer">
                    សូម Assign Folder ឬ seriesTitle ក្នុង Page បកប្រែ
                    ហើយ Save ជាមុន
                  </p>
                </div>
              ) : (
                seriesGroups.map((group) => {
                  const totalSec = group.recaps.reduce(
                    (acc, r) => acc + (parseTimecode(r.total_recap_duration_est) || 30), 0
                  );
                  return (
                    <div
                      key={group.key}
                      style={{
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e293b 100%)',
                        borderRadius: 14,
                        border: '1px solid rgba(129,140,248,0.25)',
                        padding: '14px 16px',
                        boxShadow: '0 4px 20px rgba(99,102,241,0.15)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        {/* Left info */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <FolderOpen style={{ width: 14, height: 14, color: '#a5b4fc', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {group.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: '#a5b4fc', background: 'rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                              {group.recaps.length} ភាគ
                            </span>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                              ⏱ {formatTimecode(totalSec)}
                            </span>
                          </div>
                          {/* Episode mini-list */}
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {group.recaps.slice(0, 8).map((r, i) => (
                              <span
                                key={(r as any).id || i}
                                style={{
                                  fontSize: 9, background: 'rgba(255,255,255,0.07)',
                                  color: '#cbd5e1', padding: '2px 6px', borderRadius: 6,
                                  border: '1px solid rgba(255,255,255,0.08)'
                                }}
                              >
                                EP{r.episodeNumber || i + 1}
                              </span>
                            ))}
                            {group.recaps.length > 8 && (
                              <span style={{ fontSize: 9, color: '#64748b' }}>+{group.recaps.length - 8} ទៀត</span>
                            )}
                          </div>
                        </div>

                        {/* Right: Add All button */}
                        <button
                          onClick={() => {
                            const clips = recapsToClips(group.recaps, existingClipsCount);
                            if (onAddMultipleClips) {
                              onAddMultipleClips(clips);
                            } else {
                              clips.forEach((c) => onAddClipToSequence(c));
                            }
                            onClose();
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '8px 14px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                            color: '#fff', fontWeight: 700, fontSize: 11,
                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            boxShadow: '0 2px 12px rgba(99,102,241,0.45)',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                        >
                          <Plus style={{ width: 12, height: 12 }} />
                          Load {group.recaps.length} ភាគ
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'db_recaps' ? (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ស្វែងរកតាមចំណងជើងរឿង ឬឈ្មោះភាគ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-khmer focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Recaps List */}
              {isLoadingDb ? (
                <div className="py-12 text-center text-xs text-slate-400 font-khmer animate-pulse">
                  កំពុងទាញយកទិន្នន័យពី SQLite...
                </div>
              ) : filteredRecaps.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredRecaps.map((recap) => (
                    <div
                      key={(recap as any).id || recap.movie_title}
                      onClick={() => handleSelectRecap(recap)}
                      className="border border-slate-800 hover:border-blue-500/80 bg-slate-950/80 hover:bg-slate-850 p-3.5 rounded-xl transition cursor-pointer group flex flex-col justify-between space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[9px] font-bold px-1.5 py-0.2 rounded font-khmer">
                              ភាគ {recap.episodeNumber || 1}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {recap.total_recap_duration_est || '00:45'}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-200 group-hover:text-blue-300 transition truncate font-khmer">
                            {recap.movie_title}
                          </h4>
                          {recap.seriesTitle && (
                            <p className="text-[10px] text-slate-400 truncate font-khmer">
                              ស៊េរី: {recap.seriesTitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-850 text-[10px] text-slate-400">
                        <span className="font-khmer">
                          {recap.recap_segments?.length || 0} ឃ្លាបកប្រែរួច
                        </span>
                        <span className="text-blue-400 group-hover:translate-x-0.5 transition font-bold font-khmer flex items-center gap-1">
                          <Plus className="w-3 h-3" />
                          បញ្ចូលទៅ Timeline
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500 font-khmer space-y-2">
                  <Database className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>មិនមានវីដេអូបកប្រែត្រូវនឹងការស្វែងរកទេ</p>
                  <p className="text-[11px] text-slate-600">
                    សូមបកប្រែវីដេអូក្នុង Dubbing Studio ឬជ្រើសរើស Tab "Upload ហ្វាយវីដេអូផ្ទាល់ខ្លួន"
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 font-khmer">
              {/* Upload Input Area */}
              <label className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-950/60 hover:bg-slate-900">
                <Upload className="w-8 h-8 text-blue-400 mb-2" />
                <span className="text-xs font-bold text-slate-200">
                  {uploadFileName ? uploadFileName : 'ចុចទីនេះដើម្បីជ្រើសរើស Video File (MP4, MOV, WebM)'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">គាំទ្ររហូតដល់ 500MB</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleLocalFileUpload}
                  className="hidden"
                />
              </label>

              {uploadFileUrl && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">លេខរៀងភាគ (Episode #):</label>
                      <input
                        type="number"
                        min="1"
                        value={uploadEpisodeNum}
                        onChange={(e) => setUploadEpisodeNum(parseInt(e.target.value) || 1)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">រយៈពេលប៉ាន់ស្មាន (Seconds):</label>
                      <input
                        type="number"
                        min="1"
                        value={uploadDuration}
                        onChange={(e) => setUploadDuration(parseInt(e.target.value) || 15)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmUpload}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>បញ្ចូលភាគនេះទៅក្នុង Timeline</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
