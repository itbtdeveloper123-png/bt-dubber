import React, { useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Sparkles, 
  Mic, 
  MessageSquare, 
  AlignLeft, 
  Layers, 
  RefreshCw, 
  Volume2,
  Zap,
  Clock,
  Smile
} from 'lucide-react';
import { MovieRecapResult, ClonedVoiceProfile, TranslationMode } from '../types';

interface DubbingPanelProps {
  recapData: MovieRecapResult | null;
  activeSegmentId: number | null;
  playingSegmentId: number | null;
  isPlayingAll?: boolean;
  ttsSpeed?: number;
  onSpeedChange: (speed: number) => void;
  globalVoicePersona?: string;
  onChangeGlobalVoicePersona?: (persona: string) => void;
  clonedVoices?: ClonedVoiceProfile[];
  onOpenVoiceCloningModal?: () => void;
  onPlaySegment: (segment: any) => void;
  onPlayFullNarration: () => void;
  onTestVoice: () => void;
  onSegmentChange: (segmentId: number, field: string, value: any) => void;
  onSetAllSegmentsEmotion?: (emotion: string) => void;
  onAddSegment: () => void;
  onDeleteSegment: (segmentId: number) => void;
  onRegenerateAll?: () => void;
  onGenerateHook?: () => void;
  onProofreadScript?: () => void;
  isProofreadingScript?: boolean;
  onAutoDetectSpeakers?: () => void;
  isAutoDetectingSpeakers?: boolean;
  onRefineSingleSegment?: (segment: any) => void;
  refiningSegmentId?: number | null;
  isLoading?: boolean;
  translationMode?: TranslationMode;
  onChangeTranslationMode?: (mode: TranslationMode) => void;
  onBatchGenerateAllAudio?: () => void;
  isBatchGeneratingAudio?: boolean;
  batchProgress?: { current: number; total: number };
}

