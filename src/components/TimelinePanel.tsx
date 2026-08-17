import React, { useState, useRef, useEffect } from 'react';
import { RecapSegment, MovieRecapResult } from '../types';
import { AudioIsolationMode } from './VideoMonitor';
import { 
  Play, Pause, SkipBack, SkipForward, Scissors, Eye, Lock, 
  Volume2, VolumeX, Music, Type, Video, ZoomIn, ZoomOut, Sparkles, MicOff, Volume1
} from 'lucide-react';

interface TimelinePanelProps {
  recapData?: MovieRecapResult | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeSegmentId: number;
  setActiveSegmentId: (id: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  onSeekToSeconds: (seconds: number) => void;
  audioIsolationMode: AudioIsolationMode;
  bgmVolume: number;
  onChangeBgmVolume?: (vol: number) => void;
  onExtractBgm?: () => void;
  isExtractingBgm?: boolean;
  onSegmentChange?: (id: number, field: keyof RecapSegment, value: any) => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  recapData,
  videoRef,
  activeSegmentId,
  setActiveSegmentId,
  isPlaying,
  onTogglePlay,
  currentTimeSeconds,
  totalDurationSeconds,
  onSeekToSeconds,
  audioIsolationMode,
  bgmVolume,
  onChangeBgmVolume,
  onExtractBgm,
  isExtractingBgm,
  onSegmentChange
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [videoThumbnails, setVideoThumbnails] = useState<string[]>([]);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  // Segment dragging state
  const [draggingSegmentId, setDraggingSegmentId] = useState<number | null>(null);
  const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const dragStartPosRef = useRef<{ clientX: number; startSec: number; endSec: number } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  const parseTimeToSec = (str: string) => {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return 0;
  };

  const formatSecondsToMMSS = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const maxSegmentEnd = recapData?.recap_segments?.reduce((max, s) => {
    const endSec = parseTimeToSec(s.end_time);
    return Math.max(max, endSec);
  }, 0) || 0;

  const duration = totalDurationSeconds && totalDurationSeconds > 0
    ? totalDurationSeconds
    : (maxSegmentEnd > 0 ? maxSegmentEnd + 10 : 279);

  // Extract actual video thumbnails from video URL
  useEffect(() => {
    if (!recapData?.videoUrl || duration <= 0) {
      setVideoThumbnails([]);
      return;
    }

    let isCancelled = false;
    const video = document.createElement('video');
    video.src = recapData.videoUrl;
    video.muted = true;
    video.playsInline = true;
    
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 68;
    const ctx = canvas.getContext('2d');

    const thumbs: string[] = [];
    const count = 10;

    const captureFrames = async () => {
      await new Promise((res) => {
        video.onloadedmetadata = res;
        video.onerror = res;
        setTimeout(res, 2000);
      });

      for (let i = 0; i < count; i++) {
        if (isCancelled) break;
        const targetTime = (duration / count) * i;
        video.currentTime = targetTime;
        await new Promise((res) => {
          video.onseeked = res;
          setTimeout(res, 150);
        });
        if (ctx && video.videoWidth > 0) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbs.push(canvas.toDataURL('image/jpeg', 0.6));
          } catch (canvasErr) {
            // Tainted canvas on external cross-origin video, ignore gracefully
          }
        }
      }

      if (!isCancelled && thumbs.length > 0) {
        setVideoThumbnails(thumbs);
      }
    };

    captureFrames().catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [recapData?.videoUrl, duration]);

