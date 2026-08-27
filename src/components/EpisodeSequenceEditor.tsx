import React, { useState, useEffect, useMemo } from 'react';
import { 
  Film, Save, Download, Plus, Play, Pause, RotateCcw, 
  Trash2, Copy, Sparkles, Layers, Sliders, Volume2, 
  CheckCircle2, ArrowLeft, ArrowRight, Database, Share2, Check, Scissors, Loader2,
  GripVertical, ChevronUp, ChevronDown, Music, Shield, ShieldCheck, RefreshCw, ZoomIn, Palette, Zap, Stamp
} from 'lucide-react';
import { EpisodeClip, SeriesProject, MovieRecapResult, AntiCopyrightConfig, SubtitleStyleConfig, WatermarkConfig } from '../types';
import { SequenceMonitor } from './SequenceMonitor';
import { SequenceTimeline } from './SequenceTimeline';
import { ClipLibraryModal } from './ClipLibraryModal';
import { StudioSidebar } from './StudioSidebar';
import { ExportModal } from './ExportModal';
import { WatermarkModal } from './WatermarkModal';
import { ToastContainer, ToastMessage, ToastType } from './ToastNotification';
import { 
  formatTimecode, 
  getClipEffectiveDuration, 
  getTotalSequenceDuration 
} from '../utils/sequenceUtils';
import { getSafeMediaUrl } from '../utils/mediaUtils';

interface EpisodeSequenceEditorProps {
  seriesProject: SeriesProject;
  onUpdateSeriesProject: (updated: SeriesProject) => void;
  onSaveSeriesProjectToDb: (project: SeriesProject) => Promise<void>;
  onSwitchToDubbingStudio: () => void;
  onSwitchToCutter?: () => void;
  currentRecap?: MovieRecapResult | null;
  savedRecaps?: MovieRecapResult[];
  onSelectRecap?: (recap: MovieRecapResult) => void;
  onOpenSavedModal?: () => void;
  onOpenUploadModal?: () => void;
  onOpenTikTokModal?: () => void;
  onOpenApiKeyModal?: () => void;
  hasCustomApiKey?: boolean;
  saveStatus?: 'saved' | 'saving' | 'error';
  globalVoicePersona?: string;
  onChangeGlobalVoicePersona?: (persona: string) => void;
  ttsSpeed?: number;
  onChangeTtsSpeed?: (speed: number) => void;
  watermark?: import('../types').WatermarkConfig;
}

