import React from 'react';
import { Film, History } from 'lucide-react';

interface HeaderProps {
  onOpenSaved: () => void;
  savedCount: number;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSaved, savedCount }) => {
  return (
    <header className="sticky top-0 z-30 bg-[#16191E] border-b border-[#2D2F36] text-[#E0E0E0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center text-black font-bold shadow-sm">
            <Film className="w-4 h-4 text-black" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5 font-mono">
            KHMER<span className="text-amber-500">RECAP</span>
          </h1>
        </div>

        {/* Saved Projects Button */}
        <button
          onClick={onOpenSaved}
          className="px-3 py-1.5 rounded bg-[#0A0C10] hover:bg-[#2D2F36] border border-[#2D2F36] text-xs font-mono font-medium text-gray-200 transition flex items-center gap-2"
        >
          <History className="w-3.5 h-3.5 text-amber-500" />
          <span>Saved Projects</span>
          {savedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black text-[10px] font-bold">
              {savedCount}
            </span>
          )}
        </button>

      </div>
    </header>
  );
};

