import React, { useState, useEffect } from 'react';
import { Key, X, Check, Eye, EyeOff, Sparkles, ExternalLink, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (newKey: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey
}) => {
  const [inputKey, setInputKey] = useState<string>(apiKey || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setInputKey(apiKey || '');
    setTestResult(null);
  }, [apiKey, isOpen]);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    const keyToTest = inputKey.trim();
    if (!keyToTest) {
      setTestResult({ success: false, message: 'សូមបញ្ចូល API Key មុននឹងធ្វើតេស្ត!' });
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);

      const resp = await fetch('/api/key/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest })
      });

      const data = await resp.json();

      if (resp.ok && data.valid) {
        setTestResult({
          success: true,
          message: `✅ API Key ដំណើរការជោគជ័យ 100% (Model: ${data.model || 'Gemini 2.0 Flash'})!`
        });
      } else {
        setTestResult({
          success: false,
          message: `❌ ${data.error || 'API Key មិនត្រឹមត្រូវ ឬជាប់កំណត់ Quota!'}`
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `❌ បរាជ័យក្នុងការតេស្ត: ${err.message || 'Network error'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const cleanKey = inputKey.trim();
    onSaveApiKey(cleanKey);
    onClose();
  };

  const handleClear = () => {
    setInputKey('');
    onSaveApiKey('');
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none animate-fadeIn">
      <div 
        className="relative w-full max-w-lg bg-[#181B20] text-gray-100 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-800 bg-[#1E222A]">
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
                ដាក់ API Key ដោយខ្លួនឯងផ្ទាល់ មិនចាំបាច់កែក្នុង .env ឡើយ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 text-xs font-khmer">
          
          {/* Information Card */}
          <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl flex items-start gap-2.5 text-blue-200">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold text-white">សុវត្ថិភាពខ្ពស់ 100%:</span> API Key របស់លោកអ្នកនឹងត្រូវបានរក្សាទុកតែនៅក្នុង Browser (Local Storage) លើកុំព្យូទ័ររបស់អ្នកប៉ុណ្ណោះ និងប្រើសម្រាប់តែការបកប្រែវីដេអូផ្ទាល់ខ្លួន។
            </div>
          </div>

          {/* Input Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-200 flex items-center justify-between">
              <span>បញ្ចូល Gemini API Key របស់អ្នក៖</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>យក Free API Key នៅទីនេះ</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="AIzaSy..."
                className="w-full bg-[#101216] border border-gray-700 focus:border-amber-500 rounded-xl px-3 py-2.5 pr-10 text-xs font-mono text-white placeholder-gray-500 focus:outline-none transition shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                title={showKey ? 'លាក់ Key' : 'បង្ហាញ Key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-khmer flex items-start gap-2 animate-fadeIn ${
                testResult.success
                  ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/50 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="text-[11px] leading-relaxed break-words">
                {testResult.message}
              </div>
            </div>
          )}

          {/* Step by Step Guide Accordion */}
          <div className="p-3 bg-[#1E222A] rounded-xl border border-gray-800 space-y-1.5 text-[11px] text-gray-300">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>📌 របៀបយក Free Gemini API Key (ឥតគិតថ្លៃ):</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
              <li>ចូលទៅកាន់ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">aistudio.google.com/app/apikey</a></li>
              <li>ចុចប៊ូតុង <strong className="text-white">Create API Key</strong></li>
              <li>ជ្រើសរើស <strong className="text-white">Create API key in new project</strong></li>
              <li>Copy API Key (ដែលផ្តើមដោយ <code className="text-amber-300">AIzaSy...</code>) មក Paste ក្នុងប្រអប់ខាងលើ!</li>
            </ol>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 border-t border-gray-800 bg-[#1A1D24] flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-rose-400 transition font-khmer cursor-pointer"
          >
            លុប Key ចេញ
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestKey}
              disabled={isTesting || !inputKey.trim()}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-khmer font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'កំពុងតេស្ត...' : '⚡ ធ្វើតេស្ត Key'}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-khmer font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>រក្សាទុក (Save)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
