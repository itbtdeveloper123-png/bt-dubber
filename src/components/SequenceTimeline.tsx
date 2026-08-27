import React, { useRef, useState, useEffect } from 'react';
import { 
  Scissors, Trash2, Copy, ArrowLeft, ArrowRight, Plus, 
  ZoomIn, ZoomOut, Film, Mic, Music, Volume2, Gauge, Clock, Layers, Sparkles, Check
} from 'lucide-react';
import { EpisodeClip } from '../types';
import { 
  formatTimecode, 
  getClipEffectiveDuration, 
  getTotalSequenceDuration, 
  mapGlobalTimeToClip 
} from '../utils/sequenceUtils';

interface SequenceTimelineProps {
  clips: EpisodeClip[];
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  globalCurrentTime: number;
  onSeekGlobalTime: (time: number) => void;
  onUpdateClip: (clipId: string, updates: Partial<EpisodeClip>) => void;
  onDeleteClip: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  onReorderClips: (fromIndex: number, toIndex: number) => void;
  onSplitClipAtPlayhead: () => void;
  onOpenLibraryModal: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

export const SequenceTimeline: React.FC<SequenceTimelineProps> = ({
  clips,
  selectedClipId,
  onSelectClip,
  globalCurrentTime,
  onSeekGlobalTime,
  onUpdateClip,
  onDeleteClip,
  onDuplicateClip,
  onReorderClips,
  onSplitClipAtPlayhead,
  onOpenLibraryModal,
  isPlaying,
  onTogglePlay
}) => {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 0.5 to 2.5
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingTrim, setDraggingTrim] = useState<{
    clipId: string;
    type: 'start' | 'end';
    initialX: number;
    initialTrim: number;
    clipDuration: number;
  } | null>(null);

  const totalDuration = getTotalSequenceDuration(clips);
  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const selectedIndex = clips.findIndex((c) => c.id === selectedClipId);

  // Pixels per second based on zoom level (base: 18px / sec)
  const pxPerSec = Math.max(8, Math.min(80, 20 * zoomLevel));
  const timelineWidth = Math.max(900, Math.ceil((totalDuration + 20) * pxPerSec));

