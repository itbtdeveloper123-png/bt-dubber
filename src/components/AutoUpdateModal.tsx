import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, Sparkles, CheckCircle2, AlertCircle, X, ArrowUpCircle } from 'lucide-react';

interface AutoUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoUpdateModal: React.FC<AutoUpdateModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up_to_date' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setStatus('available');
    });

    const unsubNotAvailable = () => {
      setStatus('up_to_date');
    };
    const unsubNotAvailListener = window.electronAPI.onUpdateNotAvailable(unsubNotAvailable);

    const unsubProgress = window.electronAPI.onUpdateProgress((p) => {
      setStatus('downloading');
      setProgress(p.percent || 0);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateInfo(info);
      setStatus('downloaded');
      setProgress(100);
    });

    const unsubError = window.electronAPI.onUpdateError((err) => {
      setErrorMessage(typeof err === 'string' ? err : (err?.message || 'Error checking for updates'));
      setStatus('error');
    });

    return () => {
      unsubAvailable();
      unsubNotAvailListener();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI) {
      setErrorMessage('មុខងារនេះដំណើរការតែលើ Desktop App (Electron) ប៉ុណ្ណោះ');
      setStatus('error');
      return;
    }
    setStatus('checking');
    setErrorMessage('');
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res.isDev) {
        setErrorMessage('កំពុងស្ថិតក្នុង Development Mode (មុខងារ Auto-Update ដំណើរការពេល build ជា .exe លើ Windows)');
        setStatus('error');
      } else if (!res.success) {
        setErrorMessage(res.error || 'មិនអាចពិនិត្យមើល Version ថ្មីបានទេ');
        setStatus('error');
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to check updates');
      setStatus('error');
    }
  };

  const handleStartDownload = async () => {
    if (!window.electronAPI) return;
    setStatus('downloading');
    setProgress(0);
    try {
      await window.electronAPI.startDownloadUpdate();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to download update');
      setStatus('error');
    }
  };

  const handleQuitAndInstall = () => {
    if (window.electronAPI) {
      window.electronAPI.quitAndInstallUpdate();
    }
  };

  const currentVersion = (typeof window !== 'undefined' && window.electronAPI?.version) ? `v${window.electronAPI.version}` : 'v1.2.2';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-indigo-500/30 shadow-2xl shadow-indigo-500/10">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">
                BT-Dubber Studio Version Control
              </h3>
              <p className="text-xs text-slate-400">
                កំណែបច្ចុប្បន្ន (Current Version): <span className="text-indigo-400 font-semibold">{currentVersion}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          
          {status === 'idle' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <RefreshCw className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">ពិនិត្យមើលកំណែអាប់ដេតថ្មីៗ</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  កម្មវិធីនឹងស្វែងរក Version ថ្មីពី GitHub Releases ដោយស្វ័យប្រវត្តិ
                </p>
              </div>
              <button
                onClick={handleCheckForUpdates}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium shadow-lg shadow-indigo-500/25 transition-all cursor-pointer inline-flex items-center gap-2 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>ពិនិត្យមើល Version ថ្មី (Check Now)</span>
              </button>
            </div>
          )}

          {status === 'checking' && (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 mx-auto border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <h4 className="text-sm font-medium text-slate-200">កំពុងពិនិត្យមើល GitHub Releases...</h4>
              <p className="text-xs text-slate-500">សូមរង់ចាំមួយភ្លែត</p>
            </div>
          )}

          {status === 'up_to_date' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-emerald-400">អ្នកកំពុងប្រើប្រាស់ Version ចុងក្រោយបំផុត!</h4>
                <p className="text-xs text-slate-400 mt-1">
                  BT-Dubber Studio {currentVersion} គឺជាកំណែចុងក្រោយបំផុតហើយ គ្មាន Update ថ្មីទេ។
                </p>
              </div>
              <button
                onClick={handleCheckForUpdates}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors"
              >
                ពិនិត្យម្តងទៀត
              </button>
            </div>
          )}

          {status === 'available' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-3">
                <ArrowUpCircle className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    មានកំណែថ្មី {updateInfo?.version ? `v${updateInfo.version}` : 'Version ថ្មី'} រួចរាល់សម្រាប់ Update!
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    កំណែថ្មីនេះមានការបន្ថែមមុខងារ AI Dubbing និងជួសជុលកែលម្អប្រសិទ្ធភាពការងារ។
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleStartDownload}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>ទាញយក និងដំឡើងស្វ័យប្រវត្តិ (Update Now)</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                >
                  ពេលក្រោយ
                </button>
              </div>
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-2">
                  <Download className="w-4 h-4 text-indigo-400 animate-bounce" />
                  កំពុងទាញយកកញ្ចប់ Update...
                </span>
                <span className="text-indigo-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-xs text-slate-500">
                ឯកសារនឹងត្រូវដំឡើងស្វ័យប្រវត្តិនៅពេលទាញយករួចរាល់
              </p>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">កញ្ចប់ Update បានទាញយករួចរាល់ ១០០%!</h4>
                <p className="text-xs text-slate-400 mt-1">
                  ចុចប៊ូតុងខាងក្រោមដើម្បី Restart និងប្តូរទៅកាន់ Version ថ្មីភ្លាមៗ
                </p>
              </div>
              <button
                onClick={handleQuitAndInstall}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Restart & Install Version ថ្មីឥឡូវនេះ</span>
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-3 text-rose-300">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-rose-200">ដំណឹងពិនិត្យមើល Version</p>
                  <p className="mt-1 text-slate-300">{errorMessage || 'បរាជ័យក្នុងការពិនិត្យមើល Version'}</p>
                </div>
              </div>
              <button
                onClick={handleCheckForUpdates}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                សាកល្បងពិនិត្យម្តងទៀត
              </button>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <span>GitHub: itbtdeveloper123-png/bt-dubber</span>
          <span>BT Developer Studio</span>
        </div>

      </div>
    </div>
  );
};
