import React from 'react';
import { SubtitleStyleConfig, RecapSegment } from '../types';
import { getActiveSingleLineKaraoke } from '../utils/karaokeUtils';
import { parseTimecode } from '../utils/sequenceUtils';

interface AnimatedKaraokeOverlayProps {
  config?: SubtitleStyleConfig;
  currentSegment?: RecapSegment | null;
  currentTimeSec: number;
}

export const AnimatedKaraokeOverlay: React.FC<AnimatedKaraokeOverlayProps> = ({
  config,
  currentSegment,
  currentTimeSec
}) => {
  if (config && config.enabled === false) {
    return null;
  }
  if (!currentSegment || !currentSegment.khmer_script) {
    return null;
  }

  const startSec = parseTimecode(currentSegment.start_time);
  const endSec = parseTimecode(currentSegment.end_time);

  // Check if playhead is within this segment's time bounds
  const isWithinTime = currentTimeSec >= startSec - 0.2 && currentTimeSec <= endSec + 0.3;
  if (!isWithinTime) {
    return null;
  }

  // Get strictly ONE current active line
  const activeLineInfo = getActiveSingleLineKaraoke(
    currentSegment.khmer_script,
    startSec,
    endSec,
    currentTimeSec
  );

  if (!activeLineInfo || activeLineInfo.words.length === 0) return null;

  const { words } = activeLineInfo;
  const cfg = config || {
    enabled: true,
    preset: 'tiktok_pop',
    fontFamily: 'Kantumruy Pro',
    fontSize: 'lg',
    position: 'bottom',
    animationType: 'karaoke_word',
    highlightColor: '#FACC15',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    bgBox: 'shadow'
  };

  // Position Styling
  const positionClass = 
    cfg.position === 'top' 
      ? 'top-2 sm:top-4' 
      : cfg.position === 'middle' 
        ? 'top-1/2 -translate-y-1/2' 
        : 'bottom-3 sm:bottom-5';

  // Font Size Styling (Strictly Single-Line Compact)
  const fontSizeClass =
    cfg.fontSize === 'sm'
      ? 'text-[11px] sm:text-xs'
      : cfg.fontSize === 'md'
        ? 'text-xs sm:text-sm'
        : cfg.fontSize === 'xl'
          ? 'text-sm sm:text-base md:text-lg'
          : 'text-xs sm:text-sm'; // default lg is compact text-xs/sm for 1 clean line!

  // Font Family Styling with guaranteed Khmer fallback
  const fontFamilyStyle = {
    fontFamily: cfg.fontFamily ? `"${cfg.fontFamily}", 'Kantumruy Pro', sans-serif` : "'Kantumruy Pro', sans-serif"
  };

  // Background Box Styling
  const getBgBoxClass = () => {
    switch (cfg.bgBox) {
      case 'pill_blur':
        return 'bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 shadow-xl';
      case 'black_bar':
        return 'bg-black/85 px-3.5 py-1 rounded-md shadow-xl';
      case 'shadow':
      default:
        return 'bg-black/40 backdrop-blur-xs px-2.5 py-0.5 rounded-lg drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]';
    }
  };

  return (
    <div className={`absolute inset-x-1 sm:inset-x-3 ${positionClass} flex justify-center items-center z-25 pointer-events-none select-none transition-all duration-100`}>
      <div 
        className={`max-w-[92%] sm:max-w-lg flex items-center justify-center gap-x-1 sm:gap-x-1.5 whitespace-nowrap overflow-hidden text-center font-bold ${getBgBoxClass()}`}
        style={fontFamilyStyle}
      >
        {words.map((item, index) => {
          const isActive = item.isActive;
          const isPast = item.isPast;

          // Preset-specific active styling
          let activeStyle: React.CSSProperties = {};
          let textClass = `${fontSizeClass} font-bold transition-all duration-100 transform inline-block whitespace-nowrap`;

          if (isActive) {
            textClass += ' scale-110 z-10 animate-bounce-subtle';
            
            if (cfg.preset === 'tiktok_pop') {
              activeStyle = {
                color: cfg.highlightColor || '#FACC15',
                textShadow: `0 0 10px ${cfg.highlightColor || '#FACC15'}, -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 4px rgba(0,0,0,0.9)`,
              };
            } else if (cfg.preset === 'cinematic_gold') {
              activeStyle = {
                color: '#FEF08A',
                textShadow: '0 0 12px rgba(250, 204, 21, 0.9), -1px -1px 0 #78350F, 1px -1px 0 #78350F, -1px 1px 0 #78350F, 1px 1px 0 #78350F',
              };
            } else if (cfg.preset === 'neon_cyan') {
              activeStyle = {
                color: '#38BDF8',
                textShadow: '0 0 12px #0284C7, 0 0 18px #38BDF8, -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000',
              };
            } else {
              // Classic Clean
              activeStyle = {
                color: cfg.highlightColor || '#FACC15',
                textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 3px 6px rgba(0,0,0,0.8)',
              };
            }
          } else if (isPast) {
            activeStyle = {
              color: '#FFFFFF',
              textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 4px rgba(0,0,0,0.9)',
            };
          } else {
            // Future word
            activeStyle = {
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
            };
          }

          return (
            <span
              key={index}
              className={textClass}
              style={activeStyle}
            >
              {item.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
