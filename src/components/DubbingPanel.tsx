import React from 'react';
import { RecapSegment, MovieRecapResult, TranslationMode } from '../types';
import { 
  Mic, Play, Pause, Plus, Trash2, Edit3, Volume2, Sparkles, 
  Copy, Check, RefreshCw, UserCheck, MessageSquare, Layers, Video
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
  onSegmentChange: (id: number, field: keyof RecapSegment, value: any) => void;
  onAddSegment: () => void;
  onDeleteSegment: (id: number) => void;
  onRegenerateAll?: () => void;
  translationMode: TranslationMode;
  onChangeTranslationMode: (mode: TranslationMode) => void;
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
  onSegmentChange,
  onAddSegment,
  onDeleteSegment,
  onRegenerateAll,
  translationMode,
  onChangeTranslationMode,
  isLoading
}) => {
  const getSpeakerBadgeClass = (gender?: string) => {
    switch (gender?.toLowerCase()) {
      case 'male':
        return 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
      case 'female':
        return 'bg-pink-100 text-pink-800 border-pink-300 font-bold';
      case 'multi':
        return 'bg-purple-100 text-purple-800 border-purple-300 font-bold';
      case 'narrator':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
    }
  };

  const getModeLabel = () => {
    switch (translationMode) {
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

  return (
    <div className="w-full lg:w-[440px] xl:w-[480px] bg-white border border-gray-200 rounded-xl flex flex-col h-[520px] overflow-hidden shadow-sm shrink-0">
      
      {/* 1. Dubbing Panel Top Bar */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-900 flex items-center gap-1 font-khmer">
              <span>{currentModeInfo.title}</span>
              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
            </h2>
          </div>
        </div>

        {/* Speed Selector & Play All Button */}
        <div className="flex items-center gap-1.5">
          {/* Speed selector */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono gap-1 shadow-2xs">
            <span className="text-amber-600 font-bold text-[10px]">⚡</span>
            <select
              value={ttsSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="bg-transparent text-gray-900 font-bold focus:outline-none cursor-pointer text-[11px]"
            >
              <option value="1.0">1.0x</option>
              <option value="1.15">1.15x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>

          <button
            onClick={onPlayFullNarration}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1 shadow-2xs cursor-pointer ${
              isPlayingAll
                ? 'bg-amber-500 text-black animate-pulse font-bold'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isPlayingAll ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-black" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Three-Way Translation Mode Switcher Bar */}
      <div className="px-3 py-2 bg-slate-100 border-b border-gray-200 grid grid-cols-3 gap-1 text-[11px] font-khmer font-bold select-none">
        <button
          type="button"
          onClick={() => onChangeTranslationMode('movie_recap')}
          className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
            translationMode === 'movie_recap'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="សម្រាយរឿងបែបនិទាន (Movie Recap Narration)"
        >
          <Mic className="w-3 h-3" />
          <span>🎙️ សម្រាយរឿង</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('character_dialogue')}
          className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
            translationMode === 'character_dialogue'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="បកប្រែតាមតួអង្គនិយាយផ្ទាល់ (Direct Character Dialogue Dubbing)"
        >
          <MessageSquare className="w-3 h-3" />
          <span>🎭 សន្ទនាតួអង្គ</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('hybrid_recap_dub')}
          className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
            translationMode === 'hybrid_recap_dub'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="ទម្រង់កូនកាត់: សម្រាយសាច់រឿង + សន្ទនាតួអង្គ (Hybrid Mode)"
        >
          <Layers className="w-3 h-3" />
          <span>🌟 កូនកាត់</span>
        </button>
      </div>

      {/* 3. Dubbing Transcript Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-gray-50/50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
              <Sparkles className="w-5 h-5 text-amber-500 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-blue-900 font-khmer animate-pulse">
                Gemini AI កំពុងបកប្រែ និងរៀបចំស្គ្រីប ({currentModeInfo.title})...
              </p>
              <p className="text-xs text-gray-500 font-mono">
                Auto-transcribing dialogue & aligning character timestamps
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
                className={`group p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-blue-50/90 border-blue-400 border-l-4 border-l-blue-600 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Segment Top Bar: Timestamp, Speaker Gender, Character Name, Play Button */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {/* Timestamp */}
                    <span className="font-mono text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                      {seg.start_time} - {seg.end_time}
                    </span>

                    {/* Speaker Gender Selector Badge */}
                    <select
                      value={seg.speaker_gender || 'narrator'}
                      onChange={(e) => onSegmentChange(seg.segment_id, 'speaker_gender', e.target.value)}
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border focus:outline-none cursor-pointer ${getSpeakerBadgeClass(seg.speaker_gender)}`}
                    >
                      <option value="narrator">🎙️ អ្នកសម្រាយ</option>
                      <option value="male">♂️ តួប្រុស</option>
                      <option value="female">♀️ តួស្រី</option>
                      <option value="multi">👥 តួប្រុស & ស្រី</option>
                    </select>

                    {/* Speaker Name Input */}
                    <input
                      type="text"
                      value={seg.speaker_name || ''}
                      placeholder="ឈ្មោះតួអង្គ"
                      onChange={(e) => onSegmentChange(seg.segment_id, 'speaker_name', e.target.value)}
                      className="bg-transparent border-b border-gray-300 focus:border-blue-500 text-[11px] font-khmer font-bold text-gray-800 w-28 px-1 focus:outline-none"
                    />
                  </div>

                  {/* Play & Delete Action Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onPlaySegment(seg)}
                      className={`p-1.5 rounded transition cursor-pointer ${
                        isPlayingThis
                          ? 'bg-amber-500 text-black font-bold animate-bounce'
                          : 'bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-600'
                      }`}
                      title="Play Khmer Voice Dubbing"
                    >
                      {isPlayingThis ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => onDeleteSegment(seg.segment_id)}
                      className="p-1.5 rounded bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete Segment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Khmer Script Text Box */}
                <textarea
                  value={seg.khmer_script}
                  onChange={(e) => onSegmentChange(seg.segment_id, 'khmer_script', e.target.value)}
                  rows={2}
                  className={`w-full bg-transparent border-none text-sm font-khmer leading-relaxed focus:outline-none resize-y ${
                    isActive ? 'text-blue-950 font-semibold' : 'text-gray-800'
                  }`}
                  placeholder={
                    translationMode === 'character_dialogue'
                      ? 'សរសេរការសន្ទនាតួអង្គជាភាសាខ្មែរ...'
                      : 'សរសេរអត្ថបទសម្រាយរឿងជាភាសាខ្មែរ...'
                  }
                />
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400">
            <Mic className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm font-bold text-gray-600 font-khmer mb-1">
              មិនទាន់មានស្គ្រីបនៅឡើយទេ
            </p>
            <p className="text-xs text-gray-400 font-mono mb-3">
              ជ្រើសរើស Mode (សម្រាយរឿង ឬ សន្ទនាតួអង្គ) រួចចុច Regenerate AI Script
            </p>
          </div>
        )}
      </div>

      {/* 4. Dubbing Panel Footer */}
      <div className="p-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0">
        <button
          onClick={onAddSegment}
          className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-xs font-semibold text-gray-700 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Segment</span>
        </button>

        {onRegenerateAll && (
          <button
            onClick={onRegenerateAll}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
            title="Gen ស្គ្រីបថ្មីតាម Mode ដែលបានរើស"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Generate ({translationMode === 'character_dialogue' ? 'សន្ទនាតួអង្គ' : translationMode === 'hybrid_recap_dub' ? 'កូនកាត់' : 'សម្រាយរឿង'})</span>
          </button>
        )}
      </div>

    </div>
  );
};
