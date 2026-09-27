import React, { useState, useEffect } from 'react';
import { 
  X, Check, Sparkles, Music, Link as LinkIcon, RefreshCw, Zap, 
  CheckCircle2, AlertCircle, ExternalLink, Cpu, Volume2, 
  Copy, Radio, Activity, Download, Play, ShieldCheck, CheckCheck
} from 'lucide-react';

interface BgmSeparatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bgmColabUrl?: string;
  onSaveColabUrl?: (url: string) => void;
  onExtractBgm?: () => void;
  isExtractingBgm?: boolean;
  bgmExtractProgress?: number;
  bgmExtractStatus?: string;
  hasBgmTrack?: boolean;
  videoUrl?: string;
  videoFileName?: string;
  onToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export const BgmSeparatorModal: React.FC<BgmSeparatorModalProps> = ({
  isOpen,
  onClose,
  bgmColabUrl,
  onSaveColabUrl,
  onExtractBgm,
  isExtractingBgm = false,
  bgmExtractProgress = 0,
  bgmExtractStatus = '',
  hasBgmTrack = false,
  videoUrl,
  videoFileName,
  onToast
}) => {
  const [colabUrl, setColabUrl] = useState<string>(() => {
    return bgmColabUrl || 
      localStorage.getItem('bgm_colab_url') || 
      localStorage.getItem('cleaner_colab_url') || 
      localStorage.getItem('voxcpm2_colab_url') || 
      '';
  });

  const [bleedSuppression, setBleedSuppression] = useState<'standard' | 'clean' | 'ultra'>(() => {
    return (localStorage.getItem('bgm_bleed_suppression') as any) || 'clean';
  });

  const [isTestingLink, setIsTestingLink] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    checked: boolean;
    connected: boolean;
    message?: string;
    gpu?: string;
    device?: string;
    latencyMs?: number;
  }>({
    checked: !!(bgmColabUrl || localStorage.getItem('bgm_colab_url')),
    connected: !!(bgmColabUrl || localStorage.getItem('bgm_colab_url')),
    gpu: 'Tesla T4 / P100 GPU'
  });

  const handleBleedChange = (mode: 'standard' | 'clean' | 'ultra') => {
    setBleedSuppression(mode);
    localStorage.setItem('bgm_bleed_suppression', mode);
  };

  useEffect(() => {
    if (bgmColabUrl) {
      setColabUrl(bgmColabUrl);
    }
  }, [bgmColabUrl]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!colabUrl.trim()) {
      onToast?.('warning', 'សូមបញ្ចូល URL Kaggle / Colab', 'បញ្ចូល Cloudflare Link របស់ AI BGM Separator GPU');
      return;
    }

    setIsTestingLink(true);
    let cleanUrl = colabUrl.trim().replace(/\/+$/, '');
    const startTime = performance.now();

    try {
      // 1. Direct Browser Test to Kaggle/Colab Cloudflare URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const directRes = await fetch(`${cleanUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      }).catch(err => null);
      
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);

      if (directRes && directRes.ok) {
        const directData = await directRes.json().catch(() => ({}));
        const gpuName = directData.gpu_name || directData.gpu || 'NVIDIA GPU (CUDA)';
        const service = directData.service || 'Kaggle/Colab AI BGM Separator GPU';

        setConnectionStatus({
          checked: true,
          connected: true,
          message: `ភ្ជាប់ទៅកាន់ ${service} ជោគជ័យ! (${latency}ms)`,
          gpu: gpuName,
          device: directData.device || 'cuda',
          latencyMs: latency
        });

        localStorage.setItem('bgm_colab_url', cleanUrl);
        onSaveColabUrl?.(cleanUrl);
        onToast?.('success', '⚡ ភ្ជាប់ Link ជោគជ័យ!', `${gpuName} Active (${latency}ms)`);
        setIsTestingLink(false);
        return;
      }

      // Fallback: Test basic health on root
      const rootRes = await fetch(`${cleanUrl}/`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }).catch(() => null);

      if (rootRes && rootRes.ok) {
        setConnectionStatus({
          checked: true,
          connected: true,
          message: 'ភ្ជាប់ទៅកាន់ Cloudflare GPU Tunnel ជោគជ័យ!',
          gpu: 'NVIDIA GPU (CUDA)',
          device: 'cuda',
          latencyMs: latency
        });
        localStorage.setItem('bgm_colab_url', cleanUrl);
        onSaveColabUrl?.(cleanUrl);
        onToast?.('success', '⚡ ភ្ជាប់ Link ជោគជ័យ!', 'Cloudflare GPU Active');
      } else {
        throw new Error('Could not connect to health endpoint');
      }
    } catch (e: any) {
      setConnectionStatus({
        checked: true,
        connected: false,
        message: 'មិនអាចភ្ជាប់ទៅកាន់ Link បានទេ។ សូមប្រាកដថាបានចុច Run All លើ Kaggle/Colab រួចរាល់។'
      });
      onToast?.('error', 'ការតភ្ជាប់បរាជ័យ', 'សូមពិនិត្យមើល Cloudflare Link ឡើងវិញ');
    } finally {
      setIsTestingLink(false);
    }
  };

  const handleSaveOnly = () => {
    const cleanUrl = colabUrl.trim().replace(/\/+$/, '');
    localStorage.setItem('bgm_colab_url', cleanUrl);
    localStorage.setItem('bgm_bleed_suppression', bleedSuppression);
    onSaveColabUrl?.(cleanUrl);
    onToast?.('success', '💾 រក្សាទុកជោគជ័យ', cleanUrl ? 'បានកំណត់ Kaggle/Colab GPU Link រួចរាល់' : 'បានកំណត់ប្រើ Local CPU Mode');
    onClose();
  };

  const handleExtractNow = () => {
    const cleanUrl = colabUrl.trim().replace(/\/+$/, '');
    localStorage.setItem('bgm_colab_url', cleanUrl);
    localStorage.setItem('bgm_bleed_suppression', bleedSuppression);
    onSaveColabUrl?.(cleanUrl);
    onClose();
    if (onExtractBgm) {
      setTimeout(() => {
        onExtractBgm();
      }, 100);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-khmer animate-in fade-in duration-200">
      <div className="bg-[#12151B] border border-gray-700/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                  ⚡ កំណត់ AI BGM Separator (Kaggle & Colab GPU)
                </h2>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Turbo 10s
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                ញែកភ្លេង BGM និងសំឡេងមនុស្ស (Vocals) ល្បឿនលឿនដូចផ្លេកបន្ទោរលើ GPU ឥតគិតថ្លៃ
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs text-gray-300">
          
          {/* Card 1: Cloudflare / Kaggle URL Input */}
          <div className="bg-[#181C24] border border-gray-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white text-xs flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4 text-emerald-400" />
                <span>Kaggle / Google Colab Public URL (Cloudflare Tunnel)</span>
              </label>

              {connectionStatus.checked && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  connectionStatus.connected 
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40' 
                    : 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <span>{connectionStatus.connected ? 'Connected' : 'Offline'}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={colabUrl}
                  onChange={(e) => {
                    setColabUrl(e.target.value);
                    setConnectionStatus(prev => ({ ...prev, checked: false, connected: false }));
                  }}
                  placeholder="បិទភ្ជាប់ Cloudflare Link (ឧ. https://xxxx.trycloudflare.com)"
                  className="w-full bg-[#0D1017] border border-gray-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-emerald-500 transition font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingLink || !colabUrl.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-900/30 cursor-pointer shrink-0"
              >
                {isTestingLink ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>កំពុងតេស្ត...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>⚡ តេស្ត Link</span>
                  </>
                )}
              </button>
            </div>

            {/* Connection Status Details */}
            {connectionStatus.checked && (
              <div className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between ${
                connectionStatus.connected
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {connectionStatus.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{connectionStatus.message}</span>
                </div>
                {connectionStatus.connected && connectionStatus.gpu && (
                  <span className="bg-emerald-900/60 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-emerald-300">
                    🚀 {connectionStatus.gpu}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Card: Vocal Bleed Suppression Level */}
          <div className="bg-[#181C24] border border-gray-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>កម្រិតបំបាត់សំឡេងនិយាយដើម (Vocal Bleed & Reverb Elimination)</span>
              </label>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/20">
                Studio Zero-Bleed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleBleedChange('standard')}
                className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                  bleedSuppression === 'standard'
                    ? 'bg-emerald-950/40 border-emerald-500/70 text-white shadow-sm shadow-emerald-900/30'
                    : 'bg-[#0E121A] border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs">ធម្មតា (Standard)</span>
                  {bleedSuppression === 'standard' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <p className="text-[10px] text-gray-400 leading-normal">
                  កាត់បន្ថយជាមធ្យម រក្សាទំហំសំឡេងភ្លេងពេញលេញ (ស័ក្តិសមសម្រាប់ចម្រៀង)
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleBleedChange('clean')}
                className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                  bleedSuppression === 'clean'
                    ? 'bg-emerald-950/40 border-emerald-500/70 text-white shadow-sm shadow-emerald-900/30 ring-1 ring-emerald-500/50'
                    : 'bg-[#0E121A] border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs text-emerald-300">✨ ដាច់ស្អាត (Zero-Bleed)</span>
                  {bleedSuppression === 'clean' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <p className="text-[10px] text-gray-400 leading-normal">
                  <strong>ណែនាំ៖</strong> បំបាត់សំឡេងនិយាយបានជាង ២៥dB គ្មានសល់សំឡេងមនុស្ស
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleBleedChange('ultra')}
                className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                  bleedSuppression === 'ultra'
                    ? 'bg-emerald-950/40 border-emerald-500/70 text-white shadow-sm shadow-emerald-900/30'
                    : 'bg-[#0E121A] border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs text-amber-300">🛡️ កាត់បន្ទរខ្លាំង (Ultra)</span>
                  {bleedSuppression === 'ultra' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <p className="text-[10px] text-gray-400 leading-normal">
                  កាត់លុបទាំងសំឡេងបន្ទរ Echo/Reverb និងខ្សឹបខ្លាំងក្នុងរឿង
                </p>
              </button>
            </div>
          </div>

          {/* Card 2: 3-Step Guide to Run on Kaggle (Free 30 hrs/week Dual GPU) */}
          <div className="bg-[#181C24] border border-gray-800 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>របៀបដំណើរការលើ Kaggle / Colab GPU (៣ ជំហានងាយៗ)</span>
              </h3>
              <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 font-bold">
                100% Free GPU
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="bg-[#0E121A] p-2.5 rounded-lg border border-gray-800 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1">
                  <span>១. បើក Kaggle Notebook</span>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  ចូល <a href="https://www.kaggle.com/code" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold">kaggle.com/code</a> ➔ <strong>New Notebook</strong> ➔ Import Notebook <strong>AI_BGM_Separator_Kaggle_GPU.ipynb</strong>
                </p>
              </div>

              <div className="bg-[#0E121A] p-2.5 rounded-lg border border-gray-800 space-y-1">
                <div className="font-bold text-cyan-400 flex items-center gap-1">
                  <span>២. បើក GPU & Internet</span>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  នៅផ្ទាំងខាងស្តាំ (Notebook Options) ➔ ជ្រើសរើស <strong>GPU T4 x2</strong> និងបើក <strong>Internet: ON</strong> ➔ ចុច <strong>▶️ Run All</strong>
                </p>
              </div>

              <div className="bg-[#0E121A] p-2.5 rounded-lg border border-gray-800 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1">
                  <span>៣. ចម្លង Cloudflare Link</span>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  ចម្លង (Copy) Link ពណ៌បៃតង <strong>https://xxxx.trycloudflare.com</strong> មកបិទភ្ជាប់ក្នុងប្រអប់ខាងលើរួចចុច <strong>តេស្ត Link</strong>!
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-800/60 text-[11px]">
              <span className="text-gray-400">ហ្វាយសម្រាប់ Upload: <code className="text-emerald-400 bg-gray-900 px-1.5 py-0.5 rounded font-mono">scripts/AI_BGM_Separator_Kaggle_GPU.ipynb</code></span>
              <a 
                href="https://www.kaggle.com/code" 
                target="_blank" 
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold underline"
              >
                <span>បើក Kaggle</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Card 3: Speed & Quality Comparison */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-emerald-950/20 border border-emerald-800/30 p-2.5 rounded-lg space-y-1">
              <div className="font-bold text-emerald-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kaggle / Colab GPU Turbo</span>
              </div>
              <p className="text-gray-400">
                ⚡ ល្បឿន <strong>១០ - ១៥ វិនាទី</strong> | គុណភាព <strong>Meta Demucs AI 100%</strong> Studio BGM
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg space-y-1">
              <div className="font-bold text-slate-300 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>Local CPU Fast Mode</span>
              </div>
              <p className="text-gray-400">
                💻 ដំណើរការលើ CPU Cores ម៉ាស៊ីនផ្ទាល់ (លឿនជាងមុន ២x - ៣x ដោយស្វ័យប្រវត្តិ)
              </p>
            </div>
          </div>

          {/* Processing Indicator if active */}
          {isExtractingBgm && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{bgmExtractStatus || 'កំពុងដំណើរការញែក BGM...'}</span>
                </span>
                <span>{bgmExtractProgress}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, bgmExtractProgress)}%` }}
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-gray-800 bg-[#0E1218] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
          >
            បិទ (Close)
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveOnly}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-300 bg-gray-800 hover:bg-gray-700 transition cursor-pointer border border-gray-700"
            >
              💾 រក្សាទុក Link
            </button>

            {onExtractBgm && (
              <button
                type="button"
                onClick={handleExtractNow}
                disabled={isExtractingBgm}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-lg shadow-emerald-900/40 cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isExtractingBgm ? 'animate-spin' : ''}`} />
                <span>{isExtractingBgm ? `កំពុងញែក (${bgmExtractProgress}%)` : (hasBgmTrack ? '🎵 ញែក BGM ម្តងទៀត' : '🎵 ចាប់ផ្តើមញែក BGM ឥឡូវនេះ')}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
