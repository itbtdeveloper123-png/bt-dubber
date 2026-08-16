import React from 'react';
import { MovieRecapResult } from '../types';
import { X, Trash2, Clock, Film, ExternalLink, Calendar } from 'lucide-react';

interface SavedRecapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedRecaps: MovieRecapResult[];
  onSelectRecap: (recap: MovieRecapResult) => void;
  onDeleteRecap: (index: number) => void;
  onClearAll: () => void;
}

export const SavedRecapsModal: React.FC<SavedRecapsModalProps> = ({
  isOpen,
  onClose,
  savedRecaps,
  onSelectRecap,
  onDeleteRecap,
  onClearAll
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#16191E] border border-[#2D2F36] rounded w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl text-[#E0E0E0] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-[#0A0C10] border-b border-[#2D2F36] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
              Saved Recap Projects ({savedRecaps.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#2D2F36] text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {savedRecaps.length === 0 ? (
            <div className="text-center py-10 text-gray-500 space-y-2 font-mono">
              <Film className="w-8 h-8 mx-auto text-gray-700" />
              <p className="text-xs">No saved recap projects found.</p>
              <p className="text-[10px] text-gray-600">Generated scripts saved to history will appear here.</p>
            </div>
          ) : (
            savedRecaps.map((item, idx) => (
              <div
                key={idx}
                className="bg-[#0A0C10] border border-[#2D2F36] hover:border-[#3D4049] rounded p-3 flex items-center justify-between gap-4 transition group"
              >
                <div 
                  onClick={() => {
                    onSelectRecap(item);
                    onClose();
                  }}
                  className="flex-1 cursor-pointer"
                >
                  <h4 className="font-bold text-gray-200 group-hover:text-amber-500 transition text-sm mb-1">
                    {item.movie_title || 'Untitled Recap'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      {item.total_recap_duration_est}
                    </span>
                    <span>•</span>
                    <span>{item.recap_segments.length} Segments</span>
                    {item.created_at && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onSelectRecap(item);
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold transition flex items-center gap-1"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteRecap(idx)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {savedRecaps.length > 0 && (
          <div className="p-3 border-t border-[#2D2F36] bg-[#0A0C10] flex items-center justify-between">
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 hover:text-red-400 font-mono transition flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#2D2F36] hover:bg-[#3D4049] text-gray-200 text-xs font-mono font-bold"
            >
              Close
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
