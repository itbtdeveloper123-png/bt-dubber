import React, { useState, useEffect } from 'react';
import { 
  X, Type, Check, Sparkles, Sliders, Palette, Eye, MoveVertical, Download
} from 'lucide-react';
import { SubtitleStyleConfig, RecapSegment } from '../types';
import { AnimatedKaraokeOverlay } from './AnimatedKaraokeOverlay';
import { generateSrtContent, generateAssContent, generateVttContent, downloadSubtitleFile } from '../utils/subtitleExport';

interface SubtitleStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SubtitleStyleConfig;
  onSaveConfig: (config: SubtitleStyleConfig) => void;
  segments?: RecapSegment[];
  movieTitle?: string;
}

export const SubtitleStyleModal: React.FC<SubtitleStyleModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  segments = [],
  movieTitle
}) => {
  const [enabled, setEnabled] = useState<boolean>(config.enabled ?? true);
  const [preset, setPreset] = useState<SubtitleStyleConfig['preset']>(config.preset || 'tiktok_pop');
  const [fontFamily, setFontFamily] = useState<SubtitleStyleConfig['fontFamily']>(config.fontFamily || 'Kantumruy Pro');
  const [fontSize, setFontSize] = useState<SubtitleStyleConfig['fontSize']>(config.fontSize || 'lg');
  const [position, setPosition] = useState<SubtitleStyleConfig['position']>(config.position || 'bottom');
  const [highlightColor, setHighlightColor] = useState<string>(config.highlightColor || '#FACC15');
  const [bgBox, setBgBox] = useState<SubtitleStyleConfig['bgBox']>(config.bgBox || 'shadow');

  // Preview animation timer (cycles playhead from 0 to 4s)
  const [previewTimeSec, setPreviewTimeSec] = useState<number>(1.2);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setPreviewTimeSec((prev) => (prev >= 3.8 ? 0.2 : prev + 0.3));
    }, 300);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = (p: SubtitleStyleConfig['preset']) => {
    setPreset(p);
    if (p === 'tiktok_pop') {
      setHighlightColor('#FACC15');
      setFontFamily('Kantumruy Pro');
      setBgBox('shadow');
    } else if (p === 'cinematic_gold') {
      setHighlightColor('#FEF08A');
      setFontFamily('Moul');
      setBgBox('pill_blur');
    } else if (p === 'neon_cyan') {
      setHighlightColor('#38BDF8');
      setFontFamily('Kantumruy Pro');
      setBgBox('black_bar');
    } else if (p === 'classic_clean') {
      setHighlightColor('#FACC15');
      setFontFamily('Siemreap');
      setBgBox('shadow');
    }
  };

  const handleSave = () => {
    const newConfig: SubtitleStyleConfig = {
      enabled,
      preset,
      fontFamily,
      fontSize,
      position,
      animationType: 'karaoke_word',
      highlightColor,
      textColor: '#FFFFFF',
      strokeColor: '#000000',
      bgBox
    };
    onSaveConfig(newConfig);
    onClose();
  };

  const dummySegment = {
    segment_id: 1,
    start_time: '00:00',
    end_time: '00:04',
    speaker_gender: 'narrator',
    speaker_name: 'អ្នកសម្រាយ',
    voice_tone: 'dramatic',
    khmer_script: '🔥 ឈុតជក់ចិត្ត! នារីម្នាក់នេះ កំពុងតែស្វែងរក ការពិតដ៏គួរឱ្យរន្ធត់...'
  };

  const activeConfig: SubtitleStyleConfig = {
    enabled,
    preset,
    fontFamily,
    fontSize,
    position,
    animationType: 'karaoke_word',
    highlightColor,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    bgBox
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/25">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 font-khmer">
                Animated Karaoke Subtitles
              </h3>
              <p className="text-[10px] text-slate-400 font-khmer">
                អក្សររត់ Highlight តាមពាក្យដែលកំពុងនិយាយបែប CapCut Pro
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

        {/* Body Container */}
        <div className="p-4 space-y-4 max-h-[74vh] overflow-y-auto custom-scrollbar">
          
          {/* Live Preview Monitor Screen */}
          <div className="relative aspect-video bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center shadow-inner">
            {/* Background Simulated Scene */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="absolute top-2 left-2.5 px-2 py-0.5 rounded-md bg-black/60 text-slate-400 text-[10px] font-mono flex items-center gap-1">
              <Eye className="w-3 h-3 text-amber-400" />
              <span>Live Karaoke Preview</span>
            </div>

            {/* Karaoke Animated Subtitle Overlay */}
            <AnimatedKaraokeOverlay
              config={activeConfig}
              currentSegment={dummySegment}
              currentTimeSec={previewTimeSec}
            />
          </div>

          {/* Enable Subtitle Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-2xl">
            <span className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>បើកដំណើរការអក្សររត់ Karaoke (Enable Subtitles)</span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>

          {/* 1. CapCut Preset Pickers */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 font-khmer">
              ជ្រើសរើសស្ទីល Preset បែប CapCut៖
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'tiktok_pop', name: '🌟 TikTok Pop', desc: 'Highlight លឿង + ព្រុយខ្មៅ', color: 'border-yellow-500/60 bg-yellow-950/20' },
                { id: 'cinematic_gold', name: '🎬 Cinematic Gold', desc: 'ពណ៌មាសភាពយន្ត ស្អាតបាត', color: 'border-amber-500/60 bg-amber-950/20' },
                { id: 'neon_cyan', name: '⚡ Neon Cyan', desc: 'ពន្លឺណេអុងខៀវចែងចាំង', color: 'border-sky-500/60 bg-sky-950/20' },
                { id: 'classic_clean', name: '🤍 Classic Clean', desc: 'អក្សរស ដិតច្បាស់ត្រជាក់ភ្នែក', color: 'border-slate-500/60 bg-slate-850' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPreset(item.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    preset === item.id
                      ? `${item.color} ring-2 ring-amber-500/50 shadow-md`
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <h4 className="text-xs font-bold text-slate-100 font-khmer">{item.name}</h4>
                  <p className="text-[10px] text-slate-400 font-khmer mt-0.5">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Font & Size Controls */}
          <div className="grid grid-cols-2 gap-3">
            {/* Font Family */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 font-khmer">
                Font អក្សរខ្មែរ៖
              </label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-khmer focus:outline-none focus:border-amber-500"
              >
                <option value="Kantumruy Pro">Kantumruy Pro (ទំនើប)</option>
                <option value="Moul">Moul (មូលបុរាណ)</option>
                <option value="Siemreap">Siemreap (ស្រួលអាន)</option>
                <option value="Battambang">Battambang (បាត់ដំបង)</option>
                <option value="sans-serif">System Sans-serif</option>
              </select>
            </div>

            {/* Font Size */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 font-khmer">
                ទំហំអក្សរ (Font Size)៖
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'sm', label: 'Sm' },
                  { id: 'md', label: 'Md' },
                  { id: 'lg', label: 'Lg' },
                  { id: 'xl', label: 'Xl' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFontSize(s.id as any)}
                    className={`py-1.5 rounded-lg text-xs font-bold font-mono border transition cursor-pointer ${
                      fontSize === s.id
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-extrabold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Position & Highlight Color Controls */}
          <div className="grid grid-cols-2 gap-3">
            {/* Position */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 font-khmer flex items-center gap-1">
                <MoveVertical className="w-3 h-3 text-slate-400" />
                <span>ទីតាំងអក្សរ (Position)៖</span>
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-khmer focus:outline-none focus:border-amber-500"
              >
                <option value="bottom">⬇️ ផ្នែកខាងក្រោម (Bottom - លំនាំដើម)</option>
                <option value="middle">⏹️ ចំកណ្តាល (Center/Middle)</option>
                <option value="top">⬆️ ផ្នែកខាងលើ (Top)</option>
              </select>
            </div>

            {/* Highlight Color */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 font-khmer flex items-center gap-1">
                <Palette className="w-3 h-3 text-amber-400" />
                <span>ពណ៌ Highlight៖</span>
              </label>
              <div className="flex items-center gap-2 pt-0.5">
                {['#FACC15', '#38BDF8', '#4ADE80', '#EC4899', '#FB923C'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setHighlightColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition transform hover:scale-110 cursor-pointer ${
                      highlightColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 4. Background Style Box */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-300 font-khmer">
              ផ្ទៃខាងក្រោយអក្សរ (Subtitle Box Style)៖
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'shadow', label: 'ស្រមោល Shadow' },
                { id: 'pill_blur', label: 'Pill Blur' },
                { id: 'black_bar', label: 'Black Bar' },
                { id: 'none', label: 'គ្មានផ្ទៃ' },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBgBox(b.id as any)}
                  className={`py-1.5 px-1 rounded-xl text-[10px] font-khmer font-bold border truncate transition cursor-pointer ${
                    bgBox === b.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5">
            {segments && segments.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const srt = generateSrtContent(segments);
                    downloadSubtitleFile(srt, `${(movieTitle || 'BT_Dubber_Subs').replace(/\s+/g, '_')}.srt`);
                  }}
                  className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                  title="ទាញយកឯកសារ Subtitle .SRT"
                >
                  <Download className="w-3 h-3" />
                  <span>.SRT</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const ass = generateAssContent(segments, activeConfig, movieTitle);
                    downloadSubtitleFile(ass, `${(movieTitle || 'BT_Dubber_Subs').replace(/\s+/g, '_')}.ass`);
                  }}
                  className="py-1 px-2.5 rounded-lg bg-pink-950/80 hover:bg-pink-900 border border-pink-800/80 text-pink-300 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                  title="ទាញយកឯកសារ Stylized Subtitle .ASS (បូករួម Font និងពណ៌)"
                >
                  <Download className="w-3 h-3" />
                  <span>.ASS</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-khmer font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>រក្សាទុកស្ទីល Subtitle</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
