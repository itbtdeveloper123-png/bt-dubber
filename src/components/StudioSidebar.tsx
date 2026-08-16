import React from 'react';
import { Mic, Upload } from 'lucide-react';

interface StudioSidebarProps {
  onOpenUpload: () => void;
}

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  onOpenUpload
}) => {
  return (
    <aside className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-2 gap-3 text-gray-600 z-20 shrink-0">
      {/* Top Upload Video Plus Button */}
      <button
        onClick={onOpenUpload}
        title="Upload វីដេអូរឿង (Upload Movie Video)"
        className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-bold shadow-sm transition active:scale-95 cursor-pointer"
      >
        <Upload className="w-4 h-4" />
      </button>

      <div className="w-7 h-[1px] bg-gray-200 my-1" />

      {/* Primary Tool: Dubbing Only */}
      <div className="flex flex-col gap-2 w-full px-1">
        <button
          title="Dubbing Workspace"
          className="relative w-10 h-10 rounded-lg flex flex-col items-center justify-center bg-blue-50 text-blue-600 font-semibold shadow-2xs"
        >
          <Mic className="w-4 h-4" />
          <span className="text-[9px] font-medium tracking-tight mt-0.5">Dubbing</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
        </button>
      </div>
    </aside>
  );
};

