export type VoiceTone = 'dramatic' | 'excited' | 'neutral' | 'tense' | 'emotional' | 'mysterious';
export type VoiceEmotion = 'neutral' | 'angry' | 'sad' | 'excited' | 'fear' | 'whisper' | 'dramatic';
export type SpeakerGender = 'male' | 'female' | 'male_elder' | 'female_elder' | 'child' | 'child_boy' | 'child_girl' | 'villain' | 'narrator' | 'multi' | string;

export type TranslationMode = 'movie_recap' | 'character_dialogue' | 'word_by_word_lip_sync' | 'hybrid_recap_dub';

export interface RecapSegment {
  segment_id: number;
  start_time: string;
  end_time: string;
  original_summary: string;
  khmer_script: string;
  voice_tone: VoiceTone | string;
  voice_emotion?: VoiceEmotion | string;
  speaker_gender?: SpeakerGender;
  speaker_name?: string;
  speaker_type?: 'narrator' | 'male' | 'female' | 'multi';
  character_role?: string;
  playback_speed?: number; // 0.75x to 2.0x
  volume_gain?: number;    // 0.2 to 2.0 (1.0 = normal)
  pitch_shift?: number;    // -12 to +12 semitones
  selected_voice?: string; // Custom assigned voice ID
}

export interface RecapFolder {
  id: string;
  name: string;
  color?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VoiceRolesMapping {
  male?: string;       // Default Male character voice ID or 'male' / 'km-KH-PisethNeural'
  female?: string;     // Default Female character voice ID or 'female' / 'km-KH-SreymomNeural'
  narrator?: string;   // Default Narrator voice ID or 'narrator'
  child?: string;      // Default Child voice ID or 'child'
  child_boy?: string;  // Child Boy voice derived from cloned voice
  child_girl?: string; // Child Girl voice derived from cloned voice
  male_elder?: string;
  female_elder?: string;
  villain?: string;
}

export interface MovieRecapResult {
  id?: string;
  movie_title: string;
  seriesTitle?: string;
  folderName?: string;
  folderId?: string;
  episodeNumber?: number;
  total_recap_duration_est: string;
  recap_segments: RecapSegment[];
  genre_tag?: string;
  created_at?: string;
  updated_at?: string;
  videoUrl?: string;
  videoFileName?: string;
  mediaType?: 'video' | 'audio' | 'text';
  rawFile?: File;
  translationMode?: TranslationMode;
  bgmTrackUrl?: string;
  bgmFileName?: string;
  voiceRolesMapping?: VoiceRolesMapping;
  watermarkCleanerConfig?: WatermarkCleanerConfig;
  lipSyncConfig?: LipSyncConfig;
  old_title?: string;
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

export interface AntiCopyrightConfig {
  enabled: boolean;
  flipHorizontal: boolean; // ត្រឡប់រូបភាពឆ្វេង-ស្តាំ (Mirror)
  zoomScale: number; // 1.0 to 1.15 (Zoom កាត់គែមដើម្បីផ្លាស់ប្តូរ Fingerprint)
  colorFilter: 'none' | 'cinematic_warm' | 'cinematic_cool' | 'golden_hour' | 'film_noir' | 'vibrant_boost'; // តម្រងពណ៌
  microSpeed: number; // 1.0, 1.04, 1.06, 1.08 (ល្បឿនការពារ Copyright)
  filmGrain: boolean; // Micro Film Grain
  vignette: boolean; // ស្រមោលគែមខ្មៅបែបភាពយន្ត
  blurBackground?: boolean; // Dynamic Blur Border
}

export interface EpisodeClip {
  id: string;
  recapId?: string;
  episodeNumber: number;
  title: string;
  videoUrl: string;
  videoFileName?: string;
  duration: number; // Duration in seconds
  trimStart: number; // Trim start offset in seconds
  trimEnd: number; // Trim end offset in seconds
  speed: number; // 0.75, 1.0, 1.25, 1.5, 2.0
  volume: number; // 0 to 1
  dubbedAudioUrl?: string;
  bgmTrackUrl?: string;
  bgmVolume?: number;
  segments?: RecapSegment[];
  transition?: 'none' | 'fade' | 'dissolve' | 'wipe';
  antiCopyright?: AntiCopyrightConfig;
}

export interface SeriesProject {
  id: string;
  title: string;
  description?: string;
  clips: EpisodeClip[];
  aspectRatio: '16:9' | '9:16' | '1:1';
  antiCopyright?: AntiCopyrightConfig;
  created_at: string;
  updated_at: string;
}

export interface WatermarkConfig {
  enabled: boolean;
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity: number; // 0.1 to 1.0
  scale: number; // 0.5 to 2.0
  color?: string;
}

export interface RenderExportConfig {
  resolution: '720p' | '1080p';
  fps: 30 | 60;
  burnSubtitles: boolean;
  applyAntiCopyright: boolean;
  applyWatermark: boolean;
  watermark?: WatermarkConfig;
}

export interface RenderJobStatus {
  jobId: string;
  status: 'idle' | 'rendering' | 'completed' | 'failed';
  progress: number; // 0 to 100
  message: string;
  outputUrl?: string;
  outputFileName?: string;
  error?: string;
}

export interface KiriVoiceItem {
  voice_id: string;
  name: string;
  category: 'Cloned' | 'Standard' | string;
  gender: 'male' | 'female' | null;
  description?: string | null;
  owned_by?: string;
}

export interface ClonedVoiceProfile {
  id: string;
  name: string;
  description?: string;
  gender: 'male' | 'female';
  sampleAudioUrl?: string;
  sampleFileName?: string;
  sampleText?: string;
  pitchOffset: number; // -50 to +50 Hz
  formantShift: number; // 0.7 to 1.3
  speedRate: number; // 0.8 to 1.5
  timbrePreset: 'natural' | 'warm_deep' | 'crisp_clear' | 'energetic' | 'vintage_radio' | 'pure_clone';
  baseVoice: string;
  isPureClone?: boolean;
  audioBase64?: string;
  provider?: 'edge' | 'kiri' | 'gemini' | 'hf' | 'voxcpm2' | 'colab';
  kiriVoiceId?: string;
  hfModel?: string;
  colabUrl?: string;
  created_at: string;
  updated_at: string;
}

export interface SubtitleStyleConfig {
  enabled: boolean;
  preset: 'tiktok_pop' | 'cinematic_gold' | 'neon_cyan' | 'classic_clean';
  fontFamily: 'Kantumruy Pro' | 'Moul' | 'Siemreap' | 'Battambang' | 'sans-serif';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  position: 'bottom' | 'middle' | 'top';
  animationType: 'karaoke_word' | 'pop_scale' | 'fade_in' | 'static';
  highlightColor: string;
  textColor: string;
  strokeColor: string;
  bgBox: 'none' | 'shadow' | 'pill_blur' | 'black_bar';
}

export interface CleanerZone {
  id: string;
  name: string;
  xPercent: number;      // 0 - 100%
  yPercent: number;      // 0 - 100%
  widthPercent: number;  // 0 - 100%
  heightPercent: number; // 0 - 100%
  method: 'smart_delogo' | 'gaussian_blur' | 'cinematic_backdrop' | 'mosaic';
  intensity: number;     // 1 - 20 (blur radius / opacity)
}

export interface WatermarkCleanerConfig {
  enabled: boolean;
  zones: CleanerZone[];
}

export interface LipSyncConfig {
  enabled: boolean;
  colabUrl?: string;
  faceEnhancer: boolean;       // GFPGAN / CodeFormer HD restore
  pads: [number, number, number, number]; // top, bottom, left, right padding
  targetScope: 'all_dialogue' | 'selected_segments';
  selectedSegmentIds?: number[];
  batchSize?: number;
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      version: string;
      isElectron: boolean;
      openExternal: (url: string) => Promise<void>;
      showItemInFolder: (fullPath: string) => Promise<boolean>;
      checkForUpdates: () => Promise<{ success: boolean; updateInfo?: any; isDev?: boolean; error?: string }>;
      startDownloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      quitAndInstallUpdate: () => void;
      onUpdateAvailable: (callback: (info: any) => void) => () => void;
      onUpdateNotAvailable: (callback: (info: any) => void) => () => void;
      onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond?: number; transferred?: number; total?: number }) => void) => () => void;
      onUpdateDownloaded: (callback: (info: any) => void) => () => void;
      onUpdateError: (callback: (err: any) => void) => () => void;
    };
  }
}