export const DubbingPanel: React.FC<DubbingPanelProps> = ({
  recapData,
  activeSegmentId,
  playingSegmentId,
  isPlayingAll = false,
  ttsSpeed = 1.25,
  onSpeedChange,
  globalVoicePersona = 'auto',
  onChangeGlobalVoicePersona,
  clonedVoices = [],
  onOpenVoiceCloningModal,
  onPlaySegment,
  onPlayFullNarration,
  onTestVoice,
  onSegmentChange,
  onSetAllSegmentsEmotion,
  onAddSegment,
  onDeleteSegment,
  onRegenerateAll,
  onGenerateHook,
  onProofreadScript,
  isProofreadingScript = false,
  onAutoDetectSpeakers,
  isAutoDetectingSpeakers = false,
  onRefineSingleSegment,
  refiningSegmentId = null,
  isLoading = false,
  translationMode = 'movie_recap',
  onChangeTranslationMode = (_mode: TranslationMode) => {},
  onBatchGenerateAllAudio,
  isBatchGeneratingAudio = false,
  batchProgress = { current: 0, total: 0 }
}) => {
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the transcript list to keep active playing segment in view
  useEffect(() => {
    if (activeSegmentId !== null) {
      const el = document.getElementById(`dubbing-segment-${activeSegmentId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeSegmentId]);

  const getSpeakerBadgeClass = (gender?: string) => {
    switch (gender?.toLowerCase()) {
      case 'male':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'female':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'child_boy':
        return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
      case 'child_girl':
        return 'bg-pink-50 text-pink-700 border-pink-300 font-bold';
      case 'narrator':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'male_elder':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'female_elder':
        return 'bg-orange-50 text-orange-800 border-orange-200';
      case 'child':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'villain':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'multi':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        if (gender?.startsWith('voice_')) {
          return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
        }
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const modeDescriptions: Record<TranslationMode, { title: string; subtitle: string; icon: any }> = {
    movie_recap: {
      title: 'សម្រាយសាច់រឿង (Movie Recap)',
      subtitle: 'និទានសង្ខេបសាច់រឿងយ៉ាងរលូន',
      icon: Mic,
    },
    character_dialogue: {
      title: 'សន្ទនាតួអង្គ (Character Dubbing)',
      subtitle: 'បកប្រែផ្ទាល់មាត់តួអង្គប្រុសស្រី',
      icon: MessageSquare,
    },
    word_by_word_lip_sync: {
      title: 'តាមមាត់តួ (Word Lip-Sync)',
      subtitle: 'បកប្រែពាក្យមួយម៉ាត់ៗតាមមាត់តួអង្គ',
      icon: AlignLeft,
    },
    hybrid_recap_dub: {
      title: 'ទម្រង់កូនកាត់ (Hybrid Dubbing)',
      subtitle: 'សម្រាយសាច់រឿង + សន្ទនាតួអង្គ',
      icon: Layers,
    },
  };

  const currentModeInfo = modeDescriptions[translationMode] || modeDescriptions.movie_recap;
  const segmentsCount = recapData?.recap_segments?.length || 0;

  return (
    <div className="w-full lg:w-[440px] xl:w-[500px] 2xl:w-[560px] bg-white border border-gray-200 rounded-xl flex flex-col h-[420px] sm:h-[450px] lg:h-[420px] xl:h-[480px] 2xl:h-[520px] overflow-hidden shadow-xs shrink-0 select-none">
      
      {/* 1. Header Bar 1: Title & Studio Quick Actions */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Title & Segment Count */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-xs font-bold text-gray-900 font-khmer truncate">
              ផ្ទាំងបកប្រែ & បញ្ចូលសំឡេង
            </h2>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold font-khmer px-1.5 py-0.5 rounded-full shrink-0">
              {segmentsCount} ឈុត
            </span>
          </div>
        </div>

        {/* Right: Auto Detect Characters, Voice Clone Studio Button & Speed Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onAutoDetectSpeakers && recapData?.recap_segments && recapData.recap_segments.length > 0 && (
            <button
              type="button"
              onClick={onAutoDetectSpeakers}
              disabled={isAutoDetectingSpeakers || isLoading || isBatchGeneratingAudio}
              className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold font-khmer flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
              title="AI វិភាគរកភេទ អាយុ និងតួអង្គ (ប្រុស ស្រី ក្មេង ចាស់) ដោយស្វ័យប្រវត្តិ"
            >
              <Zap className={`w-3 h-3 text-amber-300 fill-amber-300 ${isAutoDetectingSpeakers ? 'animate-bounce' : ''}`} />
              <span>{isAutoDetectingSpeakers ? 'កំពុង Detect...' : '⚡ Auto តួអង្គ'}</span>
            </button>
          )}

          {onOpenVoiceCloningModal && (
            <button
              type="button"
              onClick={onOpenVoiceCloningModal}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold font-khmer flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
              title="បើក AI Voice Cloning Studio (Upload & Morph សំឡេង)"
            >
              <Mic className="w-3 h-3" />
              <span>Studio សំឡេង</span>
            </button>
          )}

          {/* Speed Selector */}
          <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-xs font-mono gap-1 shadow-2xs shrink-0">
            <span className="text-amber-600 font-bold text-[10px]">⚡</span>
            <select
              value={ttsSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="bg-transparent text-gray-900 font-bold focus:outline-none cursor-pointer text-[10px] sm:text-[11px]"
              title="ល្បឿននៃការនិយាយ (Speech Speed Rate)"
            >
              <option value="1.0">1.0x</option>
              <option value="1.15">1.15x</option>
              <option value="1.25">1.25x</option>
              <option value="1.35">1.35x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Header Bar 2: Dedicated Voice Persona & Global Emotion Toolbar */}
      <div className="px-3 py-1.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/70 border-b border-gray-200 flex items-center justify-between gap-2 shrink-0">
        {/* Voice Persona Selector */}
        {onChangeGlobalVoicePersona && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[11px] font-khmer font-bold text-gray-700 shrink-0">
              <Volume2 className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">សំឡេងអាន៖</span>
            </div>

            <div className="flex-1 min-w-0">
              <select
                value={globalVoicePersona}
                onChange={(e) => onChangeGlobalVoicePersona(e.target.value)}
                className="w-full bg-white border border-gray-300 hover:border-blue-400 rounded-lg px-2 py-1 text-gray-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-[11px] font-khmer truncate shadow-2xs"
                title="ជ្រើសរើសប្រភេទសំឡេងនិយាយខ្មែរ (Edge-TTS ឬ Cloned Profile)"
              >
                <optgroup label="🌟 សំឡេងផ្ទាល់ខ្លួន (Google Colab VoxCPM2)">
                  <option value="auto">✨ តាមតួអង្គ (Auto VoxCPM2 Roles)</option>
                  <option value="child_boy">👦 ក្មេងប្រុស (Boy Child Cloned)</option>
                  <option value="child_girl">👧 ក្មេងស្រី (Girl Child Cloned)</option>
                  {clonedVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.provider === 'voxcpm2' || v.colabUrl ? '⚡' : (v.provider === 'hf' ? '🤗' : (v.provider === 'kiri' ? '🌟' : '🎙️'))} {v.name} ({v.gender === 'female' ? 'ស្រី' : 'ប្រុស'} {v.provider === 'voxcpm2' || v.colabUrl ? 'VoxCPM2' : (v.provider === 'hf' ? 'Free HF' : (v.provider === 'kiri' ? 'Kiri' : 'Cloned'))})
                    </option>
                  ))}
                </optgroup>

                <optgroup label="🇰🇭 KiriTTS AI & Cloned Voices">
                  <option value="kiri_ff">🌟 Kiri: ff (Cloud Clone)</option>
                  <option value="kiri_Chanda">👨‍🦱 Kiri: Chanda (ប្រុស - ស្តង់ដារ)</option>
                  <option value="kiri_Neary">👩‍🦰 Kiri: Neary (ស្រី - ស្រទន់)</option>
                  <option value="kiri_Maly">👩‍🦰 Kiri: Maly (ស្រី - ច្បាស់)</option>
                  <option value="kiri_Bora">👨‍🦱 Kiri: Bora (ប្រុស - រស់រវើក)</option>
                  <option value="kiri_Oudom">👨‍🦱 Kiri: Oudom (ប្រុស - មាំ)</option>
                  <option value="kiri_Setha">👨‍🦱 Kiri: Setha (ប្រុស)</option>
                  <option value="kiri_Theary">👩‍🦰 Kiri: Theary (ស្រី)</option>
                  <option value="kiri_Bosba">👩‍🦰 Kiri: Bosba (ស្រី)</option>
                  <option value="kiri_Borey">👨‍🦱 Kiri: Borey (ប្រុស)</option>
                </optgroup>

                <optgroup label="🤖 Google Gemini Native AI Voices">
                  <option value="gemini_puck">🎭 Gemini Puck (ប្រុស - រំភើប/Dramatic)</option>
                  <option value="gemini_charon">🎙️ Gemini Charon (ប្រុស - បាសធ្ងន់/Deep Bass)</option>
                  <option value="gemini_kore">👩 Gemini Kore (ស្រី - ស្រទន់ធម្មជាតិ/Calm)</option>
                  <option value="gemini_fenrir">⚔️ Gemini Fenrir (ប្រុស - កាច/Intense Action)</option>
                  <option value="gemini_aoede">✨ Gemini Aoede (ស្រី - កក់ក្តៅ/Warm Storyteller)</option>
                </optgroup>

                <optgroup label="🎙️ សំឡេងស្តង់ដារដើម (Microsoft Neural)">
                  <option value="auto_default">🤖 តាមតួអង្គដើម (Piseth & Sreymom)</option>
                  <option value="male">👨‍🦱 Piseth (ពិសិដ្ឋ - សំឡេងប្រុស)</option>
                  <option value="female">👩‍🦰 Sreymom (ស្រីមុំ - សំឡេងស្រី)</option>
                  <option value="narrator">🎙️ Piseth (អ្នកសម្រាយ)</option>
                  <option value="male_elder">👴 Piseth (តាចាស់)</option>
                  <option value="child">👶 Sreymom (កុមារ)</option>
                </optgroup>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 3. Header Bar 3: Four-Way Translation Mode Switcher Tabs */}
      <div className="px-2 py-1.5 bg-slate-100 border-b border-gray-200 grid grid-cols-4 gap-1 text-[10px] font-khmer font-bold select-none shrink-0">
        <button
          type="button"
          onClick={() => onChangeTranslationMode('movie_recap')}
          className={`py-1 px-1 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer truncate ${
            translationMode === 'movie_recap'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="សម្រាយរឿងបែបនិទាន (Movie Recap Narration)"
        >
          <Mic className="w-3 h-3 shrink-0" />
          <span className="truncate">🎙️ សម្រាយ</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('character_dialogue')}
          className={`py-1 px-1 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer truncate ${
            translationMode === 'character_dialogue'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="បកប្រែតាមតួអង្គនិយាយ (Direct Character Dialogue Dubbing)"
        >
          <MessageSquare className="w-3 h-3 shrink-0" />
          <span className="truncate">🎭 សន្ទនា</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('word_by_word_lip_sync')}
          className={`py-1 px-1 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer truncate ${
            translationMode === 'word_by_word_lip_sync'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="បកប្រែពាក្យមួយម៉ាត់ៗ តាមមាត់តួអង្គ (Word-by-Word Lip-Sync Dubbing)"
        >
          <AlignLeft className="w-3 h-3 shrink-0" />
          <span className="truncate">👄 តាមមាត់</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTranslationMode('hybrid_recap_dub')}
          className={`py-1 px-1 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer truncate ${
            translationMode === 'hybrid_recap_dub'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-200'
          }`}
          title="ទម្រង់កូនកាត់: សម្រាយសាច់រឿង + សន្ទនាតួអង្គ (Hybrid Mode)"
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span className="truncate">🌟 កូនកាត់</span>
        </button>
      </div>

      {/* 4. Dubbing Transcript Items List */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 bg-gray-50/50">
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
                {/* Segment Top Controls Bar (Cleanly Organized & Well-spaced) */}
                <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-gray-100/80">
                  {/* Left Controls: Timestamp, Role Gender, Character Name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                    {/* Timestamp */}
                    <div className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{seg.start_time}-{seg.end_time}</span>
                    </div>

                    {/* Speaker Gender/Role Dropdown */}
                    <select
                      value={seg.speaker_gender || 'narrator'}
                      onChange={(e) => onSegmentChange(seg.segment_id, 'speaker_gender', e.target.value)}
                      className={`text-[10px] font-bold font-khmer px-2 py-0.5 rounded-md border shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer max-w-[125px] sm:max-w-[140px] truncate shrink-0 transition ${getSpeakerBadgeClass(seg.speaker_gender)}`}
                    >
                      <option value="narrator">🎙️ អ្នកសម្រាយ</option>
                      <option value="male">👨‍🦱 តួប្រុស</option>
                      <option value="female">👩‍🦰 តួស្រី</option>
                      <option value="child_boy">👦 ក្មេងប្រុស</option>
                      <option value="child_girl">👧 ក្មេងស្រី</option>
                      <option value="male_elder">👴 តាចាស់</option>
                      <option value="female_elder">👵 យាយចាស់</option>
                      <option value="child">👶 កុមារ</option>
                      <option value="villain">🦹 តួអាក្រក់</option>
                      <option value="multi">👥 ប្រុស&ស្រី</option>
                      {clonedVoices.length > 0 && (
                        <optgroup label="🎙️ Cloned Voices">
                          {clonedVoices.map((v) => (
                            <option key={v.id} value={v.id}>
                              🎙️ {v.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    {/* Speaker Name Input */}
                    <input
                      type="text"
                      value={seg.speaker_name || ''}
                      placeholder="ឈ្មោះតួ..."
                      onChange={(e) => onSegmentChange(seg.segment_id, 'speaker_name', e.target.value)}
                      className="bg-transparent border-b border-dashed border-gray-300 hover:border-gray-400 focus:border-blue-500 text-[10px] sm:text-[11px] font-khmer text-gray-700 w-[60px] sm:w-[75px] px-1 py-0.5 focus:outline-none placeholder:text-gray-400 placeholder:italic transition"
                    />
                  </div>

                  {/* Right Controls: Play Button, Delete Button */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Play Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlaySegment(seg);
                      }}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition flex items-center justify-center cursor-pointer active:scale-95 shrink-0 shadow-2xs ${
                        isPlayingThis
                          ? 'bg-amber-500 text-white font-bold ring-2 ring-amber-300 animate-pulse'
                          : 'bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 hover:border-blue-600'
                      }`}
                      title={isPlayingThis ? "Pause Khmer Voice" : "Play Khmer Voice Dubbing"}
                    >
                      {isPlayingThis ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(seg.segment_id);
                      }}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-200 transition opacity-60 hover:opacity-100 flex items-center justify-center cursor-pointer shrink-0"
                      title="Delete Segment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Original foreign dialogue subtitle display (if present) */}
                {seg.original_summary && seg.original_summary !== seg.khmer_script && (
                  <div className="text-[10px] text-gray-500 font-sans italic bg-gray-100/80 px-2 py-0.5 rounded my-1 truncate">
                    Orig: "{seg.original_summary}"
                  </div>
                )}

                {/* Editable Khmer Dubbing Script + Quick Refine Bar */}
                <div className="relative">
                  <textarea
                    value={seg.khmer_script || ''}
                    onChange={(e) => onSegmentChange(seg.segment_id, 'khmer_script', e.target.value)}
                    rows={2}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 pr-8 text-xs sm:text-[13px] font-khmer leading-relaxed text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none shadow-2xs"
                    placeholder="បញ្ចូលអត្ថបទសម្រាយ ឬសន្ទនាជាភាសាខ្មែរ..."
                  />
                  {onRefineSingleSegment && (
                    <button
                      type="button"
                      onClick={() => onRefineSingleSegment(seg)}
                      disabled={refiningSegmentId === seg.segment_id}
                      className="absolute right-1.5 bottom-2.5 p-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-600 hover:text-purple-700 transition opacity-70 hover:opacity-100 cursor-pointer shadow-2xs"
                      title="AI ជួយសម្រួលពាក្យក្នុងប្រយោគនេះឱ្យរលូន និងត្រូវសាច់រឿង (AI Refine Line)"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${refiningSegmentId === seg.segment_id ? 'animate-spin text-amber-500' : ''}`} />
                    </button>
                  )}
                </div>

                {/* Segment Audio Fine-Tuning Strip (Speed, Volume Gain, Emotion) */}
                <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-1.5 text-[9px] font-khmer text-gray-500">
                  <div className="flex items-center gap-1.5">
                    {/* Emotion Selector */}
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200/80 px-1.5 py-0.5 rounded-md">
                      <Smile className="w-2.5 h-2.5 text-amber-500" />
                      <select
                        value={seg.voice_emotion || seg.voice_tone || 'neutral'}
                        onChange={(e) => onSegmentChange(seg.segment_id, 'voice_emotion', e.target.value)}
                        className="bg-transparent text-[9px] font-khmer font-medium text-gray-700 focus:outline-none cursor-pointer"
                      >
                        <option value="neutral">😐 ធម្មតា</option>
                        <option value="excited">🤩 រំភើប</option>
                        <option value="dramatic">🎭 ជក់ចិត្ត</option>
                        <option value="angry">😡 ខឹង</option>
                        <option value="sad">😢 កម្សត់</option>
                        <option value="fear">😨 ភ័យខ្លាច</option>
                        <option value="whisper">🤫 ខ្សឹប</option>
                      </select>
                    </div>

                    {/* Speed Multiplier */}
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200/80 px-1.5 py-0.5 rounded-md font-mono">
                      <Zap className="w-2.5 h-2.5 text-blue-500" />
                      <select
                        value={seg.playback_speed || 1.0}
                        onChange={(e) => onSegmentChange(seg.segment_id, 'playback_speed', parseFloat(e.target.value))}
                        className="bg-transparent text-[9px] font-mono font-medium text-gray-700 focus:outline-none cursor-pointer"
                      >
                        <option value="0.8">0.8x (យឺត)</option>
                        <option value="0.9">0.9x</option>
                        <option value="1.0">1.0x (ស្តង់ដារ)</option>
                        <option value="1.15">1.15x</option>
                        <option value="1.25">1.25x (លឿន)</option>
                        <option value="1.4">1.4x</option>
                        <option value="1.5">1.5x</option>
                      </select>
                    </div>

                    {/* Volume Gain */}
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200/80 px-1.5 py-0.5 rounded-md font-mono">
                      <Volume2 className="w-2.5 h-2.5 text-emerald-500" />
                      <select
                        value={seg.volume_gain || 1.0}
                        onChange={(e) => onSegmentChange(seg.segment_id, 'volume_gain', parseFloat(e.target.value))}
                        className="bg-transparent text-[9px] font-mono font-medium text-gray-700 focus:outline-none cursor-pointer"
                      >
                        <option value="0.7">70%</option>
                        <option value="0.85">85%</option>
                        <option value="1.0">100%</option>
                        <option value="1.15">115%</option>
                        <option value="1.3">130%</option>
                      </select>
                    </div>
                  </div>

                  <span className="text-[8.5px] font-mono text-gray-400">
                    ID: #{seg.segment_id}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400">
            <Mic className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-xs sm:text-sm font-bold font-khmer text-gray-600 mb-1">
              មិនទាន់មានស្គ្រីបបកប្រែនៅឡើយទេ
            </p>
            <p className="text-[10px] sm:text-xs text-gray-400 font-mono mb-3">
              ជ្រើសរើស Mode (សម្រាយ, សន្ទនា, តាមមាត់តួ, កូនកាត់) រួចចុច Generate AI Script
            </p>
          </div>
        )}
      </div>

      {/* 5. Dubbing Panel Footer Toolbar (Organized 2-Tier Clean Layout) */}
      <div className="p-2.5 sm:p-3 border-t border-gray-200 bg-slate-50/90 flex flex-col gap-2 shrink-0">
        
        {/* Tier 1: Script Editing & AI Utility Tools */}
        <div className="grid grid-cols-5 gap-1.5 w-full">
          {/* 1. Add Segment */}
          <button
            onClick={onAddSegment}
            className="px-1 py-1.5 rounded-lg bg-white hover:bg-gray-100 border border-gray-300 text-[11px] font-bold text-gray-700 transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 font-khmer truncate"
            title="បន្ថែមប្រយោគថ្មី (Add Segment)"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">ថែមឈុត</span>
          </button>

          {/* 2. AI Hook */}
          {onGenerateHook && (
            <button
              onClick={onGenerateHook}
              className="px-1 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-[11px] font-bold font-khmer transition flex items-center justify-center gap-1 shadow-2xs active:scale-95 cursor-pointer truncate"
              title="បង្កើតឈុត 3 វិនាទីដំបូងដែលទាក់ទាញបំផុត (AI Intro Hook Generator)"
            >
              <span>🔥</span>
              <span className="truncate">Hook</span>
            </button>
          )}

          {/* 3. AI Auto-Detect Characters */}
          {onAutoDetectSpeakers && recapData?.recap_segments && recapData.recap_segments.length > 0 && (
            <button
              onClick={onAutoDetectSpeakers}
              disabled={isAutoDetectingSpeakers || isLoading || isBatchGeneratingAudio}
              className="px-1 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 border border-teal-600 text-white text-[11px] font-bold font-khmer transition flex items-center justify-center gap-1 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50 truncate"
              title="AI វិភាគរកភេទ អាយុ និងតួអង្គ (ប្រុស ស្រី ក្មេង ចាស់) ដោយស្វ័យប្រវត្តិ (AI Auto-Detect Character Genders)"
            >
              <Zap className={`w-3 h-3 text-amber-300 fill-amber-300 shrink-0 ${isAutoDetectingSpeakers ? 'animate-bounce' : ''}`} />
              <span className="truncate">{isAutoDetectingSpeakers ? 'កំពុង...' : '⚡ តួអង្គ'}</span>
            </button>
          )}

          {/* 4. AI Proofread */}
          {onProofreadScript && recapData?.recap_segments && recapData.recap_segments.length > 0 && (
            <button
              onClick={onProofreadScript}
              disabled={isProofreadingScript || isLoading || isBatchGeneratingAudio}
              className="px-1 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-[11px] font-bold font-khmer transition flex items-center justify-center gap-1 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50 truncate"
              title="AI ពិនិត្យឈ្មោះតួអង្គ ពាក្យខុស និងសម្រួលអត្ថបទស្វ័យប្រវត្តិ (AI Auto-Proofread)"
            >
              <Sparkles className={`w-3 h-3 text-purple-600 shrink-0 ${isProofreadingScript ? 'animate-spin' : ''}`} />
              <span className="truncate">{isProofreadingScript ? 'កំពុងកែ...' : '✨ កែស្គ្រីប'}</span>
            </button>
          )}

          {/* 5. Regenerate */}
          {onRegenerateAll && (
            <button
              onClick={onRegenerateAll}
              disabled={isLoading || isProofreadingScript || isBatchGeneratingAudio}
              className="px-1 py-1.5 rounded-lg bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-[11px] font-bold font-khmer transition flex items-center justify-center gap-1 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50 truncate"
              title="Gen ស្គ្រីប AI ថ្មី (Regenerate Script)"
            >
              <RefreshCw className={`w-3 h-3 text-slate-600 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="truncate">Gen ស្គ្រីប</span>
            </button>
          )}
        </div>

        {/* Tier 2: Primary High-Impact Action - Batch Generate All Cloned Voices */}
        {onBatchGenerateAllAudio && recapData?.recap_segments && recapData.recap_segments.length > 0 && (() => {
          const currentCount = batchProgress?.current || 0;
          const totalCount = batchProgress?.total || recapData.recap_segments.length || 1;
          const percent = Math.min(100, Math.max(0, Math.round((currentCount / totalCount) * 100)));

          return (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={onBatchGenerateAllAudio}
                disabled={isBatchGeneratingAudio || isLoading || isProofreadingScript}
                className={`relative overflow-hidden w-full py-2.5 px-3 rounded-xl text-white text-xs font-bold font-khmer transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed ${
                  isBatchGeneratingAudio
                    ? 'bg-slate-900 border border-teal-500/50 text-teal-200 ring-2 ring-teal-500/30'
                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg'
                }`}
                title={
                  globalVoicePersona === 'auto_default' || globalVoicePersona?.startsWith('edge_')
                    ? "បង្កើតសំឡេង Microsoft Edge-TTS (Piseth & Sreymom) លឿនរហ័សគ្រប់ឈុត (1-Click Batch Voice Generation)"
                    : "បង្កើតសំឡេង Cloned VoxCPM គ្រប់ឈុតទាំងអស់ម្តងតែមួយ (1-Click Batch Voice Generation)"
                }
              >
                {/* Live Real-Time Animated Progress Fill */}
                {isBatchGeneratingAudio && (
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-teal-600/60 via-emerald-500/70 to-indigo-600/60 transition-all duration-300 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                )}

                {/* Shimmer pulse effect when running */}
                {isBatchGeneratingAudio && (
                  <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                )}

                <div className="relative z-10 flex items-center justify-center gap-2">
                  <Zap className={`w-4 h-4 text-amber-300 fill-amber-300 ${isBatchGeneratingAudio ? 'animate-bounce' : ''}`} />
                  <span className="tracking-wide">
                    {isBatchGeneratingAudio
                      ? `⚡ កំពុងបង្កើតសំឡេង Real-Time (${currentCount}/${totalCount} ឈុត) • ${percent}%`
                      : globalVoicePersona === 'auto_default' || globalVoicePersona?.startsWith('edge_')
                        ? `⚡ បង្កើតសំឡេង Piseth & Sreymom (${recapData.recap_segments.length} ឈុត)`
                        : `⚡ បង្កើតសំឡេង Cloned ទាំងអស់ (${recapData.recap_segments.length} ឈុត)`}
                  </span>
                </div>
              </button>
            </div>
          );
        })()}

      </div>

    </div>
  );
};
