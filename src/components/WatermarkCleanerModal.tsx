import React, { useState } from 'react';
import { X, Check, Eraser, Sparkles, Plus, Trash2, Sliders, Eye, ShieldCheck, Layers, Move } from 'lucide-react';
import { WatermarkCleanerConfig, CleanerZone } from '../types';

interface WatermarkCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: WatermarkCleanerConfig;
  onSaveConfig: (updated: WatermarkCleanerConfig) => void;
  videoUrl?: string;
}

const DEFAULT_ZONES: CleanerZone[] = [
  {
    id: 'zone_bottom_subtitles',
    name: 'លុបអក្សរចិនខាងក្រោម (Bottom Subtitles)',
    xPercent: 5,
    yPercent: 82,
    widthPercent: 90,
    heightPercent: 14,
    method: 'cinematic_backdrop',
    intensity: 12
  }
];

export const WatermarkCleanerModal: React.FC<WatermarkCleanerModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  videoUrl
}) => {
  const [enabled, setEnabled] = useState<boolean>(config?.enabled ?? false);
  const [zones, setZones] = useState<CleanerZone[]>(() => {
    if (config?.zones && config.zones.length > 0) return config.zones;
    return DEFAULT_ZONES;
  });
  const [selectedZoneId, setSelectedZoneId] = useState<string>(zones[0]?.id || 'zone_bottom_subtitles');

  if (!isOpen) return null;

  const selectedZone = zones.find(z => z.id === selectedZoneId) || zones[0];

  const handleUpdateZone = (id: string, updates: Partial<CleanerZone>) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
  };

  const handleAddZone = (preset?: Partial<CleanerZone>) => {
    const newId = `zone_${Date.now()}`;
    const newZone: CleanerZone = {
      id: newId,
      name: preset?.name || `តំបន់លុប ${zones.length + 1}`,
      xPercent: preset?.xPercent ?? 20,
      yPercent: preset?.yPercent ?? 20,
      widthPercent: preset?.widthPercent ?? 30,
      heightPercent: preset?.heightPercent ?? 15,
      method: preset?.method || 'smart_delogo',
      intensity: preset?.intensity || 10
    };
    setZones(prev => [...prev, newZone]);
    setSelectedZoneId(newId);
  };

  const handleDeleteZone = (id: string) => {
    if (zones.length <= 1) return;
    const remaining = zones.filter(z => z.id !== id);
    setZones(remaining);
    if (selectedZoneId === id) {
      setSelectedZoneId(remaining[0]?.id || '');
    }
  };

  const handleApplyPreset = (type: 'bottom_subs' | 'top_right_logo' | 'top_left_logo' | 'tiktok_watermark') => {
    setEnabled(true);
    if (type === 'bottom_subs') {
      handleAddZone({
        name: 'លុបអក្សរចិនខាងក្រោម',
        xPercent: 4,
        yPercent: 80,
        widthPercent: 92,
        heightPercent: 16,
        method: 'cinematic_backdrop',
        intensity: 14
      });
    } else if (type === 'top_right_logo') {
      handleAddZone({
        name: 'លុប Logo ខាងលើស្តាំ',
        xPercent: 72,
        yPercent: 4,
        widthPercent: 24,
        heightPercent: 12,
        method: 'smart_delogo',
        intensity: 10
      });
    } else if (type === 'top_left_logo') {
      handleAddZone({
        name: 'លុប Logo ខាងលើឆ្វេង',
        xPercent: 4,
        yPercent: 4,
        widthPercent: 24,
        heightPercent: 12,
        method: 'smart_delogo',
        intensity: 10
      });
    } else if (type === 'tiktok_watermark') {
      handleAddZone({
        name: 'លុប Watermark TikTok ខាងលើ',
        xPercent: 4,
        yPercent: 6,
        widthPercent: 35,
        heightPercent: 8,
        method: 'gaussian_blur',
        intensity: 12
      });
    }
  };

  const handleSave = () => {
    onSaveConfig({
      enabled,
      zones
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/25">
              <Eraser className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-100 font-khmer">
                  🧼 AI Watermark, Logo & Subtitle Cleaner
                </h3>
                <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full font-khmer">
                  AI Auto Inpainting
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-khmer">
                លុប Logo ទូរទស្សន៍, អក្សរចិនដើម, ឬ Watermark លើវីដេអូដោយស្វ័យប្រវត្តិ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content: 2-Column Grid */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto custom-scrollbar">
          
          {/* Left Column (5 cols): Controls & Zones */}
          <div className="lg:col-span-5 space-y-3.5 flex flex-col">
            
            {/* 1. Global Enable Toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className={`w-5 h-5 ${enabled ? 'text-teal-400' : 'text-slate-500'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-200 font-khmer">
                    បើកដំណើរការ AI Logo Cleaner
                  </div>
                  <div className="text-[10px] text-slate-400 font-khmer">
                    អនុវត្តពេល Preview និង Render វីដេអូ
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
              </label>
            </div>

            {/* 2. 1-Click Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 font-khmer flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>កំណត់ទីតាំងរហ័ស 1-Click Presets:</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('bottom_subs')}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-bold text-slate-200 font-khmer text-left transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="text-sm">🔻</span>
                  <span className="truncate">លុបអក្សរចិនក្រោម</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('top_right_logo')}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-bold text-slate-200 font-khmer text-left transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="text-sm">↗️</span>
                  <span className="truncate">Logo លើស្តាំ</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('top_left_logo')}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-bold text-slate-200 font-khmer text-left transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="text-sm">↖️</span>
                  <span className="truncate">Logo លើឆ្វេង</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('tiktok_watermark')}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-bold text-slate-200 font-khmer text-left transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="text-sm">📱</span>
                  <span className="truncate">Watermark TikTok</span>
                </button>
              </div>
            </div>

            {/* 3. Active Zones List */}
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 font-khmer flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-teal-400" />
                  <span>តំបន់លុបដែលបានជ្រើស ({zones.length}):</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleAddZone()}
                  className="text-[10px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 font-khmer cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>ថែមតំបន់ថ្មី</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                {zones.map((zone, idx) => (
                  <div
                    key={zone.id}
                    onClick={() => setSelectedZoneId(zone.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      selectedZoneId === zone.id
                        ? 'bg-teal-950/40 border-teal-500/60 ring-1 ring-teal-500/30'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-800 text-teal-400 text-[10px] font-bold flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-200 font-khmer truncate">
                        {zone.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                        {zone.method === 'cinematic_backdrop' ? 'Backdrop' : zone.method === 'smart_delogo' ? 'Delogo' : 'Blur'}
                      </span>
                      {zones.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteZone(zone.id);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition"
                          title="លុបតំបន់នេះ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column (7 cols): Selected Zone Fine-Tuning & Live Canvas Simulator */}
          <div className="lg:col-span-7 space-y-3 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 flex flex-col">
            
            {/* Visual Canvas Simulator */}
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-700/80 flex items-center justify-center group shadow-inner">
              {/* Background Video Simulator / Actual Video Preview */}
              {videoUrl ? (
                <video
                  src={videoUrl}
                  className="w-full h-full object-contain pointer-events-none opacity-80"
                  muted
                  playsInline
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-600 space-y-1">
                  <Eye className="w-8 h-8 opacity-40" />
                  <span className="text-[11px] font-khmer text-slate-500">ផ្ទាំងកែសម្រួលផ្ទាល់លើវីដេអូ</span>
                </div>
              )}

              {/* Active Zones Rendered on Canvas */}
              {enabled && zones.map((zone) => {
                const isSelected = zone.id === selectedZoneId;
                return (
                  <div
                    key={zone.id}
                    onClick={() => setSelectedZoneId(zone.id)}
                    style={{
                      left: `${zone.xPercent}%`,
                      top: `${zone.yPercent}%`,
                      width: `${zone.widthPercent}%`,
                      height: `${zone.heightPercent}%`
                    }}
                    className={`absolute cursor-pointer transition-all duration-150 flex items-center justify-center ${
                      zone.method === 'cinematic_backdrop'
                        ? 'bg-gradient-to-b from-black/80 via-black/95 to-black/80 backdrop-blur-md'
                        : zone.method === 'smart_delogo'
                          ? 'backdrop-blur-xl bg-slate-900/40'
                          : 'backdrop-blur-lg bg-slate-950/50'
                    } ${
                      isSelected
                        ? 'ring-2 ring-teal-400 border border-teal-300 shadow-lg shadow-teal-500/20'
                        : 'border border-dashed border-teal-500/50 hover:border-teal-400'
                    }`}
                  >
                    <div className="text-[9px] font-bold font-khmer text-teal-200 bg-slate-950/80 px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                      <Move className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[100px]">{zone.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fine-Tuning Controls for Selected Zone */}
            {selectedZone && (
              <div className="space-y-3 pt-1">
                
                {/* Method Picker */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 font-khmer">
                    វិធីសាស្ត្រលុប (Removal Algorithm):
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleUpdateZone(selectedZone.id, { method: 'cinematic_backdrop' })}
                      className={`p-2 rounded-xl border text-[10px] font-bold font-khmer transition flex flex-col items-center gap-0.5 cursor-pointer ${
                        selectedZone.method === 'cinematic_backdrop'
                          ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span>🔲 Subtitle Backdrop</span>
                      <span className="text-[8px] opacity-80">បិទបាំងអក្សរចិនស្អាត</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateZone(selectedZone.id, { method: 'smart_delogo' })}
                      className={`p-2 rounded-xl border text-[10px] font-bold font-khmer transition flex flex-col items-center gap-0.5 cursor-pointer ${
                        selectedZone.method === 'smart_delogo'
                          ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span>✨ Smart Delogo</span>
                      <span className="text-[8px] opacity-80">រំលាយពណ៌ចូលគ្នា</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateZone(selectedZone.id, { method: 'gaussian_blur' })}
                      className={`p-2 rounded-xl border text-[10px] font-bold font-khmer transition flex flex-col items-center gap-0.5 cursor-pointer ${
                        selectedZone.method === 'gaussian_blur'
                          ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span>🌫️ Gaussian Blur</span>
                      <span className="text-[8px] opacity-80">ព្រាលគែមទន់ភ្លន់</span>
                    </button>
                  </div>
                </div>

                {/* Sliders for Position & Dimensions */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-300">
                  {/* X Position */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="font-khmer">ទីតាំង X (ឆ្វេង-ស្តាំ)</span>
                      <span className="text-teal-400">{selectedZone.xPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={selectedZone.xPercent}
                      onChange={(e) => handleUpdateZone(selectedZone.id, { xPercent: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>

                  {/* Y Position */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="font-khmer">ទីតាំង Y (លើ-ក្រោម)</span>
                      <span className="text-teal-400">{selectedZone.yPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={selectedZone.yPercent}
                      onChange={(e) => handleUpdateZone(selectedZone.id, { yPercent: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>

                  {/* Width */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="font-khmer">ទទឹង (Width)</span>
                      <span className="text-teal-400">{selectedZone.widthPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={selectedZone.widthPercent}
                      onChange={(e) => handleUpdateZone(selectedZone.id, { widthPercent: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>

                  {/* Height */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="font-khmer">កម្ពស់ (Height)</span>
                      <span className="text-teal-400">{selectedZone.heightPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="60"
                      value={selectedZone.heightPercent}
                      onChange={(e) => handleUpdateZone(selectedZone.id, { heightPercent: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>
                </div>

                {/* Intensity Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px] font-mono text-slate-300">
                    <span className="font-khmer">កម្រិត Blur / Opacity Intensity</span>
                    <span className="text-teal-400">{selectedZone.intensity}px</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="20"
                    value={selectedZone.intensity}
                    onChange={(e) => handleUpdateZone(selectedZone.id, { intensity: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                  />
                </div>

              </div>
            )}

          </div>

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-khmer text-xs transition cursor-pointer"
          >
            បោះបង់
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold font-khmer text-xs transition flex items-center gap-1.5 shadow-lg shadow-teal-500/25 active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>រក្សាទុក & អនុវត្តលើវីដេអូ</span>
          </button>
        </div>

      </div>
    </div>
  );
};
