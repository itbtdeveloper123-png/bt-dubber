import React, { useState, useEffect } from 'react';
import { Key, X, Check, Eye, EyeOff, Sparkles, ExternalLink, ShieldCheck, AlertCircle, RefreshCw, Mic, Languages, Activity, Info, RotateCcw, Sliders } from 'lucide-react';
import { getDailyUsage, incrementDailyUsage, resetDailyUsage, setDailyLimit, QuotaStats } from '../utils/apiQuotaTracker';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  voiceApiKey?: string;
  onSaveApiKey: (newTranslationKey: string, newVoiceKey: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  voiceApiKey = '',
  onSaveApiKey
}) => {
  const [activeTab, setActiveTab] = useState<'translation' | 'voice'>('translation');
  const [inputTranslationKey, setInputTranslationKey] = useState<string>(apiKey || '');
  const [inputVoiceKey, setInputVoiceKey] = useState<string>(voiceApiKey || '');
  const [showTranslationKey, setShowTranslationKey] = useState<boolean>(false);
  const [showVoiceKey, setShowVoiceKey] = useState<boolean>(false);

  const [isTestingTranslation, setIsTestingTranslation] = useState<boolean>(false);
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);
  const [translationTestResult, setTranslationTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [voiceTestResult, setVoiceTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Quota Tracking state
  const [transQuota, setTransQuota] = useState<QuotaStats>(() => getDailyUsage('translation'));
  const [voiceQuota, setVoiceQuota] = useState<QuotaStats>(() => getDailyUsage('voice'));

  const refreshQuotas = () => {
    setTransQuota(getDailyUsage('translation'));
    setVoiceQuota(getDailyUsage('voice'));
  };

  useEffect(() => {
    setInputTranslationKey(apiKey || '');
    setInputVoiceKey(voiceApiKey || '');
    setTranslationTestResult(null);
    setVoiceTestResult(null);
    refreshQuotas();

    const handleQuotaUpdate = () => refreshQuotas();
    window.addEventListener('gemini_quota_updated', handleQuotaUpdate);
    return () => window.removeEventListener('gemini_quota_updated', handleQuotaUpdate);
  }, [apiKey, voiceApiKey, isOpen]);

  const currentQuota = activeTab === 'translation' ? transQuota : voiceQuota;

  const handleTestKey = async (type: 'translation' | 'voice') => {
    const keyToTest = (type === 'translation' ? inputTranslationKey : inputVoiceKey).trim();
    if (!keyToTest) {
      if (type === 'translation') {
        setTranslationTestResult({ success: false, message: 'សូមបញ្ចូល API Key មុននឹងធ្វើតេស្ត!' });
      } else {
        setVoiceTestResult({ success: false, message: 'សូមបញ្ចូល Voice Clone API Key មុននឹងធ្វើតេស្ត!' });
      }
      return;
    }

    try {
      if (type === 'translation') {
        setIsTestingTranslation(true);
        setTranslationTestResult(null);
      } else {
        setIsTestingVoice(true);
        setVoiceTestResult(null);
      }

      const resp = await fetch('/api/key/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest })
      });

      const data = await resp.json();

      if (resp.ok && data.valid) {
        const msg = `✅ API Key ដំណើរការជោគជ័យ 100% (${data.model || 'Gemini 2.5 Flash'})!`;
        if (type === 'translation') {
          setTranslationTestResult({ success: true, message: msg });
        } else {
          setVoiceTestResult({ success: true, message: msg });
        }
      } else {
        let cleanErr = data.error || 'API Key មិនត្រឹមត្រូវ ឬជាប់កំណត់ Quota!';
        try {
          if (cleanErr.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || cleanErr.includes('UNAUTHENTICATED')) {
            cleanErr = 'API Key មិនត្រឹមត្រូវ! សូមប្រើប្រាស់ Key ដែលចាប់ផ្ដើមដោយ "AIzaSy..." ពី Google AI Studio។';
          } else if (cleanErr.includes('RESOURCE_EXHAUSTED') || cleanErr.includes('429')) {
            cleanErr = 'API Key នេះជាប់កំណត់ Quota (429)។ សូមបង្កើត Key ថ្មីលើ Account មួយផ្សេងទៀត។';
          }
        } catch {}
        const msg = `❌ ${cleanErr}`;
        if (type === 'translation') {
          setTranslationTestResult({ success: false, message: msg });
        } else {
          setVoiceTestResult({ success: false, message: msg });
        }
      }
    } catch (err: any) {
      const msg = `❌ បរាជ័យក្នុងការតេស្ត: ${err.message || 'Network error'}`;
      if (type === 'translation') {
        setTranslationTestResult({ success: false, message: msg });
      } else {
        setVoiceTestResult({ success: false, message: msg });
      }
    } finally {
      if (type === 'translation') {
        setIsTestingTranslation(false);
      } else {
        setIsTestingVoice(false);
      }
    }
  };

  const renderQuotaCard = (quota: QuotaStats, type: 'translation' | 'voice') => {
    return (
      <div className="p-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl space-y-2.5 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${type === 'translation' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'}`}>
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200 font-khmer flex items-center gap-1.5">
                <span>កម្រិតប្រើប្រាស់ថ្ងៃនេះ (Daily Requests / Limit)</span>
              </h4>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-khmer flex items-center gap-1 ${
            quota.status === 'safe'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : quota.status === 'warning'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
              : 'bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse'
          }`}>
            {quota.status === 'safe' && '🟢 កម្រិតសុវត្ថិភាព (Safe)'}
            {quota.status === 'warning' && '🟡 ជិតដល់ Limit (Warning)'}
            {quota.status === 'danger' && '🔴 អស់ Quota (Exhausted)'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-khmer">
            <span className="text-slate-400">
              បានប្រើថ្ងៃនេះ៖ <strong className="text-white text-xs font-mono">{quota.count.toLocaleString()}</strong> / {quota.limit.toLocaleString()} Requests
            </span>
            <span className={`font-mono font-bold ${quota.status === 'safe' ? 'text-emerald-400' : quota.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
              {quota.percent}% ({quota.remaining.toLocaleString()} នៅសល់)
            </span>
          </div>
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                quota.status === 'safe'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : quota.status === 'warning'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                  : 'bg-gradient-to-r from-red-500 to-rose-400'
              }`}
              style={{ width: `${Math.max(3, quota.percent)}%` }}
            />
          </div>
        </div>

        {/* Helper info & actions */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-khmer pt-1 border-t border-slate-800/60">
          <div className="flex items-center gap-1 text-slate-400">
            <Info className="w-3 h-3 text-slate-500 shrink-0" />
            <span>Google Free Quota: 1,500 requests/ថ្ងៃ (Reset ម៉ោង 12:00 យប់)</span>
          </div>
          <div className="flex items-center gap-2 font-bold">
            <button
              type="button"
              onClick={() => {
                const newLimitStr = prompt('កំណត់ចំនួន Limit ក្នុងមួយថ្ងៃ (Default: 1500):', String(quota.limit));
                if (newLimitStr) {
                  const num = parseInt(newLimitStr, 10);
                  if (!isNaN(num) && num > 0) setDailyLimit(type, num);
                }
              }}
              className="text-[10.5px] text-amber-400 hover:text-amber-300 transition underline cursor-pointer"
            >
              ប្តូរ Limit
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('តើអ្នកពិតជាចង់ Reset ចំនួន Request ថ្ងៃនេះមែនទេ?')) {
                  resetDailyUsage(type);
                }
              }}
              className="text-[10.5px] text-slate-400 hover:text-red-400 transition underline cursor-pointer flex items-center gap-0.5"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleSave = () => {
    const cleanTransKey = inputTranslationKey.trim();
    const cleanVoiceKey = inputVoiceKey.trim();
    onSaveApiKey(cleanTransKey, cleanVoiceKey);
    onClose();
  };

  const handleClear = () => {
    if (activeTab === 'translation') {
      setInputTranslationKey('');
      setTranslationTestResult(null);
    } else {
      setInputVoiceKey('');
      setVoiceTestResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none animate-fadeIn">
      <div 
        className="relative w-full max-w-lg bg-[#181B20] text-gray-100 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden font-sans max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-800 bg-[#1E222A] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white font-khmer flex items-center gap-1.5">
                <span>កំណត់ Google Gemini API Key</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              </h2>
              <p className="text-[10px] sm:text-xs text-gray-400 font-khmer">
                ចែកដាច់ពីគ្នារវាង API បកប្រែ និង API Voice Clone ដើម្បីកុំឱ្យជាន់ Quota គ្នា
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-[#121418] border-b border-gray-800 gap-1 text-xs font-khmer font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('translation')}
            className={`py-2 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'translation'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>១. API បកប្រែ & សម្រាយរឿង</span>
            {inputTranslationKey && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`py-2 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-purple-600 text-white shadow-md font-bold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>២. API Voice Clone & Audio</span>
            {inputVoiceKey && <span className="w-2 h-2 rounded-full bg-purple-400"></span>}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 text-xs font-khmer overflow-y-auto">
          
          {/* Information Card */}
          <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl flex items-start gap-2.5 text-blue-200">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold text-white">សុវត្ថិភាពខ្ពស់ 100%:</span> API Key ទាំងពីរនឹងត្រូវបានរក្សាទុកតែលើ Browser (Local Storage) លើកុំព្យូទ័ររបស់អ្នកប៉ុណ្ណោះ។
            </div>
          </div>

          {/* Daily Request Quota Tracker Card */}
          {renderQuotaCard(currentQuota, activeTab)}

          {/* TAB 1: Translation API Key */}
          {activeTab === 'translation' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Languages className="w-3.5 h-3.5" />
                    <span>Gemini API Key សម្រាប់បកប្រែ & សម្រាយរឿង៖</span>
                  </span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>យក Free Key ទីនេះ</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </label>

                <div className="relative">
                  <input
                    type={showTranslationKey ? 'text' : 'password'}
                    value={inputTranslationKey}
                    onChange={(e) => {
                      setInputTranslationKey(e.target.value);
                      setTranslationTestResult(null);
                    }}
                    placeholder="AIzaSy... ឬ AQ.Ab8RN6... (Translation API Key)"
                    className="w-full bg-[#101216] border border-gray-700 focus:border-amber-500 rounded-xl px-3 py-2.5 pr-10 text-xs font-mono text-white placeholder-gray-500 focus:outline-none transition shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTranslationKey(!showTranslationKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                    title={showTranslationKey ? 'លាក់ Key' : 'បង្ហាញ Key'}
                  >
                    {showTranslationKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Test Button & Result for Translation Key */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestKey('translation')}
                  disabled={isTestingTranslation || !inputTranslationKey.trim()}
                  className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white border border-gray-600 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingTranslation ? 'animate-spin text-amber-400' : ''}`} />
                  <span>{isTestingTranslation ? 'កំពុងតេស្ត...' : 'តេស្ត API Key បកប្រែ'}</span>
                </button>

                {inputTranslationKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputTranslationKey('');
                      setTranslationTestResult(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-[11px] underline cursor-pointer"
                  >
                    លុបចេញ
                  </button>
                )}
              </div>

              {translationTestResult && (
                <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs ${
                  translationTestResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/40 border-red-500/40 text-red-300'
                }`}>
                  {translationTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{translationTestResult.message}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Dedicated Voice Clone API Key */}
          {activeTab === 'voice' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-purple-300">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Gemini API Key សម្រាប់ Voice Clone & Audio៖</span>
                  </span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>យក Free Key ទីនេះ</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </label>

                <div className="relative">
                  <input
                    type={showVoiceKey ? 'text' : 'password'}
                    value={inputVoiceKey}
                    onChange={(e) => {
                      setInputVoiceKey(e.target.value);
                      setVoiceTestResult(null);
                    }}
                    placeholder="AIzaSy... ឬ AQ.Ab8RN6... (Dedicated Voice Clone API Key)"
                    className="w-full bg-[#101216] border border-gray-700 focus:border-purple-500 rounded-xl px-3 py-2.5 pr-10 text-xs font-mono text-white placeholder-gray-500 focus:outline-none transition shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVoiceKey(!showVoiceKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                    title={showVoiceKey ? 'លាក់ Key' : 'បង្ហាញ Key'}
                  >
                    {showVoiceKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  💡 ប្រើសម្រាប់ Voice Cloning, Gemini Native Audio Synthesis និង TTS ដោយមិនបាច់ចែករំលែក Quota ជាមួយការបកប្រែ។
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const validKey = inputTranslationKey || '';
                      if (validKey) {
                        setInputVoiceKey(validKey);
                        setVoiceTestResult(null);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>✨ ប្រើ Key ដូច Tab ១</span>
                  </button>
                </div>
              </div>

              {/* Test Button & Result for Voice Key */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestKey('voice')}
                  disabled={isTestingVoice || !inputVoiceKey.trim()}
                  className="px-3.5 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 hover:text-white border border-purple-600/60 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingVoice ? 'animate-spin text-purple-400' : ''}`} />
                  <span>{isTestingVoice ? 'កំពុងតេស្ត...' : 'តេស្ត API Key Voice Clone'}</span>
                </button>

                {inputVoiceKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputVoiceKey('');
                      setVoiceTestResult(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-[11px] underline cursor-pointer"
                  >
                    លុបចេញ
                  </button>
                )}
              </div>

              {voiceTestResult && (
                <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs ${
                  voiceTestResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/40 border-red-500/40 text-red-300'
                }`}>
                  {voiceTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{voiceTestResult.message}</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-800 bg-[#1A1D24] shrink-0">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-red-400 transition cursor-pointer"
          >
            សម្អាត Key បច្ចុប្បន្ន
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition cursor-pointer"
            >
              បោះបង់
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-bold transition shadow-md flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>រក្សាទុក API Keys ទាំងអស់</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
