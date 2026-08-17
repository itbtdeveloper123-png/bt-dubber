import React, { useEffect } from 'react';
import { RecapSegment, MovieRecapResult, TranslationMode } from '../types';
import { 
  Mic, Play, Pause, Plus, Trash2, Edit3, Volume2, Sparkles, 
  Copy, Check, RefreshCw, UserCheck, MessageSquare, Layers, Video, AlignLeft
} from 'lucide-react';

interface DubbingPanelProps {
  recapData?: MovieRecapResult | null;
  activeSegmentId: number;
  playingSegmentId: number | null;
  isPlayingAll: boolean;
  ttsSpeed: number;
  onSpeedChange: (speed: number) => void;
  onPlaySegment: (segment: RecapSegment) => void;
  onPlayFullNarration: () => void;
  onTestVoice?: () => void;
  onSegmentChange: (id: number, field: keyof RecapSegment, value: any) => void;
  onAddSegment: () => void;
  onDeleteSegment: (id: number) => void;
  onRegenerateAll?: () => void;
  translationMode: TranslationMode;
  onChangeTranslationMode: (mode: TranslationMode) => void;
  globalVoicePersona?: string;
  onChangeGlobalVoicePersona?: (persona: string) => void;
  isLoading?: boolean;
}

export const DubbingPanel: React.FC<DubbingPanelProps> = ({
  recapData,
  activeSegmentId,
  playingSegmentId,
  isPlayingAll,
  ttsSpeed,
  onSpeedChange,
  onPlaySegment,
  onPlayFullNarration,
  onTestVoice,
  onSegmentChange,
  onAddSegment,
  onDeleteSegment,
  onRegenerateAll,
  translationMode,
  onChangeTranslationMode,
  globalVoicePersona = 'auto',
  onChangeGlobalVoicePersona,
  isLoading
}) => {
  const getSpeakerBadgeClass = (gender?: string) => {
    switch (gender?.toLowerCase()) {
      case 'male':
        return 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
      case 'female':
        return 'bg-pink-100 text-pink-800 border-pink-300 font-bold';
      case 'male_elder':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      case 'female_elder':
        return 'bg-orange-100 text-orange-800 border-orange-300 font-bold';
      case 'child':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      case 'villain':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'multi':
        return 'bg-purple-100 text-purple-800 border-purple-300 font-bold';
      case 'narrator':
      default:
        return 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold';
    }
  };

  const getModeLabel = () => {
    switch (translationMode) {
      case 'word_by_word_lip_sync':
        return { title: 'បកប្រែពាក្យតាមមាត់តួ (Word-by-Word Lip-Sync)', subtitle: 'បកប្រែពាក្យមួយម៉ាត់ៗ ស៊ីចង្វាក់នឹងមាត់តួអង្គ' };
      case 'character_dialogue':
        return { title: 'បកប្រែតាមតួអង្គនិយាយ (Dubbing)', subtitle: 'បកប្រែផ្ទាល់មាត់តួអង្គមួយម៉ាត់ៗ' };
      case 'hybrid_recap_dub':
        return { title: 'ទម្រង់កូនកាត់ (Hybrid Dubbing)', subtitle: 'សម្រាយសាច់រឿង + សន្ទនាតួអង្គ' };
      case 'movie_recap':
      default:
        return { title: 'សម្រាយរឿងបែបនិទាន (Movie Recap)', subtitle: 'និទានសង្ខេបដំណើររឿងទាំងមូល' };
    }
  };

  const currentModeInfo = getModeLabel();

  useEffect(() => {
    if (activeSegmentId) {
      const el = document.getElementById(`dubbing-segment-${activeSegmentId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeSegmentId]);

  return (
    <div className="w-full lg:w-[350px] xl:w-[410px] 2xl:w-[460px] bg-white border border-gray-200 rounded-xl flex flex-col h-[400px] sm:h-[430px] lg:h-[390px] xl:h-[450px] 2xl:h-[490px] overflow-hidden shadow-xs shrink-0 select-none">
      
      {/* 1. Dubbing Panel Top Bar */}
      <div className="px-3 sm:px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            <Mic className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] sm:text-xs font-bold text-gray-900 flex items-center gap-1 font-khmer truncate">
              <span className="truncate">{currentModeInfo.title}</span>
              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
            </h2>
          </div>
        </div>

        {/* Voice Selector & Speed Selector */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Global Voice Persona Dropdown */}
          {onChangeGlobalVoicePersona && (
            <div className="flex items-center bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono gap-1 shadow-2xs">
              <select
                value={globalVoicePersona}
                onChange={(e) => onChangeGlobalVoicePersona(e.target.value)}
                className="bg-transparent text-gray-900 font-bold focus:outline-none cursor-pointer text-[10px] sm:text-[11px] font-khmer max-w-[105px] sm:max-w-[130px] truncate"
                title="ជ្រើសរើសប្រភេទសំឡេងនិយាយខ្មែរ (Khmer Voice Persona)"
              >
                <option value="auto">🤖 តាមតួអង្គ (Piseth & Sreymom)</option>
                <option value="male">👨‍🦱 Piseth (ពិសិដ្ឋ)</option>
                <option value="female">👩‍🦰 Sreymom (ស្រីមុំ)</option>
                <option value="narrator">🎙️ Piseth (អ្នកសម្រាយ)</option>
                <option value="male_elder">👴 Piseth (តាចាស់)</option>
                <option value="child">👶 Sreymom (កុមារ)</option>
              </select>
            </div>
          )}

          {/* Speed Selector */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono gap-1 shadow-2xs">
            <span className="text-amber-600 font-bold text-[10px]">⚡</span>
            <select
              value={ttsSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="bg-transparent text-gray-900 font-bold focus:outline-none cursor-pointer text-[10px] sm:text-[11px]"
              title="ល្បឿននៃការនិយាយ (Speech Speed Rate)"
            >
              <option value="1.0">1.0x (ធម្មតា)</option>
              <option value="1.15">1.15x (ល្មម)</option>
              <option value="1.25">1.25x (រហ័ស)</option>
              <option value="1.35">1.35x (លឿន)</option>
              <option value="1.5">1.5x (លឿនខ្លាំង)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Four-Way Translation Mode Switcher Bar */}
      <div className="px-1.5 sm:px-2.5 py-1.5 bg-slate-100 border-b border-gray-200 grid grid-cols-4 gap-1 text-[9px] sm:text-[10px] font-khmer font-bold select-none shrink-0">
        <button
          type="button"
          onClick={() => onChangeTranslationMode('movie_recap')}
          className={`py-1 sm:py-1.5 px-0.5 sm:px-1 rounded-lg transition flex items-center justify-center gap-0.5 sm:gap-1 cursor-pointer truncate ${
            translationMode === 'movie_recap'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="សម្រាយរឿងបែបនិទាន (Movie Recap Narration)"
        >
          <Mic className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
          <span className="truncate">🎙️ សម្រាយ</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('character_dialogue')}
          className={`py-1 sm:py-1.5 px-0.5 sm:px-1 rounded-lg transition flex items-center justify-center gap-0.5 sm:gap-1 cursor-pointer truncate ${
            translationMode === 'character_dialogue'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="បកប្រែតាមតួអង្គនិយាយ (Direct Character Dialogue Dubbing)"
        >
          <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
          <span className="truncate">🎭 សន្ទនា</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('word_by_word_lip_sync')}
          className={`py-1 sm:py-1.5 px-0.5 sm:px-1 rounded-lg transition flex items-center justify-center gap-0.5 sm:gap-1 cursor-pointer truncate ${
            translationMode === 'word_by_word_lip_sync'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="បកប្រែពាក្យមួយម៉ាត់ៗ តាមមាត់តួអង្គ (Word-by-Word Lip-Sync Dubbing)"
        >
          <AlignLeft className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
          <span className="truncate">👄 តាមមាត់តួ</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('hybrid_recap_dub')}
          className={`py-1 sm:py-1.5 px-0.5 sm:px-1 rounded-lg transition flex items-center justify-center gap-0.5 sm:gap-1 cursor-pointer truncate ${
            translationMode === 'hybrid_recap_dub'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="ទម្រង់កូនកាត់: សម្រាយសាច់រឿង + សន្ទនាតួអង្គ (Hybrid Mode)"
        >
          <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
          <span className="truncate">🌟 កូនកាត់</span>
        </button>
      </div>

      {/* 3. Dubbing Transcript Items List */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 bg-gray-50/50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6 space-y-2 sm:space-y-3">
            <div className="relative">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-3 sm:border-4 border-blue-200 border-t-blue-600 animate-spin" />
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-bold text-blue-900 font-khmer animate-pulse">
                Gemini AI កំពុងបកប្រែ និងរៀបចំស្គ្រីប ({currentModeInfo.title})...
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 font-mono">
                Auto-aligning word-by-word dialogue & lip timestamps
              </p>
            </div>
          </div>
        ) : recapData && recapData.recap_segments && recapData.recap_segments.length > 0 ? (
          recapData.recap_segments.map((seg) => {
            const isActive = activeSegmentId === seg.segment_id;
            const isPlayingThis = playingSegmentId === seg.segment_id;

            return (
              <div
                key={seg.segment_id}
                id={`dubbing-segment-${seg.segment_id}`}
                className={`group p-2.5 sm:p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-blue-50/90 border-blue-400 border-l-4 border-l-blue-600 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Segment Top Bar: Timestamp, Speaker Gender, Character Name, Play Button */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    {/* Timestamp */}
                    <span className="font-mono text-[10px] sm:text-[11px] font-bold text-gray-600 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded border border-gray-200 shrink-0">
                      {seg.start_time}-{seg.end_time}
                    </span>

                    {/* Speaker Gender Selector Badge */}
                    <select
                      value={seg.speaker_gender || 'narrator'}
                      onChange={(e) => onSegmentChange(seg.segment_id, 'speaker_gender', e.target.value)}
                      className={`text-[9px] sm:text-[10px] font-bold font-khmer px-1 sm:px-1.5 py-0.5 rounded border focus:outline-none cursor-pointer max-w-[95px] sm:max-w-[125px] truncate shrink-0 ${getSpeakerBadgeClass(seg.speaker_gender)}`}
                    >
                      <option value="narrator">🎙️ អ្នកសម្រាយ</option>
                      <option value="male">👨‍🦱 តួប្រុស</option>
                      <option value="female">👩‍🦰 តួស្រី</option>
                      <option value="male_elder">👴 តាចាស់</option>
                      <option value="female_elder">👵 យាយចាស់</option>
                      <option value="child">👶 កុមារ/ក្មេង</option>
                      <option value="villain">🦹 តួអាក្រក់</option>
                      <option value="multi">👥 ប្រុស&ស្រី</option>
                    </select>

                    {/* Speaker Name Input */}
                    <input
                      type="text"
                      value={seg.speaker_name || ''}
                      placeholder="ឈ្មោះតួអង្គ"
                      onChange={(e) => onSegmentChange(seg.segment_id, 'speaker_name', e.target.value)}
                      className="bg-transparent border-b border-gray-300 focus:border-blue-500 text-[10px] sm:text-[11px] font-khmer font-bold text-gray-800 w-16 sm:w-24 px-1 focus:outline-none truncate"
                    />
                  </div>

                  {/* Play & Delete Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlaySegment(seg);
                      }}
                      className={`p-1.5 sm:p-2 rounded-lg transition cursor-pointer active:scale-95 ${
                        isPlayingThis
                          ? 'bg-amber-500 text-black font-bold ring-2 ring-amber-300 animate-pulse'
                          : 'bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-900 border border-blue-200'
                      }`}
                      title={isPlayingThis ? "Pause Khmer Voice" : "Play Khmer Voice Dubbing"}
                    >
                      {isPlayingThis ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-blue-700 ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(seg.segment_id);
                      }}
                      className="p-1 sm:p-1.5 rounded bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete Segment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Original foreign dialogue subtitle display (if present) */}
                {seg.original_summary && seg.original_summary !== seg.khmer_script && (
                  <div className="text-[10px] text-gray-500 font-sans italic bg-gray-100/80 px-2 py-0.5 rounded mb-1 truncate">
                    <span className="font-semibold text-gray-600 not-italic mr-1">Orig:</span>
                    "{seg.original_summary}"
                  </div>
                )}

                {/* Khmer Script Text Box */}
                <textarea
                  value={seg.khmer_script}
                  onChange={(e) => onSegmentChange(seg.segment_id, 'khmer_script', e.target.value)}
                  rows={2}
                  className={`w-full bg-transparent border-none text-xs sm:text-sm font-khmer leading-relaxed focus:outline-none resize-y ${
                    isActive ? 'text-blue-950 font-semibold' : 'text-gray-800'
                  }`}
                  placeholder={
                    translationMode === 'word_by_word_lip_sync'
                      ? 'សរសេរការបកប្រែពាក្យមួយម៉ាត់ៗ តាមមាត់តួអង្គ...'
                      : translationMode === 'character_dialogue'
                      ? 'សរសេរការសន្ទនាតួអង្គជាភាសាខ្មែរ...'
                      : 'សរសេរអត្ថបទសម្រាយរឿងជាភាសាខ្មែរ...'
                  }
                />
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400">
            <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300 mb-2" />
            <p className="text-xs sm:text-sm font-bold text-gray-600 font-khmer mb-1">
              មិនទាន់មានស្គ្រីបនៅឡើយទេ
            </p>
            <p className="text-[10px] sm:text-xs text-gray-400 font-mono mb-3">
              ជ្រើសរើស Mode (សម្រាយ, សន្ទនា, តាមមាត់តួ, កូនកាត់) រួចចុច Generate AI Script
            </p>
          </div>
        )}
      </div>

      {/* 4. Dubbing Panel Footer */}
      <div className="p-2 sm:p-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0">
        <button
          onClick={onAddSegment}
          className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-xs font-semibold text-gray-700 transition flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Segment</span>
        </button>

        {onRegenerateAll && (
          <button
            onClick={onRegenerateAll}
            disabled={isLoading}
            className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-2xs active:scale-95 cursor-pointer truncate shrink-0"
            title="Gen ស្គ្រីបថ្មីតាម Mode ដែលបានរើស"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="truncate">
              Generate ({translationMode === 'word_by_word_lip_sync' ? 'តាមមាត់តួ' : translationMode === 'character_dialogue' ? 'សន្ទនា' : translationMode === 'hybrid_recap_dub' ? 'កូនកាត់' : 'សម្រាយរឿង'})
            </span>
          </button>
        )}
      </div>

    </div>
  );
};
