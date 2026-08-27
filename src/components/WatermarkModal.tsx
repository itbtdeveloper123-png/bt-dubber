import React, { useState } from 'react';
import { X, Check, Stamp, Eye, Sliders, Type, CornerRightUp, Sparkles } from 'lucide-react';
import { WatermarkConfig } from '../types';

interface WatermarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: WatermarkConfig;
  onSaveConfig: (updated: WatermarkConfig) => void;
}

export const WatermarkModal: React.FC<WatermarkModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig
}) => {
  const [enabled, setEnabled] = useState(config.enabled ?? true);
  const [text, setText] = useState(config.text || '@KhmerDubber');
  const [position, setPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'>(config.position || 'top-right');
  const [opacity, setOpacity] = useState(config.opacity ?? 0.85);
  const [color, setColor] = useState(config.color || '#FFFFFF');

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig({
      enabled,
      type: 'text',
      text: text.trim(),
      position,
      opacity,
      scale: 1.0,
      color
    });
    onClose();
  };

  const getPreviewPosClass = () => {
    switch (position) {
      case 'top-left': return 'top-3 left-3';
      case 'top-right': return 'top-3 right-3';
      case 'bottom-left': return 'bottom-3 left-3';
      case 'bottom-right': return 'bottom-3 right-3';
      case 'center': return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
      default: return 'top-3 right-3';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25">
              <Stamp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 font-khmer">
                កំណត់ Watermark & Logo ឆានែល
              </h3>
              <p className="text-[10px] text-slate-400 font-khmer">
                ការពារ Copyright និងផ្សព្វផ្សាយ Channel របស់អ្នក
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          {/* Toggle Enable */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200 font-khmer">
                បើកដំណើរការ Watermark Overlay
              </span>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-800 border-slate-700 cursor-pointer"
            />
          </div>

          {enabled && (
            <>
              {/* Channel Text / Handle */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 font-khmer flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-indigo-400" />
                  <span>ឈ្មោះឆានែល / Social Handle៖</span>
                </label>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="@KhmerMovieReview ឬ កុនខ្មែរ"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              {/* Position Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 font-khmer flex items-center gap-1.5">
                  <CornerRightUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>ទីតាំងលើវីដេអូ៖</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'top-left', label: '↖️ ឆ្វេងលើ' },
                    { id: 'top-right', label: '↗️ ស្តាំលើ' },
                    { id: 'center', label: '⏺️ កណ្តាល' },
                    { id: 'bottom-left', label: '↙️ ឆ្វេងក្រោម' },
                    { id: 'bottom-right', label: '↘️ ស្តាំក្រោម' }
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPosition(p.id as any)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-khmer font-bold border transition cursor-pointer ${
                        position === p.id
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-slate-300 font-khmer flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>កម្រិតថ្លា (Opacity)៖</span>
                  </label>
                  <span className="font-mono text-slate-400 text-[11px] font-bold">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Live Preview Box */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 font-khmer flex items-center gap-1">
                  <Eye className="w-3 h-3 text-amber-400" />
                  <span>គំរូជាក់ស្តែង (Live Preview)៖</span>
                </label>
                <div className="relative w-full h-28 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-slate-800 to-indigo-950 opacity-60" />
                  <span className="text-[10px] text-slate-600 font-mono">Video Preview Frame</span>
                  
                  {/* The Watermark Element */}
                  <div 
                    className={`absolute ${getPreviewPosClass()} px-2 py-0.5 rounded bg-black/40 backdrop-blur-xs font-bold text-xs shadow-md border border-white/10`}
                    style={{
                      color: color,
                      opacity: opacity
                    }}
                  >
                    {text || '@YourChannel'}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-khmer font-bold transition cursor-pointer"
          >
            បោះបង់
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-khmer font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>រក្សាទុក Watermark</span>
          </button>
        </div>

      </div>
    </div>
  );
};
