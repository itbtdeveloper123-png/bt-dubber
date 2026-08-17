import React from 'react';
import { Mic, Upload, Key } from 'lucide-react';

interface StudioSidebarProps {
  onOpenUpload: () => void;
  onOpenApiKeyModal?: () => void;
  hasCustomApiKey?: boolean;
}

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  onOpenUpload,
  onOpenApiKeyModal,
  hasCustomApiKey = false
}) => {
  return (
    <aside className="w-10 sm:w-12 bg-white border-r border-gray-200 flex flex-col items-center py-1.5 sm:py-2 justify-between text-gray-600 z-20 shrink-0 select-none">
      <div className="flex flex-col items-center gap-2 sm:gap-3 w-full">
        {/* Top Upload Video Plus Button */}
        <button
          onClick={onOpenUpload}
          title="Upload វីដេអូរឿង (Upload Movie Video)"
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-bold shadow-xs transition active:scale-95 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <div className="w-6 sm:w-7 h-[1px] bg-gray-200 my-0.5 sm:my-1" />

        {/* Primary Tool: Dubbing Only */}
        <div className="flex flex-col gap-2 w-full px-1 items-center">
          <button
            title="Dubbing Workspace"
            className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex flex-col items-center justify-center bg-blue-50 text-blue-600 font-semibold shadow-2xs"
          >
            <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-[8px] sm:text-[9px] font-medium tracking-tight mt-0.5">Dubbing</span>
            <span className="absolute top-1 right-1 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full" />
          </button>
        </div>
      </div>

      {/* Bottom Settings / API Key Button */}
      {onOpenApiKeyModal && (
        <div className="w-full px-1 flex flex-col items-center pb-1">
          <button
            onClick={onOpenApiKeyModal}
            title="កំណត់ Gemini API Key (API Key Settings)"
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex flex-col items-center justify-center transition cursor-pointer ${
              hasCustomApiKey
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-700 animate-pulse'
            }`}
          >
            <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-[8px] font-bold mt-0.5 font-khmer">Key</span>
          </button>
        </div>
      )}
    </aside>
  );
};