  // Handle Timeline Playhead Dragging & Scrubbing
  const updatePlayheadPosition = (clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickPercent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSeconds = clickPercent * duration;
    onSeekToSeconds(targetSeconds);
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingSegmentId !== null) return;
    setIsDraggingPlayhead(true);
    updatePlayheadPosition(e.clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPlayhead) {
        updatePlayheadPosition(e.clientX);
      } else if (draggingSegmentId !== null && dragStartPosRef.current && onSegmentChange && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const deltaX = e.clientX - dragStartPosRef.current.clientX;
        const deltaSec = (deltaX / rect.width) * duration;

        const { startSec, endSec } = dragStartPosRef.current;
        const origLength = Math.max(3, endSec - startSec);

        if (dragType === 'move') {
          let newStart = Math.max(0, Math.min(duration - origLength, startSec + deltaSec));
          let newEnd = newStart + origLength;
          onSegmentChange(draggingSegmentId, 'start_time', formatSecondsToMMSS(newStart));
          onSegmentChange(draggingSegmentId, 'end_time', formatSecondsToMMSS(newEnd));
        } else if (dragType === 'resize-left') {
          let newStart = Math.max(0, Math.min(endSec - 2, startSec + deltaSec));
          onSegmentChange(draggingSegmentId, 'start_time', formatSecondsToMMSS(newStart));
        } else if (dragType === 'resize-right') {
          let newEnd = Math.max(startSec + 2, Math.min(duration, endSec + deltaSec));
          onSegmentChange(draggingSegmentId, 'end_time', formatSecondsToMMSS(newEnd));
        }
      }
    };

    const handleMouseUp = () => {
      if (isDraggingPlayhead) {
        setIsDraggingPlayhead(false);
      }
      if (draggingSegmentId !== null) {
        setDraggingSegmentId(null);
        setDragType(null);
        dragStartPosRef.current = null;
      }
    };

    if (isDraggingPlayhead || draggingSegmentId !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, draggingSegmentId, dragType, duration, onSegmentChange]);

  const handleStartSegmentDrag = (
    e: React.MouseEvent,
    segment: RecapSegment,
    type: 'move' | 'resize-left' | 'resize-right'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveSegmentId(segment.segment_id);
    const startSec = parseTimeToSec(segment.start_time);
    let endSec = parseTimeToSec(segment.end_time);
    if (endSec <= startSec) endSec = startSec + 15;

    setDraggingSegmentId(segment.segment_id);
    setDragType(type);
    dragStartPosRef.current = {
      clientX: e.clientX,
      startSec,
      endSec
    };

    onSeekToSeconds(startSec);
  };

  const playheadPercent = Math.min(100, Math.max(0, (currentTimeSeconds / duration) * 100));

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs flex flex-col select-none">
      
      {/* Top Transport Toolbar */}
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-700">
        
        {/* Left Tools: Select, Cut/Split */}
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <button className="p-1 sm:p-1.5 rounded hover:bg-gray-200 text-gray-700 transition" title="Select Tool">
            <span className="font-bold text-xs">⋮≡</span>
          </button>
          <button className="p-1 sm:p-1.5 rounded hover:bg-gray-200 text-gray-700 transition" title="Split Track">
            <Scissors className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] sm:text-[11px] font-mono text-gray-500 border-l pl-1.5 sm:pl-2 border-gray-300 truncate max-w-[80px] sm:max-w-[140px] md:max-w-[220px]">
            <strong className="text-gray-800 font-semibold">{recapData?.videoFileName || 'Video Track Sync'}</strong>
          </span>
        </div>

        {/* Center Transport Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button 
            onClick={() => onSeekToSeconds(Math.max(0, currentTimeSeconds - 5))}
            className="p-1 hover:bg-gray-200 rounded text-gray-700 transition"
            title="Rewind 5s"
          >
            <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-gray-700" />
          </button>

          <button
            onClick={onTogglePlay}
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-xs transition active:scale-95 cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-white" />
            ) : (
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-white ml-0.5" />
            )}
          </button>

          <button 
            onClick={() => onSeekToSeconds(Math.min(duration, currentTimeSeconds + 5))}
            className="p-1 hover:bg-gray-200 rounded text-gray-700 transition"
            title="Forward 5s"
          >
            <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-gray-700" />
          </button>

          <div className="font-mono font-bold text-gray-900 bg-gray-200 px-2 sm:px-2.5 py-0.5 rounded border border-gray-300 text-[10px] sm:text-xs">
            {formatSecondsToMMSS(currentTimeSeconds)} / {formatSecondsToMMSS(duration)}
          </div>
        </div>

        {/* Right Tools: Zoom Slider */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            className="w-14 sm:w-20 accent-blue-600 cursor-pointer"
          />
          <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
        </div>

      </div>

      {/* Main Multi-Track Section */}
      <div className="flex bg-gray-50/50 overflow-x-auto relative">
        
        {/* Track Headers (Left Column) */}
        <div className="w-32 sm:w-40 md:w-44 xl:w-48 bg-gray-100 border-r border-gray-200 shrink-0 font-mono text-[10px] sm:text-[11px] text-gray-700 z-10 select-none">
          
          <div className="h-5 sm:h-6 border-b border-gray-200 bg-gray-200/60 px-2 flex items-center font-bold text-[9px] sm:text-[10px] text-gray-500">
            TRACKS
          </div>

          {/* Track 1: Background Video */}
          <div className="h-10 sm:h-12 border-b border-gray-200 px-2 sm:px-2.5 flex items-center justify-between bg-white/80">
            <div className="flex items-center gap-1 sm:gap-1.5 font-semibold text-gray-900 truncate">
              <Video className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">Video Track</span>
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 hover:text-gray-700 cursor-pointer" />
              <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 hover:text-gray-700 cursor-pointer" />
            </div>
          </div>

          {/* Track 2: Original Video Audio */}
          <div className="h-7 sm:h-8 border-b border-gray-200 px-2 sm:px-2.5 flex items-center justify-between bg-white/40">
            <div className="flex items-center gap-1 sm:gap-1.5 font-medium truncate">
              {audioIsolationMode === 'remove_vocals_keep_bgm' ? (
                <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
              ) : audioIsolationMode === 'smart_ducking' ? (
                <Volume1 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 shrink-0" />
              ) : audioIsolationMode === 'mute_all_original' ? (
                <VolumeX className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 shrink-0" />
              ) : (
                <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 shrink-0" />
              )}
              <span className="truncate">
                {audioIsolationMode === 'remove_vocals_keep_bgm'
                  ? 'No Vocal (BGM)'
                  : audioIsolationMode === 'smart_ducking'
                  ? 'Ducked Audio'
                  : audioIsolationMode === 'mute_all_original'
                  ? 'Muted Audio'
                  : 'Orig. Audio'}
              </span>
            </div>
          </div>

          {/* Track 3: Dubber AI Speech Track */}
          <div className="h-9 sm:h-10 border-b border-gray-200 px-2 sm:px-2.5 flex items-center justify-between bg-blue-50/80">
            <div className="flex items-center gap-1 sm:gap-1.5 font-bold text-blue-900 truncate">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 fill-blue-600 shrink-0" />
              <span className="truncate">Khmer Dubber</span>
            </div>
            <span className="text-[8px] sm:text-[9px] bg-blue-600 text-white font-bold px-1 rounded">AI</span>
          </div>

          {/* Track 4: Background Music */}
          <div className="h-7 sm:h-8 border-b border-gray-200 px-2 sm:px-2.5 flex items-center justify-between bg-emerald-50/40">
            <div className="flex items-center gap-1 sm:gap-1.5 font-medium text-emerald-900 truncate">
              <Music className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">BGM ({bgmVolume}%)</span>
            </div>
          </div>

          {/* Track 5: Subtitle / Captions Track */}
          <div className="h-7 sm:h-8 border-b border-gray-200 px-2 sm:px-2.5 flex items-center justify-between bg-white/40">
            <div className="flex items-center gap-1 sm:gap-1.5 font-medium truncate">
              <Type className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 shrink-0" />
              <span className="truncate">Subtitles</span>
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 hover:text-gray-700 cursor-pointer" />
              <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 hover:text-gray-700 cursor-pointer" />
            </div>
          </div>

        </div>

        {/* Timeline Canvas & Playhead Tracks */}
        <div 
          ref={timelineRef}
          onMouseDown={handleTimelineMouseDown}
          className={`flex-1 relative min-w-[500px] bg-white overflow-hidden cursor-crosshair ${
            isDraggingPlayhead ? 'cursor-ew-resize' : ''
          }`}
          style={{ width: `${100 * zoomLevel}%` }}
        >
          {/* Draggable Vertical Scrubbing Playhead Indicator */}
          <div 
            className="absolute top-0 bottom-0 w-[2px] bg-blue-600 z-40 cursor-ew-resize transition-all duration-75 group"
            style={{ left: `${playheadPercent}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDraggingPlayhead(true);
            }}
          >
            {/* Top Playhead Handle Knob */}
            <div className="w-3.5 h-4 sm:w-4 sm:h-5 bg-blue-600 hover:bg-blue-700 rounded-b-md -translate-x-[6px] sm:-translate-x-[7px] shadow-md flex items-center justify-center cursor-ew-resize">
              <div className="w-0.5 h-1.5 sm:h-2 bg-white/80 rounded-full" />
            </div>

            {/* Timecode Tooltip overlay while scrubbing */}
            {(isDraggingPlayhead || draggingSegmentId !== null) && (
              <div className="absolute top-5 sm:top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white font-mono font-bold text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded shadow-lg whitespace-nowrap border border-gray-700 z-50">
                {formatSecondsToMMSS(currentTimeSeconds)}
              </div>
            )}
          </div>

          {/* Timeline Ruler calibrated directly to Video duration */}
          <div className="h-5 sm:h-6 border-b border-gray-200 bg-gray-100 font-mono text-[9px] sm:text-[10px] text-gray-600 relative flex items-center">
            {Array.from({ length: 11 }).map((_, i) => {
              const tickTime = (duration / 10) * i;
              const tickPercent = (i / 10) * 100;
              return (
                <div 
                  key={i} 
                  className="absolute top-0 bottom-0 border-l border-gray-300 pl-1 pt-0.5 flex items-start"
                  style={{ left: `${tickPercent}%` }}
                >
                  <span className="font-bold">{formatSecondsToMMSS(tickTime)}</span>
                </div>
              );
            })}
          </div>

          {/* Track 1: Background Video Filmstrip */}
          <div className="h-10 sm:h-12 border-b border-gray-200 bg-gray-900/10 relative flex items-center px-1 overflow-hidden">
            {videoThumbnails.length > 0 ? (
              <div className="w-full h-8 sm:h-10 flex rounded overflow-hidden border border-gray-300 shadow-2xs">
                {videoThumbnails.map((thumb, idx) => (
                  <div key={idx} className="flex-1 h-full border-r border-black/20 overflow-hidden relative">
                    <img src={thumb} alt={`Frame ${idx}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full h-8 sm:h-10 bg-blue-900/20 border border-blue-400/40 rounded flex items-center px-2 sm:px-3 gap-2 overflow-hidden">
                <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                <span className="text-[10px] sm:text-xs font-mono text-blue-950 font-semibold truncate">
                  {recapData?.videoFileName || 'video_stream_01.mp4'} ({formatSecondsToMMSS(duration)})
                </span>
              </div>
            )}
          </div>

          {/* Track 2: Original Video Audio Waveform + Vocal Isolation Badge */}
          <div className="h-7 sm:h-8 border-b border-gray-200 bg-gray-50 relative flex items-center px-1">
            <div className={`w-full h-5 sm:h-6 rounded flex items-center px-2 border overflow-hidden ${
              audioIsolationMode === 'remove_vocals_keep_bgm'
                ? 'bg-emerald-50 border-emerald-300'
                : audioIsolationMode === 'smart_ducking'
                ? 'bg-blue-50 border-blue-300'
                : audioIsolationMode === 'mute_all_original'
                ? 'bg-amber-50 border-amber-200 opacity-40'
                : 'bg-gray-200/80 border-gray-300/60'
            }`}>
              <span className="text-[9px] sm:text-[10px] font-khmer font-bold truncate mr-2 text-gray-800">
                {audioIsolationMode === 'remove_vocals_keep_bgm'
                  ? '🎙️ [លុបសំឡេងនិយាយ - រក្សា BGM]'
                  : audioIsolationMode === 'smart_ducking'
                  ? '🔉 [កាត់សំឡេងដើម 80%]'
                  : audioIsolationMode === 'mute_all_original'
                  ? '🔇 [បិទសំឡេងដើម]'
                  : '🔊 [សំឡេងដើម 100%]'}
              </span>
              <div className="flex-1 h-3 sm:h-4 flex items-center gap-0.5 opacity-60">
                {Array.from({ length: 60 }).map((_, idx) => {
                  const isSpeechFreq = idx % 3 === 0;
                  const h = audioIsolationMode === 'remove_vocals_keep_bgm' && isSpeechFreq
                    ? 2
                    : audioIsolationMode === 'mute_all_original'
                    ? 1
                    : Math.floor(Math.sin(idx * 0.4) * 6 + 6);
                  return (
                    <div 
                      key={idx} 
                      className={`w-1 rounded-full ${
                        audioIsolationMode === 'remove_vocals_keep_bgm' ? 'bg-emerald-600' : 'bg-gray-600'
                      }`} 
                      style={{ height: `${h}px` }} 
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Track 3: Draggable AI Speech Segments (Can be dragged left/right & resized) */}
          <div className="h-9 sm:h-10 border-b border-gray-200 bg-blue-50/40 relative flex items-center px-1">
            {recapData?.recap_segments?.map((seg) => {
              const startSec = parseTimeToSec(seg.start_time);
              let endSec = parseTimeToSec(seg.end_time);
              if (endSec <= startSec) endSec = startSec + 15;
              
              const startPct = Math.min(95, (startSec / duration) * 100);
              const widthPct = Math.max(4, Math.min(100 - startPct, ((endSec - startSec) / duration) * 100));
              const isActive = activeSegmentId === seg.segment_id;
              const isBeingDragged = draggingSegmentId === seg.segment_id;

              return (
                <div
                  key={seg.segment_id}
                  onMouseDown={(e) => handleStartSegmentDrag(e, seg, 'move')}
                  style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  className={`absolute h-7 sm:h-8 rounded-md border transition-all flex items-center justify-between px-1 sm:px-1.5 shadow-2xs font-khmer text-[10px] sm:text-xs group cursor-grab active:cursor-grabbing ${
                    isBeingDragged
                      ? 'bg-blue-700 text-white border-blue-800 ring-3 ring-blue-400 z-30 scale-[1.02]'
                      : isActive
                      ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 font-bold z-20'
                      : 'bg-blue-100 hover:bg-blue-200 text-blue-950 border-blue-300'
                  }`}
                  title={`[អូសប្តូរម៉ោង] ${seg.start_time} - ${seg.end_time}: ${seg.khmer_script}`}
                >
                  {/* Left Resize Handle */}
                  <div 
                    onMouseDown={(e) => handleStartSegmentDrag(e, seg, 'resize-left')}
                    className="w-2 h-full -ml-1 flex items-center justify-center cursor-ew-resize opacity-60 hover:opacity-100 transition"
                    title="អូសកែម៉ោងចាប់ផ្តើម (Trim Start)"
                  >
                    <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                  </div>

                  <div className="flex items-center gap-1 truncate px-1 flex-1 pointer-events-none">
                    <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-300 shrink-0" />
                    <span className="truncate">
                      [{seg.start_time}] {seg.speaker_name || 'AI Dubber'}: {seg.khmer_script}
                    </span>
                  </div>

                  {/* Right Resize Handle */}
                  <div 
                    onMouseDown={(e) => handleStartSegmentDrag(e, seg, 'resize-right')}
                    className="w-2 h-full -mr-1 flex items-center justify-center cursor-ew-resize opacity-60 hover:opacity-100 transition"
                    title="អូសកែម៉ោងបញ្ចប់ (Trim End)"
                  >
                    <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Track 4: Background Music */}
          <div className="h-7 sm:h-8 border-b border-gray-200 bg-emerald-50/20 relative flex items-center px-1">
            {recapData?.bgmTrackUrl ? (
              <div className="w-full h-5 sm:h-6 bg-emerald-100 border border-emerald-400 rounded flex items-center justify-between px-2 gap-2 overflow-hidden shadow-2xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Music className="w-3 h-3 text-emerald-700 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-mono text-emerald-950 font-bold truncate">
                    🎵 {recapData.bgmFileName || 'Isolated_BGM.mp3'}
                  </span>
                  <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.2 rounded font-khmer shrink-0">
                    ញែកបានសម្រេច 100%
                  </span>
                </div>

                {/* Animated BGM Waveform */}
                <div className="flex-1 h-3 flex items-center justify-end gap-0.5 px-2">
                  {Array.from({ length: 45 }).map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`w-1 rounded-full ${isPlaying ? 'bg-emerald-600 animate-[bounce_0.6s_infinite]' : 'bg-emerald-400'}`} 
                      style={{ 
                        height: isPlaying ? `${((idx % 6) + 1) * 2.5}px` : `${(idx % 4) * 2 + 2}px`,
                        animationDelay: `${(idx % 5) * 80}ms`
                      }} 
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full h-5 sm:h-6 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border border-emerald-300/80 rounded flex items-center justify-between px-2 gap-2 overflow-hidden">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Music className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-khmer text-emerald-900 font-semibold truncate">
                    ភ្លេងអម (BGM Track) - មិនទាន់បានញែកចេញពីសំឡេងនិយាយនៅឡើយ
                  </span>
                </div>

                {onExtractBgm && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExtractBgm();
                    }}
                    disabled={isExtractingBgm}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] sm:text-[10px] font-khmer font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition cursor-pointer shrink-0"
                    title="លុបសំឡេងនិយាយក្នុងវីដេអូដើមចេញ ទុកតែភ្លេង BGM"
                  >
                    <Sparkles className={`w-2.5 h-2.5 ${isExtractingBgm ? 'animate-spin' : ''}`} />
                    <span>{isExtractingBgm ? 'កំពុងញែកភ្លេង BGM...' : '🪄 AI លុបសំឡេងនិយាយ ញែកយក BGM'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Track 5: Captions / Subtitles Blocks */}
          <div className="h-7 sm:h-8 border-b border-gray-200 bg-gray-50 relative flex items-center px-1">
            {recapData?.recap_segments?.map((seg) => {
              const startSec = parseTimeToSec(seg.start_time);
              let endSec = parseTimeToSec(seg.end_time);
              if (endSec <= startSec) endSec = startSec + 15;

              const startPct = Math.min(95, (startSec / duration) * 100);
              const widthPct = Math.max(4, Math.min(100 - startPct, ((endSec - startSec) / duration) * 100));

              return (
                <div
                  key={`cap-${seg.segment_id}`}
                  style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  className="absolute h-5 sm:h-6 rounded bg-gray-200 hover:bg-gray-300 border border-gray-300 text-gray-800 text-[9px] sm:text-[10px] font-khmer flex items-center justify-center px-1 overflow-hidden"
                  title={seg.khmer_script}
                >
                  <span className="truncate">T {seg.khmer_script}</span>
                </div>
              );
            })}
          </div>

        </div>

      </div>

    </div>
  );
};