export const EpisodeSequenceEditor: React.FC<EpisodeSequenceEditorProps> = ({
  seriesProject,
  onUpdateSeriesProject,
  onSaveSeriesProjectToDb,
  onSwitchToDubbingStudio,
  onSwitchToCutter,
  currentRecap,
  savedRecaps = [],
  onSelectRecap,
  onOpenSavedModal,
  onOpenUploadModal,
  onOpenTikTokModal,
  onOpenApiKeyModal,
  hasCustomApiKey = false,
  saveStatus = 'saved',
  globalVoicePersona = 'auto',
  onChangeGlobalVoicePersona,
  ttsSpeed = 1.25,
  onChangeTtsSpeed,
  watermark
}) => {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(() => {
    return seriesProject.clips[0]?.id || null;
  });
  const [inspectorTab, setInspectorTab] = useState<'clip' | 'anti_copyright'>('clip');
  const [globalCurrentTime, setGlobalCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState<boolean>(false);
  const [watermarkState, setWatermarkState] = useState<WatermarkConfig>(() => {
    try {
      const saved = localStorage.getItem('khmer_recap_watermark_cfg');
      if (saved) return JSON.parse(saved);
    } catch {}
    return watermark || {
      enabled: true,
      type: 'text',
      text: '@BT-Dubber',
      position: 'top-right',
      opacity: 0.85,
      scale: 1.0,
      color: '#FFFFFF'
    };
  });

  const handleSaveWatermark = (cfg: WatermarkConfig) => {
    setWatermarkState(cfg);
    try {
      localStorage.setItem('khmer_recap_watermark_cfg', JSON.stringify(cfg));
    } catch {}
    showToast('success', 'បានកំណត់ Watermark ជោគជ័យ!', `បង្ហាញនៅ៖ ${cfg.position}`);
  };

  const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastType, title: string, message?: string) => {
    const newToast: ToastMessage = {
      id: `toast_${Date.now()}_${Math.random()}`,
      type,
      title,
      message,
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const clips = seriesProject.clips || [];
  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const totalDuration = getTotalSequenceDuration(clips);

  const activeRecapForExport: MovieRecapResult = useMemo(() => {
    const active = selectedClip || clips[0];
    const allSegments = clips.flatMap((c, cIdx) => 
      (c.segments || []).map((s, sIdx) => ({
        ...s,
        segment_id: cIdx * 1000 + sIdx + 1
      }))
    );

    return {
      movie_title: seriesProject.title || 'Movie Series',
      seriesTitle: seriesProject.title,
      videoUrl: active?.videoUrl,
      videoFileName: active?.videoFileName,
      bgmTrackUrl: active?.bgmTrackUrl,
      recap_segments: allSegments.length > 0 ? allSegments : (active?.segments || []),
      total_duration: formatTimecode(totalDuration, true),
      translation_mode: 'story_recap'
    };
  }, [seriesProject, clips, selectedClip, totalDuration]);

  // Auto select first clip if selected deleted
  useEffect(() => {
    if (selectedClipId && !clips.some((c) => c.id === selectedClipId)) {
      setSelectedClipId(clips[0]?.id || null);
    }
  }, [clips, selectedClipId]);

  // Update a single clip
  const handleUpdateClip = (clipId: string, updates: Partial<EpisodeClip>) => {
    const updatedClips = clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c));
    onUpdateSeriesProject({ ...seriesProject, clips: updatedClips });
  };

  // Add new clip to sequence
  const handleAddClip = (newClip: EpisodeClip) => {
    const updatedClips = [...clips, newClip];
    onUpdateSeriesProject({ ...seriesProject, clips: updatedClips });
    setSelectedClipId(newClip.id);
    showToast('success', 'បានបន្ថែមភាគថ្មី', `ភាគ ${newClip.episodeNumber}: ${newClip.title} ត្រូវបានដាក់ចូល Timeline`);
  };

  // Add multiple clips at once (from Series/Folder bulk load)
  const handleAddMultipleClips = (newClips: EpisodeClip[]) => {
    if (!newClips || newClips.length === 0) return;
    const updatedClips = [...clips, ...newClips];
    // Re-index episode numbers to keep them sequential
    const reIndexed = updatedClips.map((c, i) => ({ ...c, episodeNumber: i + 1 }));
    onUpdateSeriesProject({
      ...seriesProject,
      clips: reIndexed
    });
    setSelectedClipId(newClips[0]?.id || null);
    showToast(
      'success',
      `▶▶ បាន Load ទាំម ${newClips.length} ភាគជោគជ័យ!`,
      `ភាគទាំងអស់ត្រូវបានដាក់ចូល Timeline រួចរាល់`
    );
  };

  // Delete clip
  const handleDeleteClip = (clipId: string) => {
    const updatedClips = clips.filter((c) => c.id !== clipId);
    onUpdateSeriesProject({ ...seriesProject, clips: updatedClips });
    showToast('info', 'បានលុបភាគ', 'ភាគត្រូវបានដកចេញពី Timeline');
  };

  // Duplicate clip
  const handleDuplicateClip = (clipId: string) => {
    const target = clips.find((c) => c.id === clipId);
    if (!target) return;
    const duplicated: EpisodeClip = {
      ...target,
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      episodeNumber: clips.length + 1,
      title: `${target.title} (ច្បាប់ចម្លង)`
    };
    const updatedClips = [...clips, duplicated];
    onUpdateSeriesProject({ ...seriesProject, clips: updatedClips });
    setSelectedClipId(duplicated.id);
    showToast('success', 'បានចម្លងភាគ', `ច្បាប់ចម្លងត្រូវបានបន្ថែម`);
  };

  // Reorder clips
  const handleReorderClips = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= clips.length || toIndex < 0 || toIndex >= clips.length) return;
    const reordered = [...clips];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Auto update episode numbers
    const updated = reordered.map((c, i) => ({ ...c, episodeNumber: i + 1 }));
    onUpdateSeriesProject({ ...seriesProject, clips: updated });
  };

  // Split selected clip at playhead
  const handleSplitClipAtPlayhead = () => {
    if (!selectedClip) return;
    const clipEffectiveDur = getClipEffectiveDuration(selectedClip);
    if (clipEffectiveDur <= 2) {
      showToast('warning', 'មិនអាចពុះបានទេ', 'ភាគនេះមានរយៈពេលខ្លីពេកក្នុងការកាត់ពុះ');
      return;
    }

    // Split at halfway of current effective duration
    const splitPoint = Math.round((clipEffectiveDur / 2) * 10) / 10;
    const clipIndex = clips.findIndex((c) => c.id === selectedClip.id);

    const firstHalf: EpisodeClip = {
      ...selectedClip,
      trimEnd: (selectedClip.trimEnd || 0) + (clipEffectiveDur - splitPoint),
      title: `${selectedClip.title} (ផ្នែក ក)`
    };

    const secondHalf: EpisodeClip = {
      ...selectedClip,
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      episodeNumber: selectedClip.episodeNumber + 1,
      trimStart: (selectedClip.trimStart || 0) + splitPoint,
      title: `${selectedClip.title} (ផ្នែក ខ)`
    };

    const newClips = [...clips];
    newClips.splice(clipIndex, 1, firstHalf, secondHalf);
    
    // Re-index episode numbers
    const finalClips = newClips.map((c, i) => ({ ...c, episodeNumber: i + 1 }));
    onUpdateSeriesProject({ ...seriesProject, clips: finalClips });
    setSelectedClipId(secondHalf.id);
    showToast('success', 'បានពុះវីដេអូជាពីរ', 'វីដេអូត្រូវបានបំបែកជាពីរផ្នែកលើ Timeline');
  };

  // Save series project to SQLite database
  const handleSaveToDb = async () => {
    setIsSaving(true);
    try {
      await onSaveSeriesProjectToDb(seriesProject);
      showToast('success', 'រក្សាទុកជោគជ័យ!', 'គម្រោងកាត់តភាគត្រូវបាន Save ចូលទៅក្នុង SQLite Database រួចរាល់');
    } catch (err: any) {
      showToast('error', 'បរាជ័យក្នុងការ Save', err.message || 'Error saving to SQLite');
    } finally {
      setIsSaving(false);
    }
  };

  // Export full series script & EDL JSON
  const handleExportSeries = () => {
    setIsExporting(true);
    try {
      const exportPayload = {
        series_title: seriesProject.title,
        total_episodes: clips.length,
        total_duration: formatTimecode(totalDuration, true),
        aspect_ratio: seriesProject.aspectRatio,
        exported_at: new Date().toISOString(),
        clips: clips.map((c) => ({
          episode: c.episodeNumber,
          title: c.title,
          source_file: c.videoFileName || c.videoUrl,
          effective_duration: formatTimecode(getClipEffectiveDuration(c)),
          trim_start: c.trimStart,
          trim_end: c.trimEnd,
          speed: c.speed,
          subtitles: c.segments || []
        }))
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${seriesProject.title.replace(/\s+/g, '_')}_Series_Sequence.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', 'បាន Export គម្រោងស៊េរី!', `ទាញយក File JSON លំដាប់ភាគបានជោគជ័យ`);
    } catch (err: any) {
      showToast('error', 'Export Error', err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full bg-slate-950 min-h-screen text-slate-100 flex flex-col font-sans select-none">
      
      {/* 1. Top Editor Header */}
      <header className="h-12 sm:h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20 sticky top-0">
        
        {/* Left: Project Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <Scissors className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={seriesProject.title}
              onChange={(e) => onUpdateSeriesProject({ ...seriesProject, title: e.target.value })}
              placeholder="ចំណងជើងស៊េរីរឿង..."
              className="bg-transparent hover:bg-slate-800 focus:bg-slate-800 px-2 py-1 rounded-lg text-sm font-bold text-white border border-transparent focus:border-slate-700 font-khmer focus:outline-none transition"
            />
            <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full font-khmer shrink-0">
              {clips.length} ភាគ
            </span>
          </div>
        </div>

        {/* Right: Actions (Auto-Save SQLite Status, Export) */}
        <div className="flex items-center gap-2">
          {/* Live SQLite DB Auto-Save Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-khmer font-bold">
            {saveStatus === 'saving' ? (
              <span className="flex items-center gap-1.5 text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>កំពុង Save ស្វ័យប្រវត្តិ...</span>
              </span>
            ) : saveStatus === 'error' ? (
              <span className="flex items-center gap-1.5 text-red-400">
                <span>Save Error</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Auto-Saved ក្នុង SQLite</span>
              </span>
            )}
          </div>

          {/* Channel Watermark Button */}
          <button
            onClick={() => setIsWatermarkModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-orange-400 rounded-xl text-xs font-bold font-khmer border border-slate-700 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="កំណត់ Watermark & Logo លើវីដេអូភាគ"
          >
            <Stamp className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden md:inline">Watermark</span>
          </button>

          {/* Export Full Series Script JSON */}
          <button
            onClick={handleExportSeries}
            className="px-3 sm:px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold font-khmer border border-slate-700 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="ទាញយក File JSON នៃគម្រោងស៊េរី"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Script</span>
          </button>

          {/* 1-Click Render MP4 Video Button */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-3.5 sm:px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold font-khmer shadow-lg shadow-blue-600/25 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="1-Click Render Video MP4 1080p (FFmpeg 7.1 Engine)"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Render MP4</span>
          </button>
        </div>
      </header>

      {/* 2. Main Studio Body with Left Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar Navigation & Recent Drawer */}
        <StudioSidebar
          activeMode="sequence"
          onSwitchMode={(mode) => {
            if (mode === 'dubbing') onSwitchToDubbingStudio();
            if (mode === 'cutter' && onSwitchToCutter) onSwitchToCutter();
          }}
          onOpenUpload={onOpenUploadModal || (() => {})}
          onOpenTikTokModal={onOpenTikTokModal}
          onOpenApiKeyModal={onOpenApiKeyModal}
          hasCustomApiKey={hasCustomApiKey}
          savedRecaps={savedRecaps}
          currentRecap={currentRecap}
          onSelectRecap={(recap) => {
            if (onSelectRecap) onSelectRecap(recap);
            onSwitchToDubbingStudio();
          }}
          onOpenSavedModal={onOpenSavedModal || (() => {})}
        />

        {/* Studio Content Canvas */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 space-y-3 overflow-y-auto">
        
        {/* Top Split: Left Sequence Monitor & Right Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[380px]">
          
          {/* Left: Sequence Player Viewport (8 cols) */}
          <div className="lg:col-span-8 flex flex-col">
            <SequenceMonitor
              clips={clips}
              selectedClipId={selectedClipId}
              onSelectClip={setSelectedClipId}
              globalCurrentTime={globalCurrentTime}
              onSeekGlobalTime={setGlobalCurrentTime}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              aspectRatio={seriesProject.aspectRatio}
              onChangeAspectRatio={(ratio) => onUpdateSeriesProject({ ...seriesProject, aspectRatio: ratio })}
              globalVoicePersona={globalVoicePersona}
              onChangeGlobalVoicePersona={onChangeGlobalVoicePersona}
              ttsSpeed={ttsSpeed}
              onChangeTtsSpeed={onChangeTtsSpeed}
              watermark={watermarkState}
              subtitleConfig={(() => {
                try {
                  const saved = localStorage.getItem('khmer_recap_subtitle_cfg');
                  if (saved) return JSON.parse(saved);
                } catch {}
                return {
                  enabled: true,
                  preset: 'tiktok_pop',
                  fontFamily: 'Kantumruy Pro',
                  fontSize: 'lg',
                  position: 'bottom',
                  animationType: 'karaoke_word',
                  highlightColor: '#FACC15',
                  textColor: '#FFFFFF',
                  strokeColor: '#000000',
                  bgBox: 'shadow'
                };
              })()}
            />
          </div>

          {/* Right: Clip Inspector & Settings Panel (4 cols) */}
          {/* Right: Clip Inspector & Settings Panel (4 cols) */}
          <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xl select-none">
            <div>
              {/* Tabs Switcher: Clip Settings vs Anti-Copyright Shield */}
              <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2.5 mb-3">
                <button
                  type="button"
                  onClick={() => setInspectorTab('clip')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold font-khmer transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    inspectorTab === 'clip'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>កំណត់ភាគ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInspectorTab('anti_copyright')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold font-khmer transition flex items-center justify-center gap-1.5 cursor-pointer relative ${
                    inspectorTab === 'anti_copyright'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-slate-950 text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>🛡️ ការពារ Copyright</span>
                  {selectedClip?.antiCopyright?.enabled && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute top-1 right-1" />
                  )}
                </button>
              </div>

              {selectedClip ? (
                inspectorTab === 'clip' ? (
                  /* TAB 1: CLIP INSPECTOR SETTINGS */
                  <div className="space-y-3 font-khmer text-xs">
                    {/* Clip Title */}
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-khmer">ឈ្មោះភាគ៖</label>
                      <input
                        type="text"
                        value={selectedClip.title}
                        onChange={(e) => handleUpdateClip(selectedClip.id, { title: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-khmer"
                      />
                    </div>

                    {/* Trimming In/Out Sliders */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">កាត់ក្បាល (Trim Start):</span>
                        <span className="font-mono text-amber-400 font-bold">{selectedClip.trimStart || 0}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, (selectedClip.duration || 10) - 2)}
                        step="0.5"
                        value={selectedClip.trimStart || 0}
                        onChange={(e) => handleUpdateClip(selectedClip.id, { trimStart: parseFloat(e.target.value) })}
                        className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
                      />

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-slate-400">កាត់កន្ទុយ (Trim End):</span>
                        <span className="font-mono text-amber-400 font-bold">{selectedClip.trimEnd || 0}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, (selectedClip.duration || 10) - (selectedClip.trimStart || 0) - 1)}
                        step="0.5"
                        value={selectedClip.trimEnd || 0}
                        onChange={(e) => handleUpdateClip(selectedClip.id, { trimEnd: parseFloat(e.target.value) })}
                        className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Speed & Volume */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <label className="text-[10px] text-slate-400 block mb-1">ល្បឿន (Speed):</label>
                        <select
                          value={selectedClip.speed || 1.0}
                          onChange={(e) => handleUpdateClip(selectedClip.id, { speed: parseFloat(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                        >
                          <option value={0.75}>0.75x</option>
                          <option value={1.0}>1.0x Normal</option>
                          <option value={1.25}>1.25x Fast</option>
                          <option value={1.5}>1.5x Turbo</option>
                        </select>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <label className="text-[10px] text-slate-400 block mb-1">កម្រិតសំឡេង:</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={selectedClip.volume ?? 1}
                          onChange={(e) => handleUpdateClip(selectedClip.id, { volume: parseFloat(e.target.value) })}
                          className="w-full h-1.5 accent-blue-500 bg-slate-800 rounded-lg cursor-pointer mt-2"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* TAB 2: 🛡️ ANTI-COPYRIGHT PROTECTION SHIELD */
                  <div className="space-y-3 font-khmer text-xs animate-fadeIn">
                    
                    {/* Master Shield Toggle */}
                    <div className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                      selectedClip.antiCopyright?.enabled
                        ? 'bg-emerald-950/60 border-emerald-500/50 shadow-md shadow-emerald-950/30'
                        : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedClip.antiCopyright?.enabled
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-white font-khmer">
                            Anti-Copyright Shield
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            {selectedClip.antiCopyright?.enabled ? '🛡️ កំពុងដំណើរការការពារ' : 'បិទមុខងារការពារ'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const currentlyEnabled = selectedClip.antiCopyright?.enabled ?? false;
                          const currentAc = selectedClip.antiCopyright || {
                            enabled: false,
                            flipHorizontal: true,
                            zoomScale: 1.04,
                            colorFilter: 'cinematic_warm',
                            microSpeed: 1.05,
                            filmGrain: false,
                            vignette: true
                          };
                          handleUpdateClip(selectedClip.id, {
                            antiCopyright: {
                              ...currentAc,
                              enabled: !currentlyEnabled
                            }
                          });
                          showToast(
                            !currentlyEnabled ? 'success' : 'info',
                            !currentlyEnabled ? '🛡️ បានបើកមុខងារការពារ Copyright' : 'បានបិទមុខងារការពារ Copyright',
                            !currentlyEnabled ? 'វីដេអូត្រូវបានបម្លែង (Flip + 104% Zoom + Color Filter) សុវត្ថិភាពសម្រាប់ TikTok/Facebook' : ''
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer shrink-0 ${
                          selectedClip.antiCopyright?.enabled
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {selectedClip.antiCopyright?.enabled ? 'បើក' : 'បិទ'}
                      </button>
                    </div>

                    {/* Quick 1-Click Presets */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateClip(selectedClip.id, {
                            antiCopyright: {
                              enabled: true,
                              flipHorizontal: true,
                              zoomScale: 1.04,
                              colorFilter: 'cinematic_warm',
                              microSpeed: 1.05,
                              filmGrain: false,
                              vignette: true
                            }
                          });
                          showToast('success', '✨ TikTok / Reels Safe Preset', 'បានកំណត់ Flip + 104% Zoom + Cinematic Warm + 1.05x Speed');
                        }}
                        className="p-2 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left transition cursor-pointer group"
                      >
                        <span className="text-[11px] font-bold text-emerald-400 group-hover:text-emerald-300 block mb-0.5">
                          ✨ TikTok / Reels
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          Flip + 104% + Warm
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateClip(selectedClip.id, {
                            antiCopyright: {
                              enabled: true,
                              flipHorizontal: true,
                              zoomScale: 1.06,
                              colorFilter: 'golden_hour',
                              microSpeed: 1.06,
                              filmGrain: true,
                              vignette: true
                            }
                          });
                          showToast('success', '🔥 Facebook / Shorts Safe Preset', 'បានកំណត់ Flip + 106% Zoom + Golden Hour + Grain + 1.06x Speed');
                        }}
                        className="p-2 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-left transition cursor-pointer group"
                      >
                        <span className="text-[11px] font-bold text-amber-400 group-hover:text-amber-300 block mb-0.5">
                          🔥 Facebook / Shorts
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          Flip + 106% + Golden
                        </span>
                      </button>
                    </div>

                    {/* Fine-Tuning Controls */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
                      
                      {/* 1. Horizontal Flip Mirror */}
                      <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                          <span>ត្រឡប់រូបភាពឆ្វេង-ស្តាំ (Mirror Flip):</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedClip.antiCopyright?.flipHorizontal ?? true}
                          onChange={(e) => {
                            const cur = selectedClip.antiCopyright || { enabled: true, zoomScale: 1.04, colorFilter: 'cinematic_warm', microSpeed: 1.05, filmGrain: false, vignette: true };
                            handleUpdateClip(selectedClip.id, {
                              antiCopyright: { ...cur, enabled: true, flipHorizontal: e.target.checked }
                            });
                          }}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                      </label>

                      {/* 2. Smart Zoom / Crop Slider */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <ZoomIn className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Zoom កាត់គែម (Smart Crop):</span>
                          </span>
                          <span className="font-mono text-emerald-400 font-bold">
                            {Math.round(((selectedClip.antiCopyright?.zoomScale ?? 1.04) - 1) * 100 + 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="1.12"
                          step="0.01"
                          value={selectedClip.antiCopyright?.zoomScale ?? 1.04}
                          onChange={(e) => {
                            const cur = selectedClip.antiCopyright || { enabled: true, flipHorizontal: true, colorFilter: 'cinematic_warm', microSpeed: 1.05, filmGrain: false, vignette: true };
                            handleUpdateClip(selectedClip.id, {
                              antiCopyright: { ...cur, enabled: true, zoomScale: parseFloat(e.target.value) }
                            });
                          }}
                          className="w-full h-1.5 accent-emerald-500 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* 3. Color Grade Filter */}
                      <div>
                        <label className="text-[11px] text-slate-300 flex items-center gap-1.5 mb-1">
                          <Palette className="w-3.5 h-3.5 text-pink-400" />
                          <span>តម្រងពណ៌ភាពយន្ត (Color Grade):</span>
                        </label>
                        <select
                          value={selectedClip.antiCopyright?.colorFilter || 'cinematic_warm'}
                          onChange={(e) => {
                            const cur = selectedClip.antiCopyright || { enabled: true, flipHorizontal: true, zoomScale: 1.04, microSpeed: 1.05, filmGrain: false, vignette: true };
                            handleUpdateClip(selectedClip.id, {
                              antiCopyright: { ...cur, enabled: true, colorFilter: e.target.value as any }
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-khmer focus:outline-none focus:border-emerald-500"
                        >
                          <option value="cinematic_warm">🎬 ភាពយន្តក្តៅ (Cinematic Warm)</option>
                          <option value="cinematic_cool">❄️ ភាពយន្តត្រជាក់ (Cinematic Cool)</option>
                          <option value="golden_hour">🌅 ពណ៌មាសស្រស់ (Golden Hour)</option>
                          <option value="vibrant_boost">✨ បង្កើនពណ៌ស្រស់ (Vibrant Boost)</option>
                          <option value="film_noir">🎞️ សខ្មៅភាពយន្ត (Film Noir)</option>
                          <option value="none">ដើម (None)</option>
                        </select>
                      </div>

                      {/* 4. Vignette & Film Grain Toggles */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-850">
                        <label className="flex items-center gap-2 text-[10px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedClip.antiCopyright?.vignette ?? true}
                            onChange={(e) => {
                              const cur = selectedClip.antiCopyright || { enabled: true, flipHorizontal: true, zoomScale: 1.04, colorFilter: 'cinematic_warm', microSpeed: 1.05, filmGrain: false };
                              handleUpdateClip(selectedClip.id, {
                                antiCopyright: { ...cur, enabled: true, vignette: e.target.checked }
                              });
                            }}
                            className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                          />
                          <span>ស្រមោលគែម (Vignette)</span>
                        </label>

                        <label className="flex items-center gap-2 text-[10px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedClip.antiCopyright?.filmGrain ?? false}
                            onChange={(e) => {
                              const cur = selectedClip.antiCopyright || { enabled: true, flipHorizontal: true, zoomScale: 1.04, colorFilter: 'cinematic_warm', microSpeed: 1.05, vignette: true };
                              handleUpdateClip(selectedClip.id, {
                                antiCopyright: { ...cur, enabled: true, filmGrain: e.target.checked }
                              });
                            }}
                            className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                          />
                          <span>Micro Film Grain</span>
                        </label>
                      </div>

                    </div>

                    {/* Apply to All Clips Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const currentAc = selectedClip.antiCopyright || {
                          enabled: true,
                          flipHorizontal: true,
                          zoomScale: 1.04,
                          colorFilter: 'cinematic_warm',
                          microSpeed: 1.05,
                          filmGrain: false,
                          vignette: true
                        };
                        const updatedClips = clips.map((c) => ({
                          ...c,
                          antiCopyright: { ...currentAc, enabled: true }
                        }));
                        onUpdateSeriesProject({ ...seriesProject, clips: updatedClips });
                        showToast(
                          'success',
                          '🌟 បានអនុវត្តលើគ្រប់ភាគទាំងអស់',
                          `មុខងារការពារ Copyright ត្រូវបានដាក់បញ្ចូលលើភាគទាំង ${clips.length} ភាគ`
                        );
                      }}
                      className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold font-khmer text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>អនុវត្តលើគ្រប់ភាគទាំងអស់ ({clips.length})</span>
                    </button>

                  </div>
                )
              ) : (
                <div className="py-8 text-center text-xs text-slate-500 font-khmer">
                  សូមចុចលើភាគណាមួយក្នុង Timeline ខាងក្រោមដើម្បីកែប្រែ
                </div>
              )}
            </div>

            {/* Quick Clip List Mini-Sidebar with Video Thumbnails & Drag-and-Drop Reordering */}
            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 font-khmer">
                <span className="flex items-center gap-1 font-bold text-slate-300">
                  <span>លំដាប់ភាគទាំងអស់</span>
                  <span className="bg-blue-600/30 text-blue-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {clips.length}
                  </span>
                </span>
                <span className="font-mono text-slate-300 text-[10px]">
                  សរុប {formatTimecode(totalDuration)}
                </span>
              </div>

              <div className="max-h-48 sm:max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5">
                {clips.map((clip, idx) => {
                  const isSelected = clip.id === selectedClipId;
                  const isDragging = draggedClipIndex === idx;
                  const isOver = dragOverIndex === idx;

                  return (
                    <div
                      key={clip.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedClipIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverIndex !== idx) setDragOverIndex(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === idx) setDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedClipIndex !== null && draggedClipIndex !== idx) {
                          handleReorderClips(draggedClipIndex, idx);
                        }
                        setDraggedClipIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedClipIndex(null);
                        setDragOverIndex(null);
                      }}
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`group/clip relative flex items-center gap-2 p-1.5 rounded-xl text-xs cursor-pointer transition-all border select-none ${
                        isDragging ? 'opacity-40 scale-95 border-dashed border-blue-400' : ''
                      } ${
                        isOver ? 'border-t-2 border-t-amber-400' : ''
                      } ${
                        isSelected
                          ? 'bg-blue-600/25 border-blue-500/60 shadow-md shadow-blue-600/10'
                          : 'bg-slate-950/70 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700'
                      }`}
                      title={`អូសដើម្បីតម្រៀប ឬចុចដើម្បីកែប្រែភាគ ${idx + 1}`}
                    >
                      {/* Drag Handle */}
                      <div className="text-slate-600 hover:text-slate-300 cursor-grab active:cursor-grabbing p-0.5 shrink-0">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      {/* Video Thumbnail Preview */}
                      <div className="relative w-14 h-9 sm:w-16 sm:h-10 rounded-lg overflow-hidden bg-black shrink-0 border border-slate-700/80 shadow-2xs">
                        {clip.videoUrl ? (
                          <video
                            src={getSafeMediaUrl(clip.videoUrl)}
                            preload="metadata"
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                            onLoadedMetadata={(e) => {
                              const v = e.currentTarget;
                              if (v.duration > 2) v.currentTime = 1.0;
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                            <Film className="w-4 h-4" />
                          </div>
                        )}
                        <span className="absolute bottom-0.5 right-0.5 bg-black/85 text-white font-mono text-[8px] px-1 rounded font-bold">
                          {formatTimecode(getClipEffectiveDuration(clip))}
                        </span>
                        <span className="absolute top-0.5 left-0.5 bg-blue-600/90 text-white font-khmer text-[8px] px-1 rounded font-bold shadow-2xs">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Title & Badges */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className={`text-[11px] font-bold font-khmer truncate ${
                            isSelected ? 'text-blue-200' : 'text-slate-200'
                          }`}>
                            {clip.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-slate-400">
                          {clip.bgmTrackUrl && (
                            <span className="text-emerald-400 bg-emerald-950/70 border border-emerald-800/40 px-1 rounded flex items-center gap-0.5">
                              <Music className="w-2.5 h-2.5" />
                              <span>BGM</span>
                            </span>
                          )}
                          <span className="font-mono text-slate-400">
                            {(clip.segments || []).length} lines
                          </span>
                        </div>
                      </div>

                      {/* Move Up / Down Quick Reorder Buttons */}
                      <div className="flex flex-col items-center gap-0.5 opacity-60 group-hover/clip:opacity-100 transition shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorderClips(idx, idx - 1);
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition ${
                            idx === 0 ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title="រំកិលឡើងលើ (Move Up)"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === clips.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorderClips(idx, idx + 1);
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition ${
                            idx === clips.length - 1 ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title="រំកិលចុះក្រោម (Move Down)"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Multi-Track CapCut Timeline */}
        <div className="flex-1 min-h-[220px]">
          <SequenceTimeline
            clips={clips}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            globalCurrentTime={globalCurrentTime}
            onSeekGlobalTime={setGlobalCurrentTime}
            onUpdateClip={handleUpdateClip}
            onDeleteClip={handleDeleteClip}
            onDuplicateClip={handleDuplicateClip}
            onReorderClips={handleReorderClips}
            onSplitClipAtPlayhead={handleSplitClipAtPlayhead}
            onOpenLibraryModal={() => setIsLibraryOpen(true)}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
          />
        </div>
      </div>
    </div>

      {/* 2.5. 1-Click Server MP4 Video Rendering Export Modal */}
      {isExportModalOpen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          recapData={activeRecapForExport}
          antiCopyright={selectedClip?.antiCopyright || seriesProject.antiCopyright}
          watermark={watermarkState}
        />
      )}

      {/* 2.6. Channel Watermark Customizer Modal */}
      <WatermarkModal
        isOpen={isWatermarkModalOpen}
        onClose={() => setIsWatermarkModalOpen(false)}
        config={watermarkState}
        onSaveConfig={handleSaveWatermark}
      />

      {/* 3. Clip Library Modal */}
      <ClipLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onAddClipToSequence={handleAddClip}
        onAddMultipleClips={handleAddMultipleClips}
        existingClipsCount={clips.length}
        savedRecaps={savedRecaps}
      />

      {/* 4. Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

    </div>
  );
};
