export type VoiceTone = 'dramatic' | 'excited' | 'neutral' | 'tense' | 'emotional' | 'mysterious';
export type SpeakerGender = 'male' | 'female' | 'male_elder' | 'female_elder' | 'child' | 'villain' | 'narrator' | 'multi' | string;

export type TranslationMode = 'movie_recap' | 'character_dialogue' | 'word_by_word_lip_sync' | 'hybrid_recap_dub';

export interface RecapSegment {
  segment_id: number;
  start_time: string;
  end_time: string;
  original_summary: string;
  khmer_script: string;
  voice_tone: VoiceTone | string;
  speaker_gender?: SpeakerGender;
  speaker_name?: string;
  speaker_type?: 'narrator' | 'male' | 'female' | 'multi';
  character_role?: string;
}

export interface MovieRecapResult {
  movie_title: string;
  seriesTitle?: string;
  episodeNumber?: number;
  total_recap_duration_est: string;
  recap_segments: RecapSegment[];
  genre_tag?: string;
  created_at?: string;
  videoUrl?: string;
  videoFileName?: string;
  mediaType?: 'video' | 'audio' | 'text';
  rawFile?: File;
  translationMode?: TranslationMode;
  bgmTrackUrl?: string;
  bgmFileName?: string;
}

export type SourceLanguage = 'auto' | 'en' | 'zh' | 'ko' | 'th';

export type RecapStyle = 'dramatic_action' | 'emotional_romance' | 'dark_mystery' | 'fast_comedy' | 'intense_thriller';

export interface GenerationParams {
  transcript?: string;
  mediaData?: string; // Base64 representation of video or audio file
  mediaMimeType?: string; // e.g., 'video/mp4', 'audio/mp3'
  mediaFileName?: string;
  mediaUrl?: string; // Blob URL for local video player preview
  inputMode?: 'video' | 'text';
  translationMode?: TranslationMode;
  sourceLanguage: SourceLanguage;
  recapStyle: RecapStyle;
  targetDurationMin: number;
  customNotes?: string;
  episodeNumber?: number;
  seriesTitle?: string;
  previousContext?: string;
}

export interface SampleTranscript {
  id: string;
  title: string;
  language: string;
  languageCode: SourceLanguage;
  genre: string;
  content: string;
  description: string;
}
