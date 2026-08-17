export interface BgmPreset {
  id: string;
  name: string;
  category: string;
  url: string;
}

export const CINEMATIC_BGM_PRESETS: BgmPreset[] = [
  {
    id: 'epic_action',
    name: '🎬 Epic Action & Suspense',
    category: 'Action',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=cinematic-time-lapse-115672.mp3'
  },
  {
    id: 'fast_recap',
    name: '⚡ Fast Movie Recap Beat',
    category: 'Recap Energy',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=action-trailer-110034.mp3'
  },
  {
    id: 'emotional_drama',
    name: '💖 Emotional Drama Piano',
    category: 'Drama',
    url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=emotional-piano-sad-10874.mp3'
  },
  {
    id: 'dark_mystery',
    name: '🕵️ Dark Mystery & Suspense',
    category: 'Thriller',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3?filename=dark-mystery-trailer-122976.mp3'
  },
  {
    id: 'trailer_rock',
    name: '🔥 Intense Cinematic Rock',
    category: 'Trailer',
    url: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_74c5d7df51.mp3?filename=action-rock-1412.mp3'
  }
];

export const DEFAULT_BGM_URL = CINEMATIC_BGM_PRESETS[0].url;
