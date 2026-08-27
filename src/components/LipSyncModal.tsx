import React, { useState } from 'react';
import { 
  X, Check, Sparkles, Sliders, Play, ShieldCheck, 
  Layers, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Video, Eye
} from 'lucide-react';
import { LipSyncConfig, RecapSegment } from '../types';

interface LipSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: LipSyncConfig;
  onSaveConfig: (updated: LipSyncConfig) => void;
  segments?: RecapSegment[];
  videoUrl?: string;
  onToast?: (type: 'success' | 'warning' | 'error' | 'info', title: string, message?: string) => void;
}

export const LipSyncModal: React.FC<LipSyncModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  segments = [],
  videoUrl,
  onToast
}) => {
  const [enabled, setEnabled] = useState<boolean>(config?.enabled ?? false);
  const [colabUrl, setColabUrl] = useState<string>(() => {
    return config?.colabUrl || localStorage.getItem('wav2lip_colab_url') || '';
  });
  const [faceEnhancer, setFaceEnhancer] = useState<boolean>(config?.faceEnhancer ?? true);
  const [pads, setPads] = useState<[number, number, number, number]>(config?.pads || [0, 10, 0, 0]);
  const [targetScope, setTargetScope] = useState<'all_dialogue' | 'selected_segments'>(config?.targetScope || 'all_dialogue');

  // Connection testing state
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<{ checked: boolean; connected: boolean; message?: string; gpu?: string }>({
    checked: false,
    connected: false
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processProgress, setProcessProgress] = useState<number>(0);
  const [processStatus, setProcessStatus] = useState<string>('');

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!colabUrl.trim()) {
      onToast?.('warning', 'សូមបញ្ចូល URL Google Colab', 'បញ្ចូល Cloudflare Tunnel URL របស់ Colab Wav2Lip');
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/lipsync/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colabUrl: colabUrl.trim() })
      });

      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus({
          checked: true,
          connected: true,
          gpu: data.gpu || 'NVIDIA Tesla GPU',
          message: data.message || 'ភ្ជាប់ទៅកាន់ GPU Colab បានជោគជ័យ!'
        });
        localStorage.setItem('wav2lip_colab_url', colabUrl.trim());
        onToast?.('success', '⚡ ភ្ជាប់ Colab GPU ជោគជ័យ!', data.gpu || 'NVIDIA Tesla GPU Active');
      } else {
        setConnectionStatus({
          checked: true,
          connected: false,
          message: data.message || 'មិនអាចភ្ជាប់ទៅកាន់ Colab បានទេ'
        });
        onToast?.('error', 'ការតភ្ជាប់បរាជ័យ', data.message);
      }
    } catch (err: any) {
      setConnectionStatus({
        checked: true,
        connected: false,
        message: err.message || 'Network Error'
      });
      onToast?.('error', 'ការតភ្ជាប់បរាជ័យ', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const updated: LipSyncConfig = {
      enabled,
      colabUrl: colabUrl.trim(),
      faceEnhancer,
      pads,
      targetScope
    };
    onSaveConfig(updated);
    if (colabUrl.trim()) {
      localStorage.setItem('wav2lip_colab_url', colabUrl.trim());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/25">
              <span className="text-lg">👄</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-100 font-khmer">
                  Wav2Lip AI Real Lip-Sync Studio
                </h3>
                <span className="bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full font-khmer">
                  Neural Lip Motion
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-khmer">
                កែចលនាមាត់តួអង្គឱ្យបត់បែនបើកបិទត្រូវគ្នានឹងពាក្យខ្មែរ ១០០%
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

        {/* Body Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar">
          
          {/* 1. Global Enable Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-5 h-5 ${enabled ? 'text-pink-400' : 'text-slate-500'}`} />
              <div>
                <div className="text-xs font-bold text-slate-200 font-khmer">
                  បើកដំណើរការ Wav2Lip AI Lip-Sync
                </div>
                <div className="text-[10px] text-slate-400 font-khmer">
                  ធ្វើសមកាលកម្មចលនាមាត់លើឈុតសន្ទនាក្នុងពេល Render វីដេអូ
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
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
            </label>
          </div>

          {/* 2. Google Colab GPU Cloud Connection Box */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <label className="text-xs font-bold text-slate-200 font-khmer">
                  Google Colab Free GPU Server (T4 / A100 GPU):
                </label>
              </div>

              <a
                href="https://colab.research.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1 font-khmer transition"
              >
                <span>បើក Colab Notebook</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={colabUrl}
                onChange={(e) => setColabUrl(e.target.value)}
                placeholder="ឧ. https://xxxx.trycloudflare.com"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-pink-500"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold font-khmer transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-pink-400 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'កំពុងតេស្ត...' : 'តេស្តភ្ជាប់'}</span>
              </button>
            </div>

            {connectionStatus.checked && (
              <div className={`p-2 rounded-xl text-[11px] font-khmer flex items-center gap-2 ${
                connectionStatus.connected ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800' : 'bg-red-950/40 text-red-300 border border-red-800'
              }`}>
                {connectionStatus.connected ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                <div className="truncate">
                  <span>{connectionStatus.message}</span>
                  {connectionStatus.gpu && <span className="font-mono ml-1 font-bold">({connectionStatus.gpu})</span>}
                </div>
              </div>
            )}
          </div>

          {/* 3. GFPGAN HD Face Enhancer & Padding Tuning */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* GFPGAN Face Restorer */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span className="text-xs font-bold text-slate-200 font-khmer">
                    GFPGAN HD Face Restorer
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={faceEnhancer}
                  onChange={(e) => setFaceEnhancer(e.target.checked)}
                  className="w-4 h-4 rounded text-pink-500 focus:ring-pink-500 bg-slate-800 border-slate-700 cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-khmer">
                ជួសជុល និងពង្រីកកម្រិតច្បាស់នៃផ្ទៃមុខ និងបបូរមាត់ឱ្យឡើងកម្រិត HD 1080p (មិនព្រាល)
              </p>
            </div>

            {/* Target Scope */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <label className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-2">
                <Layers className="w-4 h-4 text-pink-400" />
                <span>គោលដៅអនុវត្ត (Target Scope):</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTargetScope('all_dialogue')}
                  className={`p-2 rounded-xl text-[10px] font-bold font-khmer border transition cursor-pointer ${
                    targetScope === 'all_dialogue'
                      ? 'bg-pink-600 text-white border-pink-500 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  គ្រប់ឈុតសន្ទនា ({segments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTargetScope('selected_segments')}
                  className={`p-2 rounded-xl text-[10px] font-bold font-khmer border transition cursor-pointer ${
                    targetScope === 'selected_segments'
                      ? 'bg-pink-600 text-white border-pink-500 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  ឈុតជ្រើសរើស
                </button>
              </div>
            </div>

          </div>

          {/* 4. Face Landmark Padding Sliders */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-pink-400" />
                <span>តម្រឹមទំហំបបូរមាត់ & ចង្កា (Face Landmark Padding):</span>
              </label>
              <span className="text-[10px] font-mono text-pink-400">
                [Top: {pads[0]}, Bottom: {pads[1]}, Left: {pads[2]}, Right: {pads[3]}]
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono text-slate-300">
              <div className="space-y-0.5">
                <span className="font-khmer">បបូរមាត់លើ (Top)</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={pads[0]}
                  onChange={(e) => setPads([parseInt(e.target.value), pads[1], pads[2], pads[3]])}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              <div className="space-y-0.5">
                <span className="font-khmer">ចង្កាក្រោម (Bottom)</span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={pads[1]}
                  onChange={(e) => setPads([pads[0], parseInt(e.target.value), pads[2], pads[3]])}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              <div className="space-y-0.5">
                <span className="font-khmer">ថ្ពាល់ឆ្វេង (Left)</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={pads[2]}
                  onChange={(e) => setPads([pads[0], pads[1], parseInt(e.target.value), pads[3]])}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              <div className="space-y-0.5">
                <span className="font-khmer">ថ្ពាល់ស្តាំ (Right)</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={pads[3]}
                  onChange={(e) => setPads([pads[0], pads[1], pads[2], parseInt(e.target.value)])}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>
            </div>
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
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold font-khmer text-xs transition flex items-center gap-1.5 shadow-lg shadow-pink-500/25 active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>រក្សាទុកការកំណត់ Lip-Sync</span>
          </button>
        </div>

      </div>
    </div>
  );
};