  // Handle Scrubbing Click & Drag
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingTrim) return;
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const targetSeconds = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
    onSeekGlobalTime(targetSeconds);
    setIsScrubbing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left + timelineRef.current.scrollLeft;
        const targetSeconds = Math.max(0, Math.min(totalDuration, mouseX / pxPerSec));
        onSeekGlobalTime(targetSeconds);
      }

      if (draggingTrim) {
        const deltaX = e.clientX - draggingTrim.initialX;
        const deltaSeconds = deltaX / pxPerSec;
        
        if (draggingTrim.type === 'start') {
          const newTrimStart = Math.max(0, Math.min(draggingTrim.clipDuration - 1, draggingTrim.initialTrim + deltaSeconds));
          onUpdateClip(draggingTrim.clipId, { trimStart: Math.round(newTrimStart * 10) / 10 });
        } else {
          const newTrimEnd = Math.max(0, Math.min(draggingTrim.clipDuration - 1, draggingTrim.initialTrim - deltaSeconds));
          onUpdateClip(draggingTrim.clipId, { trimEnd: Math.round(newTrimEnd * 10) / 10 });
        }
      }
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      setDraggingTrim(null);
    };

    if (isScrubbing || draggingTrim) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, draggingTrim, totalDuration, pxPerSec, onSeekGlobalTime, onUpdateClip]);

  // Generate Ruler Marks
  const rulerInterval = zoomLevel < 0.8 ? 10 : zoomLevel > 1.6 ? 2 : 5;
  const rulerMarks = [];
  const maxRulerTime = Math.ceil(totalDuration + 30);
  for (let s = 0; s <= maxRulerTime; s += rulerInterval) {
    rulerMarks.push(s);
  }

  // Playhead position in px
  const playheadPx = globalCurrentTime * pxPerSec;

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-sans select-none">
      
      {/* 1. CapCut Timeline Toolbar */}
      <div className="bg-slate-950/80 border-b border-slate-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Left: Action Tools */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Split at Playhead */}
          <button
            onClick={onSplitClipAtPlayhead}
            disabled={!selectedClip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 hover:text-white rounded-xl font-khmer font-bold transition border border-slate-700 shadow-sm cursor-pointer active:scale-95"
            title="Split Clip at Playhead (ពុះវីដេអូត្រង់ Playhead)"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">ពុះ (Split)</span>
          </button>

          {/* Move Left */}
          <button
            onClick={() => selectedIndex > 0 && onReorderClips(selectedIndex, selectedIndex - 1)}
            disabled={selectedIndex <= 0}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-xl transition border border-slate-700 cursor-pointer"
            title="Move Clip Left (រំកិលទៅឆ្វេង)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>

          {/* Move Right */}
          <button
            onClick={() => selectedIndex >= 0 && selectedIndex < clips.length - 1 && onReorderClips(selectedIndex, selectedIndex + 1)}
            disabled={selectedIndex < 0 || selectedIndex >= clips.length - 1}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-xl transition border border-slate-700 cursor-pointer"
            title="Move Clip Right (រំកិលទៅស្តាំ)"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Duplicate Clip */}
          <button
            onClick={() => selectedClipId && onDuplicateClip(selectedClipId)}
            disabled={!selectedClipId}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-xl transition border border-slate-700 cursor-pointer"
            title="Duplicate Clip (ចម្លងភាគ)"
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
          </button>

          {/* Delete Clip */}
          <button
            onClick={() => selectedClipId && onDeleteClip(selectedClipId)}
            disabled={!selectedClipId}
            className="p-1.5 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-300 disabled:opacity-30 rounded-xl transition border border-slate-700 cursor-pointer"
            title="Delete Selected Clip (លុបភាគនេះ)"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>

          <div className="h-4 w-[1px] bg-slate-700 mx-1 hidden sm:block" />

          {/* Speed Adjuster for Selected Clip */}
          {selectedClip && (
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
              <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-slate-400 font-khmer">ល្បឿន:</span>
              {[1.0, 1.25, 1.5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => onUpdateClip(selectedClip.id, { speed: spd })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                    (selectedClip.speed || 1) === spd
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Zoom & Add Clip Button */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
              className="p-1 text-slate-400 hover:text-white rounded transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 w-10 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
              className="p-1 text-slate-400 hover:text-white rounded transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Episode / Clip Button */}
          <button
            onClick={onOpenLibraryModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-khmer font-bold shadow-lg shadow-blue-600/20 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>បន្ថែមភាគ (Add Episode)</span>
          </button>
        </div>
      </div>

      {/* 2. Timeline Tracks Body */}
      <div 
        ref={timelineRef}
        onMouseDown={handleTimelineMouseDown}
        className="relative overflow-x-auto overflow-y-hidden p-4 bg-slate-950/60 min-h-[220px] max-h-[340px] cursor-pointer custom-scrollbar select-none"
      >
        <div 
          style={{ width: `${timelineWidth}px` }} 
          className="relative flex flex-col space-y-2.5 pb-6"
        >
          {/* Red Playhead Vertical Needle */}
          <div
            style={{ transform: `translateX(${playheadPx}px)` }}
            className="absolute top-0 bottom-0 z-40 pointer-events-none transition-transform duration-75 flex flex-col items-center"
          >
            {/* Playhead Handle */}
            <div className="w-3.5 h-3.5 bg-red-500 rounded-b-md shadow-lg shadow-red-500/50 flex items-center justify-center -translate-y-1">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
            {/* Playhead Line */}
            <div className="w-[1.5px] flex-1 bg-red-500 shadow-sm shadow-red-500" />
          </div>

          {/* Time Ruler */}
          <div className="h-6 w-full border-b border-slate-800/80 relative flex items-end">
            {rulerMarks.map((sec) => (
              <div
                key={sec}
                style={{ left: `${sec * pxPerSec}px` }}
                className="absolute bottom-0 flex flex-col items-start"
              >
                <div className="h-2 w-[1px] bg-slate-700" />
                <span className="text-[9px] font-mono text-slate-500 -translate-x-1/2 select-none">
                  {formatTimecode(sec)}
                </span>
              </div>
            ))}
          </div>

          {/* Track 1: Video Clips Track */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 font-khmer">
              <Film className="w-3 h-3 text-blue-400" />
              <span>Track 1: វីដេអូរឿងតាមភាគ (Video Clips)</span>
            </div>

            <div className="h-20 bg-slate-900/90 rounded-xl border border-slate-800/90 relative flex items-center p-1.5 overflow-hidden">
              {clips.length > 0 ? (
                <div className="flex items-center h-full space-x-1.5">
                  {clips.map((clip, idx) => {
                    const effDuration = getClipEffectiveDuration(clip);
                    const widthPx = Math.max(100, effDuration * pxPerSec);
                    const isSelected = clip.id === selectedClipId;

                    return (
                      <div
                        key={clip.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectClip(clip.id);
                        }}
                        style={{ width: `${widthPx}px` }}
                        className={`group relative h-full rounded-lg transition-all flex flex-col justify-between p-2 cursor-pointer shadow-md overflow-hidden ${
                          isSelected
                            ? 'bg-gradient-to-r from-blue-900/90 via-indigo-900/90 to-blue-800/90 border-2 border-blue-400 ring-2 ring-blue-500/30'
                            : 'bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80'
                        }`}
                      >
                        {/* Left Trim Handle (In-Point) */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingTrim({
                              clipId: clip.id,
                              type: 'start',
                              initialX: e.clientX,
                              initialTrim: clip.trimStart || 0,
                              clipDuration: clip.duration || 10
                            });
                          }}
                          className="absolute left-0 top-0 bottom-0 w-2.5 bg-amber-500/40 hover:bg-amber-400 cursor-ew-resize opacity-0 group-hover:opacity-100 transition z-20 flex items-center justify-center"
                          title="Drag to trim start (កាត់ក្បាល)"
                        >
                          <div className="w-[1.5px] h-4 bg-white/80 rounded" />
                        </div>

                        {/* Top Info Header */}
                        <div className="flex items-center justify-between gap-1 min-w-0 z-10">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="bg-blue-600 text-white font-bold text-[9px] px-1.5 py-0.2 rounded shrink-0 font-khmer">
                              ភាគ {clip.episodeNumber}
                            </span>
                            <span className="text-[11px] font-bold text-slate-200 truncate font-khmer">
                              {clip.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-blue-300 font-bold shrink-0 bg-black/40 px-1 py-0.2 rounded">
                            {formatTimecode(effDuration)}
                          </span>
                        </div>

                        {/* Bottom Tags & Speed */}
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono z-10">
                          <span>Cut: {clip.trimStart || 0}s ~ {(clip.trimEnd || 0)}s</span>
                          {clip.speed && clip.speed !== 1 && (
                            <span className="text-emerald-400 font-bold font-mono">⚡{clip.speed}x</span>
                          )}
                        </div>

                        {/* Right Trim Handle (Out-Point) */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingTrim({
                              clipId: clip.id,
                              type: 'end',
                              initialX: e.clientX,
                              initialTrim: clip.trimEnd || 0,
                              clipDuration: clip.duration || 10
                            });
                          }}
                          className="absolute right-0 top-0 bottom-0 w-2.5 bg-amber-500/40 hover:bg-amber-400 cursor-ew-resize opacity-0 group-hover:opacity-100 transition z-20 flex items-center justify-center"
                          title="Drag to trim end (កាត់កន្ទុយ)"
                        >
                          <div className="w-[1.5px] h-4 bg-white/80 rounded" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="w-full text-center text-xs text-slate-500 font-khmer flex items-center justify-center gap-2">
                  <span>ទទេ (មិនទាន់មានវីដេអូ) — ចុច "➕ បន្ថែមភាគ" ខាងលើដើម្បីចាប់ផ្តើម</span>
                </div>
              )}
            </div>
          </div>

          {/* Track 2: Dubbed Speech & Subtitles Track */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 font-khmer">
              <Mic className="w-3 h-3 text-purple-400" />
              <span>Track 2: សំឡេងបកប្រែ & អត្ថបទ Subtitles (Dubbed Audio)</span>
            </div>

            <div className="h-10 bg-slate-900/70 rounded-xl border border-slate-800/80 relative flex items-center p-1 overflow-hidden">
              <div className="flex items-center h-full space-x-1.5">
                {clips.map((clip) => {
                  const effDuration = getClipEffectiveDuration(clip);
                  const widthPx = Math.max(100, effDuration * pxPerSec);
                  const segmentsCount = clip.segments?.length || 0;

                  return (
                    <div
                      key={`dub_${clip.id}`}
                      style={{ width: `${widthPx}px` }}
                      className="h-full bg-purple-950/60 border border-purple-800/50 rounded-md px-2 flex items-center justify-between text-[10px] text-purple-300 font-khmer overflow-hidden shrink-0"
                    >
                      <span className="truncate">🎙️ {segmentsCount} ឃ្លាបកប្រែ</span>
                      <span className="font-mono text-[9px] text-purple-400 shrink-0">
                        {formatTimecode(effDuration)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Track 3: BGM Background Music Track */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 font-khmer">
              <Music className="w-3 h-3 text-emerald-400" />
              <span>Track 3: តន្ត្រីផ្ទៃក្រោយ (Background Instrumental BGM)</span>
            </div>

            <div className="h-8 bg-slate-900/60 rounded-xl border border-slate-800/70 relative flex items-center p-1 overflow-hidden">
              <div className="flex items-center h-full space-x-1.5">
                {clips.map((clip) => {
                  const effDuration = getClipEffectiveDuration(clip);
                  const widthPx = Math.max(100, effDuration * pxPerSec);

                  return (
                    <div
                      key={`bgm_${clip.id}`}
                      style={{ width: `${widthPx}px` }}
                      className="h-full bg-emerald-950/50 border border-emerald-800/40 rounded-md px-2 flex items-center justify-between text-[10px] text-emerald-300 font-khmer overflow-hidden shrink-0"
                    >
                      <span className="truncate">🎵 {clip.bgmTrackUrl ? 'AI BGM Track' : 'Cinematic Beat'}</span>
                      <span className="font-mono text-[9px] text-emerald-400">100%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
