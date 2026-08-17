import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Sparkles } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 300);
    }, toast.duration || 4000);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 300);
  };

  const getStyle = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-slate-900/95 border-emerald-500/40 shadow-emerald-500/10',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
          accent: 'from-emerald-500 to-teal-500',
        };
      case 'warning':
        return {
          bg: 'bg-slate-900/95 border-amber-500/40 shadow-amber-500/10',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
          accent: 'from-amber-500 to-orange-500',
        };
      case 'error':
        return {
          bg: 'bg-slate-900/95 border-rose-500/40 shadow-rose-500/10',
          icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
          accent: 'from-rose-500 to-pink-500',
        };
      case 'info':
      default:
        return {
          bg: 'bg-slate-900/95 border-blue-500/40 shadow-blue-500/10',
          icon: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
          accent: 'from-blue-500 to-cyan-500',
        };
    }
  };

  const style = getStyle();

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden rounded-xl border p-3.5 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
        style.bg
      } ${
        isExiting
          ? 'opacity-0 translate-x-8 scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-slideInRight'
      }`}
    >
      {/* Top Accent Gradient Line */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${style.accent}`} />

      <div className="flex items-start gap-3">
        {style.icon}
        <div className="flex-1 min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-white font-khmer leading-snug">
            {toast.title}
          </h4>
          {toast.message && (
            <p className="text-xs text-slate-300 font-khmer mt-0.5 leading-relaxed">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
