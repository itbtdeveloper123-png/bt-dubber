import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, Download, Copy, Check, Sparkles, Image, Video, Camera, 
  Layers, Palette, Type, Eye, EyeOff, Sliders, RefreshCw, 
  Plus, Minus, BookmarkCheck, LayoutTemplate, ShieldCheck,
  Users, FolderDown
} from 'lucide-react';
import { 
  ReelsThumbnailConfig, 
  ThumbnailBadgeStyle, 
  ThumbnailLayoutMode, 
  ThumbnailTextStyle,
  RecapSegment
} from '../types';

interface ReelsThumbnailModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  seriesTitle?: string;
  segments?: RecapSegment[];
  episodeNumber?: number;
  videoUrl?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  currentThumbnailUrl?: string;
  onSaveThumbnail: (dataUrl: string, config: ReelsThumbnailConfig) => void;
  onToast?: (type: 'success' | 'warning' | 'error' | 'info', title: string, message?: string) => void;
}

const BADGE_PRESETS: { id: ThumbnailBadgeStyle; name: string; icon: string; previewClass: string }[] = [
  { id: 'golden_vip', name: '👑 Golden VIP', icon: '👑', previewClass: 'from-amber-400 to-yellow-600 text-black border-amber-300' },
  { id: 'neon_red', name: '🔥 Fiery Red', icon: '🔥', previewClass: 'from-red-600 to-rose-700 text-white border-red-400' },
  { id: 'cyber_cyan', name: '⚡ Cyber Cyan', icon: '⚡', previewClass: 'from-cyan-500 to-blue-600 text-white border-cyan-300' },
  { id: 'cinematic_pill', name: '🖤 Glass Pill', icon: '🖤', previewClass: 'from-slate-900 to-slate-800 text-amber-300 border-amber-400/50' },
  { id: 'ribbon', name: '🏷️ Ribbon Tag', icon: '🏷️', previewClass: 'from-purple-600 to-indigo-700 text-white border-purple-400' },
  { id: 'solid_box', name: '🟡 Bold Yellow', icon: '🟡', previewClass: 'from-yellow-400 to-amber-500 text-black border-black' },
];

const TEXT_STYLES: { id: ThumbnailTextStyle; name: string; fill: string; stroke: string }[] = [
  { id: 'white_black_stroke', name: '⚪ ស + គែមខ្មៅដិត (ពេញនិយមបំផុត)', fill: '#ffffff', stroke: '#000000' },
  { id: 'gold_gradient', name: '🥇 មាសភ្លឺ 3D', fill: '#ffd700', stroke: '#000000' },
  { id: 'fiery_red', name: '🔥 ភ្លើងក្រហមទាក់ទាញ', fill: '#ff4d4d', stroke: '#220000' },
  { id: 'cyber_yellow', name: '⚡ លឿងអ៊ីយូតា (Neon)', fill: '#ffff00', stroke: '#000000' },
  { id: 'royal_purple', name: '🟣 ស្វាយរាជសព្ទ Glow', fill: '#e9d5ff', stroke: '#3b0764' },
];

const KHMER_FONTS = [
  { id: 'Moul', name: 'អក្សរមូល (Moul) - ស្ទីលរឿងបុរាណ' },
  { id: 'Kantumruy Pro', name: 'កន្ទុមរុយ (Kantumruy Pro) - ទំនើបច្បាស់' },
  { id: 'Battambang', name: 'បាត់ដំបង (Battambang) - អក្សរដិតធំ' },
  { id: 'Bayon', name: 'បាយ័ន (Bayon) - រឹងមាំទាក់ទាញ' },
  { id: 'Siemreap', name: 'សៀមរាប (Siemreap) - ស្រទន់សមរម្យ' },
];

const POPULAR_STICKERS = [
  '🔥 កំពុងពេញនិយម',
  '🎬 រឿងភាគថ្មី',
  '⭐ វគ្គជក់ចិត្ត',
  '⚡ 1080p Full HD',
  '🇰🇭 សម្រាយសាច់រឿង',
  '💥 ចប់ក្នុងភាគនេះ'
];

export const ReelsThumbnailModal: React.FC<ReelsThumbnailModalProps> = ({
  isOpen,
  onClose,
  movieTitle,
  seriesTitle,
  segments = [],
  episodeNumber = 1,
  videoUrl,
  videoRef,
  currentThumbnailUrl,
  onSaveThumbnail,
  onToast
}) => {
  // Main Canvas & Video Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Master Series Storage Key (Shared across all episodes/pages of this series)
  const cleanSeriesName = (seriesTitle || movieTitle || 'series').trim();
  const seriesStorageKey = useMemo(() => {
    return 'bt_master_cover_' + cleanSeriesName.toLowerCase().replace(/[^a-zA-Z0-9\u1780-\u17FF_-]/g, '_');
  }, [cleanSeriesName]);

  // Detected Characters from Segments
  const detectedCharacters = useMemo(() => {
    if (!segments || !Array.isArray(segments)) return [];
    const set = new Set<string>();
    segments.forEach(s => {
      if (s.speaker_name && s.speaker_name !== 'អ្នកសម្រាយ' && s.speaker_name !== 'Narrator' && s.speaker_name.length > 1) {
        set.add(s.speaker_name.trim());
      }
    });
    return Array.from(set);
  }, [segments]);

  // AI Master Series Cover Generator State
  const [isGeneratingAiCover, setIsGeneratingAiCover] = useState<boolean>(false);
  const [aiCharactersList, setAiCharactersList] = useState<string[]>([]);
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState<string>('');
  const [showAiPromptEditor, setShowAiPromptEditor] = useState<boolean>(false);
  const [customAiVision, setCustomAiVision] = useState<string>('');
  const [isMasterCoverSaved, setIsMasterCoverSaved] = useState<boolean>(false);

  // Batch Episode Exporter State
  const [isBatchExporting, setIsBatchExporting] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchRange, setBatchRange] = useState<{ start: number; end: number }>({ 
    start: 1, 
    end: Math.max(10, episodeNumber || 10) 
  });

  // Thumbnail Configuration State
  const [config, setConfig] = useState<ReelsThumbnailConfig>(() => {
    const formattedEp = String(episodeNumber).padStart(2, '0');
    return {
      movieTitle: movieTitle || 'សម្រាយសាច់រឿង',
      episodeText: `ភាគ ${formattedEp}`,
      taglineText: 'សម្រាយសាច់រឿងលម្អិត • ចប់ក្នុងភាគនេះ',
      badgeStyle: 'golden_vip',
      badgePosition: 'safe_center',
      badgeScale: 1.1,
      textStyle: 'white_black_stroke',
      fontFamily: 'Moul',
      titleFontSize: 72,
      layoutMode: 'single_hero',
      heroImage: currentThumbnailUrl || '',
      splitImages: ['', '', ''],
      showSafeZoneGuide: true,
      showVignette: true,
      tagStickers: ['🔥 កំពុងពេញនិយម', '🇰🇭 សម្រាយសាច់រឿង'],
      brightness: 1.0,
      contrast: 1.1,
      saturation: 1.15,
      aspectRatio: '9:16'
    };
  });

  // Local Video Playhead & Frame Picker State
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(60);
  const [autoKeyframes, setAutoKeyframes] = useState<{ time: number; dataUrl: string }[]>([]);
  const [isExtractingKeyframes, setIsExtractingKeyframes] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Sync title, check saved Master Cover & auto-capture video frame when modal opens
  useEffect(() => {
    if (isOpen) {
      // 1. Check if there's an existing Master Cover saved for this series
      const savedMasterCover = localStorage.getItem(seriesStorageKey);
      if (savedMasterCover) {
        setIsMasterCoverSaved(true);
      }

      const initialHeroImage = currentThumbnailUrl || savedMasterCover || '';

      if (movieTitle) {
        setConfig(prev => ({
          ...prev,
          movieTitle: prev.movieTitle === 'សម្រាយសាច់រឿង' || !prev.movieTitle ? movieTitle : prev.movieTitle,
          heroImage: prev.heroImage || initialHeroImage
        }));
      } else if (initialHeroImage) {
        setConfig(prev => ({
          ...prev,
          heroImage: prev.heroImage || initialHeroImage
        }));
      }

      // 2. If no thumbnail and no saved master cover, capture the current frame from video player!
      if (!initialHeroImage && !config.heroImage) {
        const sourceVideo = (videoRef?.current && videoRef.current.readyState >= 2) 
          ? videoRef.current 
          : previewVideoRef.current;

        if (sourceVideo && sourceVideo.readyState >= 2) {
          try {
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = sourceVideo.videoWidth || 1920;
            snapCanvas.height = sourceVideo.videoHeight || 1080;
            const ctx = snapCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(sourceVideo, 0, 0, snapCanvas.width, snapCanvas.height);
              const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);
              setConfig(prev => ({ ...prev, heroImage: prev.heroImage || dataUrl }));
            }
          } catch (e) {
            console.warn('Auto capture frame on open notice:', e);
          }
        }
      }
    }
  }, [isOpen, movieTitle, currentThumbnailUrl, videoRef, seriesStorageKey]);

  // Handle Video Duration & Sync with Parent Video
  useEffect(() => {
    if (videoRef?.current && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0) {
      setVideoDuration(videoRef.current.duration);
      setVideoCurrentTime(videoRef.current.currentTime);
      
      // If modal opens and heroImage is still empty, capture from current player position
      if (isOpen && !config.heroImage && videoRef.current.readyState >= 2) {
        try {
          const snapCanvas = document.createElement('canvas');
          snapCanvas.width = videoRef.current.videoWidth || 1920;
          snapCanvas.height = videoRef.current.videoHeight || 1080;
          const ctx = snapCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, snapCanvas.width, snapCanvas.height);
            const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);
            setConfig(prev => ({ ...prev, heroImage: prev.heroImage || dataUrl }));
          }
        } catch {}
      }
    }
  }, [isOpen, videoRef, config.heroImage]);

  // Quick Episode Helpers
  const handleSetEpisodeNumber = (num: number) => {
    const padded = String(Math.max(1, num)).padStart(2, '0');
    setConfig(prev => ({ ...prev, episodeText: `ភាគ ${padded}` }));
  };

  const handleIncrementEpisode = (delta: number) => {
    const currentNumMatch = config.episodeText.match(/\d+/);
    const cur = currentNumMatch ? parseInt(currentNumMatch[0], 10) : 1;
    handleSetEpisodeNumber(cur + delta);
  };

  // 📸 Capture Current Frame from Video into the Active Slot
  const handleCaptureVideoFrame = () => {
    let sourceVideo: HTMLVideoElement | null = previewVideoRef.current;
    if (!sourceVideo || sourceVideo.readyState < 2) {
      if (videoRef?.current && videoRef.current.readyState >= 2) {
        sourceVideo = videoRef.current;
      }
    }

    if (!sourceVideo || sourceVideo.readyState < 2) {
      if (onToast) onToast('warning', 'មិនទាន់មានវីដេអូ', 'សូមផ្ទុកវីដេអូ ឬរង់ចាំវីដេអូដំណើរការសិន');
      return;
    }

    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = sourceVideo.videoWidth || 1920;
      snapCanvas.height = sourceVideo.videoHeight || 1080;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(sourceVideo, 0, 0, snapCanvas.width, snapCanvas.height);
      const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);

      if (config.layoutMode === 'single_hero') {
        setConfig(prev => ({ ...prev, heroImage: dataUrl }));
      } else {
        setConfig(prev => {
          const splits = [...(prev.splitImages || ['', '', ''])];
          splits[activeSlotIndex] = dataUrl;
          return { ...prev, splitImages: splits, heroImage: splits[0] || dataUrl };
        });
      }

      if (onToast) onToast('success', '📸 ចាប់យករូបភាពជោគជ័យ', `បានចាប់យកប្លង់នៅវិនាទី ${videoCurrentTime.toFixed(1)}s`);
    } catch (err: any) {
      console.error('Frame capture error:', err);
      if (onToast) onToast('error', 'ការចាប់យករូបភាពបរាជ័យ', err.message);
    }
  };

  // ✨ Auto Extract 6 Best Moments Spread Across Video
  const handleExtractAutoKeyframes = async () => {
    const sourceVideo = previewVideoRef.current || videoRef?.current;
    if (!sourceVideo || !videoUrl) {
      if (onToast) onToast('warning', 'មិនមានវីដេអូ', 'សូមផ្ទុកវីដេអូជាមុនសិនដើម្បីដកស្រង់ប្លង់ស្វ័យប្រវត្តិ');
      return;
    }

    setIsExtractingKeyframes(true);
    const duration = sourceVideo.duration || 60;
    const percentages = [0.10, 0.25, 0.40, 0.60, 0.75, 0.90];
    const extracted: { time: number; dataUrl: string }[] = [];

    // Temporary hidden video for non-disruptive seeking
    const tempVid = document.createElement('video');
    tempVid.crossOrigin = 'anonymous';
    tempVid.src = videoUrl;
    tempVid.muted = true;
    tempVid.playsInline = true;

    await new Promise(r => {
      tempVid.onloadedmetadata = () => r(true);
      tempVid.onerror = () => r(false);
      setTimeout(() => r(false), 4000);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext('2d');

    for (const p of percentages) {
      const targetTime = duration * p;
      try {
        tempVid.currentTime = targetTime;
        await new Promise(res => {
          const onSeek = () => {
            tempVid.removeEventListener('seeked', onSeek);
            res(true);
          };
          tempVid.addEventListener('seeked', onSeek);
          setTimeout(res, 800);
        });
        if (ctx) {
          ctx.drawImage(tempVid, 0, 0, canvas.width, canvas.height);
          extracted.push({
            time: targetTime,
            dataUrl: canvas.toDataURL('image/jpeg', 0.8)
          });
        }
      } catch {}
    }

    setAutoKeyframes(extracted);
    setIsExtractingKeyframes(false);
    if (extracted.length > 0 && !config.heroImage) {
      setConfig(prev => ({ ...prev, heroImage: extracted[0].dataUrl }));
    }
  };

  // Upload Custom File Image
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        if (config.layoutMode === 'single_hero') {
          setConfig(prev => ({ ...prev, heroImage: dataUrl }));
        } else {
          setConfig(prev => {
            const splits = [...(prev.splitImages || ['', '', ''])];
            splits[activeSlotIndex] = dataUrl;
            return { ...prev, splitImages: splits, heroImage: splits[0] || dataUrl };
          });
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ----------------------------------------------------
  // 🎨 CANVAS RENDERING ENGINE (1080x1920 HD Studio Output)
  // ----------------------------------------------------
  const loadImage = (src: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      if (imageCache.current.has(src)) {
        return resolve(imageCache.current.get(src)!);
      }
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageCache.current.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  };

  // Reusable Studio Canvas Renderer (used for both live preview & clean exports)
  const renderCanvasScene = async (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    cfg: ReelsThumbnailConfig,
    allowSafeGuide: boolean = false
  ) => {
    // 1. Background Fill / Dark Screen
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, W, H);

    // 2. Render Layout Images (Hero vs 2-Split vs 3-Split)
    if (cfg.layoutMode === 'single_hero') {
      const heroImg = await loadImage(cfg.heroImage);
      if (heroImg) {
        drawCoverImage(ctx, heroImg, 0, 0, W, H, cfg.brightness, cfg.contrast, cfg.saturation);
      } else {
        drawFallbackGeometricBg(ctx, W, H);
      }
    } else if (cfg.layoutMode === 'split_2') {
      const hHalf = H / 2;
      const img1 = await loadImage(cfg.splitImages?.[0] || cfg.heroImage);
      const img2 = await loadImage(cfg.splitImages?.[1] || cfg.heroImage);

      if (img1) drawCoverImage(ctx, img1, 0, 0, W, hHalf - 2, cfg.brightness, cfg.contrast, cfg.saturation);
      else drawFallbackGeometricBg(ctx, W, hHalf);

      if (img2) drawCoverImage(ctx, img2, 0, hHalf + 2, W, hHalf - 2, cfg.brightness, cfg.contrast, cfg.saturation);
      else drawFallbackGeometricBg(ctx, W, hHalf);

      // Divider Line
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 10;
      ctx.fillRect(0, hHalf - 2, W, 4);
      ctx.shadowBlur = 0;
    } else if (cfg.layoutMode === 'split_3') {
      const hThird = H / 3;
      const img1 = await loadImage(cfg.splitImages?.[0] || cfg.heroImage);
      const img2 = await loadImage(cfg.splitImages?.[1] || cfg.heroImage);
      const img3 = await loadImage(cfg.splitImages?.[2] || cfg.heroImage);

      if (img1) drawCoverImage(ctx, img1, 0, 0, W, hThird - 2, cfg.brightness, cfg.contrast, cfg.saturation);
      if (img2) drawCoverImage(ctx, img2, 0, hThird + 2, W, hThird - 4, cfg.brightness, cfg.contrast, cfg.saturation);
      if (img3) drawCoverImage(ctx, img3, 0, hThird * 2 + 2, W, hThird - 2, cfg.brightness, cfg.contrast, cfg.saturation);

      ctx.fillStyle = '#ffd700';
      ctx.fillRect(0, hThird - 2, W, 4);
      ctx.fillRect(0, hThird * 2 - 2, W, 4);
    }

    // 3. Cinematic Dark Vignette & Top/Bottom Gradient Shadows
    if (cfg.showVignette) {
      const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.35);
      topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
      topGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.45)');
      topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, W, H * 0.35);

      const botGrad = ctx.createLinearGradient(0, H * 0.55, 0, H);
      botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      botGrad.addColorStop(0.4, 'rgba(0, 0, 0, 0.65)');
      botGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }

    // 4. Draw Episode Badge (Large, Punchy, High-Contrast)
    drawEpisodeBadge(ctx, W, H, cfg);

    // 5. Draw Movie Title & Taglines (Cambodian Typography)
    drawMovieTitle(ctx, W, H, cfg);

    // 6. Draw Viral Stickers (e.g. 🔥 កំពុងពេញនិយម)
    drawStickers(ctx, W, H, cfg);

    // 7. Draw Facebook Reels Safe-Zone Overlays (only if enabled & explicitly allowed for live preview)
    if (allowSafeGuide && cfg.aspectRatio === '9:16') {
      drawFacebookSafeZoneGuide(ctx, W, H);
    }
  };

  // Helper to generate clean, studio-grade PNG/JPEG without UI overlays
  const generateCleanDataUrl = async (
    targetConfig: ReelsThumbnailConfig,
    format: 'png' | 'jpeg' = 'png'
  ): Promise<string> => {
    const exportCanvas = document.createElement('canvas');
    let W = 1080;
    let H = 1920;
    if (targetConfig.aspectRatio === '16:9') {
      W = 1920;
      H = 1080;
    } else if (targetConfig.aspectRatio === '1:1') {
      W = 1080;
      H = 1080;
    }
    exportCanvas.width = W;
    exportCanvas.height = H;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return '';

    await renderCanvasScene(exportCtx, W, H, targetConfig, false);
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'png' ? 1.0 : 0.95;
    return exportCanvas.toDataURL(mime, quality);
  };

  // Live Canvas Preview Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 1080;
    let H = 1920;
    if (config.aspectRatio === '16:9') {
      W = 1920;
      H = 1080;
    } else if (config.aspectRatio === '1:1') {
      W = 1080;
      H = 1080;
    }
    canvas.width = W;
    canvas.height = H;

    renderCanvasScene(ctx, W, H, config, config.showSafeZoneGuide);
  }, [config]);

  // ----------------------------------------------------
  // DRAWING HELPER FUNCTIONS
  // ----------------------------------------------------
  const drawCoverImage = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    brightness: number,
    contrast: number,
    saturation: number
  ) => {
    ctx.save();
    ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;

    const imgAspect = img.width / img.height;
    const targetAspect = w / h;
    let renderW = w;
    let renderH = h;
    let renderX = x;
    let renderY = y;

    if (imgAspect > targetAspect) {
      renderW = h * imgAspect;
      renderX = x - (renderW - w) / 2;
    } else {
      renderH = w / imgAspect;
      renderY = y - (renderH - h) / 2;
    }

    ctx.drawImage(img, renderX, renderY, renderW, renderH);
    ctx.restore();
  };

  const drawFallbackGeometricBg = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Decorative cinematic rays
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.08)';
    ctx.lineWidth = 3;
    for (let i = 0; i < w; i += 60) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(w - i, h);
      ctx.stroke();
    }

    // Friendly reminder text in center
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = 'bold 32px "Kantumruy Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📸 ចុចប៊ូតុង [ថតប្លង់នេះ] ខាងក្រោម', w / 2, h * 0.48);
    ctx.font = '500 24px "Kantumruy Pro", sans-serif';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.75)';
    ctx.fillText('ដើម្បីចាប់យករូបភាពពីវីដេអូធ្វើជាផ្ទាំងខាងក្រោយ', w / 2, h * 0.48 + 44);
    ctx.restore();
  };

  // Draw Episode Badge (The hero element for series discovery!)
  const drawEpisodeBadge = (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    cfg: ReelsThumbnailConfig
  ) => {
    if (!cfg.episodeText.trim()) return;

    ctx.save();
    const epText = cfg.episodeText.trim().toUpperCase();
    const scale = cfg.badgeScale || 1.1;

    // Calculate Position
    let centerX = W / 2;
    let centerY = H * 0.16; // default top center

    if (cfg.badgePosition === 'safe_center') {
      // Exactly at the upper third of the 1:1 safe crop box!
      centerY = (H / 2) - (W * 0.28);
    } else if (cfg.badgePosition === 'top_left') {
      centerX = W * 0.26;
      centerY = H * 0.12;
    } else if (cfg.badgePosition === 'top_right') {
      centerX = W * 0.74;
      centerY = H * 0.12;
    }

    const fontSize = Math.round(52 * scale);
    ctx.font = `900 ${fontSize}px "Moul", "Kantumruy Pro", sans-serif`;
    const textMetrics = ctx.measureText(epText);
    const badgeW = Math.max(textMetrics.width + (64 * scale), 260 * scale);
    const badgeH = 88 * scale;
    const badgeX = centerX - (badgeW / 2);
    const badgeY = centerY - (badgeH / 2);
    const radius = 24 * scale;

    // Badge Styles
    if (cfg.badgeStyle === 'golden_vip') {
      // 👑 Golden Royal VIP 3D
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;

      const goldGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
      goldGrad.addColorStop(0, '#fef08a');
      goldGrad.addColorStop(0.3, '#facc15');
      goldGrad.addColorStop(0.7, '#eab308');
      goldGrad.addColorStop(1, '#ca8a04');

      ctx.fillStyle = goldGrad;
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, radius);
      ctx.fill();

      // Golden 3D border
      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Text
      ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(epText, centerX, centerY + (4 * scale));

    } else if (cfg.badgeStyle === 'neon_red') {
      // 🔥 Fiery Neon Red
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 32 * scale;
      ctx.shadowOffsetY = 0;

      const redGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
      redGrad.addColorStop(0, '#ef4444');
      redGrad.addColorStop(1, '#991b1b');
      ctx.fillStyle = redGrad;
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, radius);
      ctx.fill();

      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = '#fecaca';
      ctx.stroke();

      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(epText, centerX, centerY + (4 * scale));

    } else if (cfg.badgeStyle === 'cyber_cyan') {
      // ⚡ Cyberpunk Cyan
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 30 * scale;

      const cyanGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
      cyanGrad.addColorStop(0, '#06b6d4');
      cyanGrad.addColorStop(1, '#3b82f6');
      ctx.fillStyle = cyanGrad;
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, radius);
      ctx.fill();

      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = '#cffafe';
      ctx.stroke();

      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(epText, centerX, centerY + (4 * scale));

    } else if (cfg.badgeStyle === 'cinematic_pill') {
      // 🖤 Dark Glass Pill
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 20;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, radius * 1.5);
      ctx.fill();

      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = '#facc15';
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(epText, centerX, centerY + (4 * scale));

    } else if (cfg.badgeStyle === 'solid_box') {
      // 🟡 Solid Warning Yellow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#facc15';
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12 * scale);
      ctx.fill();

      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(epText, centerX, centerY + (4 * scale));
    }

    ctx.restore();
  };

  // Draw Movie Title & Tagline with Thick Outlines & Shadow
  const drawMovieTitle = (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    cfg: ReelsThumbnailConfig
  ) => {
    ctx.save();
    const title = (cfg.movieTitle || 'សម្រាយសាច់រឿង').trim();
    const tagline = (cfg.taglineText || '').trim();

    // In 9:16 Reels mode, place title in lower-middle safe region
    let titleY = H * 0.72;
    if (cfg.aspectRatio === '16:9') {
      titleY = H * 0.76;
    } else if (cfg.aspectRatio === '1:1') {
      titleY = H * 0.75;
    }

    const fontSize = cfg.titleFontSize || 72;
    ctx.font = `bold ${fontSize}px "${cfg.fontFamily}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Wrap title if too long
    const maxTextWidth = W * 0.88;
    const words = title.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const w of words) {
      const test = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(test).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Limit to 2 lines for punchiness
    const renderLines = lines.slice(0, 2);
    const lineHeight = fontSize * 1.35;
    const startY = titleY - ((renderLines.length - 1) * lineHeight) / 2;

    renderLines.forEach((line, idx) => {
      const y = startY + (idx * lineHeight);

      // 1. Extreme 3D Drop Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;

      // 2. Thick Black Outline (Stroke) so text never blends into background
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, W / 2, y);

      // 3. Inner Fill
      if (cfg.textStyle === 'gold_gradient') {
        const gold = ctx.createLinearGradient(0, y - fontSize / 2, 0, y + fontSize / 2);
        gold.addColorStop(0, '#fffbeb');
        gold.addColorStop(0.3, '#fde047');
        gold.addColorStop(0.8, '#eab308');
        gold.addColorStop(1, '#ca8a04');
        ctx.fillStyle = gold;
      } else if (cfg.textStyle === 'fiery_red') {
        const red = ctx.createLinearGradient(0, y - fontSize / 2, 0, y + fontSize / 2);
        red.addColorStop(0, '#fef2f2');
        red.addColorStop(0.4, '#ef4444');
        red.addColorStop(1, '#991b1b');
        ctx.fillStyle = red;
      } else if (cfg.textStyle === 'cyber_yellow') {
        ctx.fillStyle = '#fef08a';
      } else if (cfg.textStyle === 'royal_purple') {
        ctx.fillStyle = '#e9d5ff';
      } else {
        // Pure White Contrast (#1 style)
        ctx.fillStyle = '#ffffff';
      }

      ctx.fillText(line, W / 2, y);
    });

    // Tagline / Subtitle below title
    if (tagline) {
      const tagY = startY + (renderLines.length * lineHeight) + 20;
      const tagFontSize = Math.round(fontSize * 0.44);
      ctx.font = `600 ${tagFontSize}px "Kantumruy Pro", sans-serif`;

      // Background banner behind tagline for guaranteed readability
      const tagWidth = ctx.measureText(tagline).width;
      const bannerW = tagWidth + 48;
      const bannerH = tagFontSize * 2;
      const bannerX = (W / 2) - (bannerW / 2);
      const bannerY = tagY - (bannerH / 2);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10;
      roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 14);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.shadowBlur = 0;
      ctx.fillText(tagline, W / 2, tagY + 2);
    }

    ctx.restore();
  };

  // Draw Viral Stickers
  const drawStickers = (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    cfg: ReelsThumbnailConfig
  ) => {
    if (!cfg.tagStickers || cfg.tagStickers.length === 0) return;

    ctx.save();
    let currentX = 50;
    const stickerY = H * 0.055;

    cfg.tagStickers.forEach((stk) => {
      ctx.font = 'bold 28px "Kantumruy Pro", sans-serif';
      const tw = ctx.measureText(stk).width;
      const sw = tw + 36;
      const sh = 52;

      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 10;
      roundRect(ctx, currentX, stickerY, sw, sh, 14);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stk, currentX + (sw / 2), stickerY + (sh / 2) + 2);

      currentX += sw + 16;
    });

    ctx.restore();
  };

  // 📐 Facebook Reels Safe-Zone Overlay
  const drawFacebookSafeZoneGuide = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.save();

    // 1. Center 1:1 Square Crop (Facebook Profile Grid View)
    // In Facebook Page Profile Reels tab, Facebook crops 9:16 to a 1:1 square centered!
    const cropSize = W;
    const cropY = (H - cropSize) / 2;

    // Darken areas outside 1:1 safe zone
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, cropY); // Top outside zone
    ctx.fillRect(0, cropY + cropSize, W, H - (cropY + cropSize)); // Bottom outside zone

    // 1:1 Square Dashed Border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(4, cropY, W - 8, cropSize);

    // Label on Safe Area
    ctx.setLineDash([]);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 24px "Kantumruy Pro", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📐 Facebook Profile Grid Safe Zone (1:1 Square)', 24, cropY + 36);

    // 2. Reels UI Margin (Bottom ~300px for captions/audio, Right 160px for Like/Comment/Share)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(0, H - 280, W, 280); // Bottom UI area
    ctx.fillRect(W - 160, H * 0.45, 160, H * 0.45); // Right actions area

    ctx.fillStyle = '#f87171';
    ctx.font = '600 20px "Kantumruy Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ តំបន់បាំងដោយ Facebook UI (Like, Comment, Captions)', W / 2, H - 40);

    ctx.restore();
  };

  // Canvas helper for rounded rectangles
  const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Helper to convert Blob to Base64 Data URL
  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ----------------------------------------------------
  // 🪄 AI MASTER SERIES COVER GENERATOR
  // ----------------------------------------------------
  const handleGenerateAiMasterCover = async () => {
    setIsGeneratingAiCover(true);
    try {
      const apiKey = localStorage.getItem('khmer_dubber_custom_api_key') || localStorage.getItem('gemini_api_key') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-gemini-api-key'] = apiKey;

      let coverDataUrl = '';
      let analyzedChars: string[] = detectedCharacters;
      let finalPrompt = '';
      let succeeded = false;

      // 1. Try Backend Endpoint First
      try {
        const res = await fetch('/api/thumbnail/generate-series-cover', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            movieTitle: config.movieTitle || movieTitle,
            seriesTitle: seriesTitle || movieTitle,
            segments,
            customPrompt: customAiVision || undefined,
            customApiKey: apiKey
          })
        });

        if (res.ok) {
          const text = await res.text();
          if (text) {
            const data = JSON.parse(text);
            if (data && data.success && data.coverImageBase64) {
              coverDataUrl = data.coverImageBase64;
              analyzedChars = data.analyzedCharacters || detectedCharacters;
              finalPrompt = data.imagePrompt || '';
              succeeded = true;
            }
          }
        } else {
          console.warn(`Backend cover endpoint returned status ${res.status}. Falling back to direct client AI generation.`);
        }
      } catch (backendFetchErr) {
        console.warn('Backend fetch notice, switching to direct client generation:', backendFetchErr);
      }

      // 2. Direct In-Browser AI Generation Fallback (Works 100% even if backend server wasn't restarted)
      if (!succeeded) {
        const titleForPrompt = config.movieTitle || seriesTitle || movieTitle || 'Epic Khmer Movie';
        const charactersText = analyzedChars.length > 0 
          ? analyzedChars.slice(0, 4).join(', ') 
          : 'lead heroic protagonist and characters';

        // Construct high-impact cinematic 9:16 prompt
        finalPrompt = `Cinematic 9:16 vertical movie poster for "${titleForPrompt}", featuring characters (${charactersText}), dramatic hero pose, atmospheric volumetric lighting, photorealistic 8k, masterpiece, cinematic color grading, no text, no watermark${customAiVision ? `, ${customAiVision}` : ''}`;

        // Attempt A: Try Google Gemini Image Generation if API key is provided
        if (apiKey) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
            const gemRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `Generate a cinematic 9:16 vertical movie poster for ${titleForPrompt}: ${finalPrompt}` }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
              })
            });
            if (gemRes.ok) {
              const gemData = await gemRes.json();
              const part = gemData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
              if (part && part.inlineData?.data) {
                coverDataUrl = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
                succeeded = true;
              }
            } else {
              console.log('Gemini Image API Notice: Free tier has limit: 0 for image generation. Using fast AI model...');
            }
          } catch (gemErr) {
            console.warn('Gemini direct image attempt notice:', gemErr);
          }
        }

        // Attempt B: Fast Turbo AI Poster Generation (5-8 seconds, 720x1280 vertical HD)
        if (!succeeded) {
          const seed = Math.floor(Math.random() * 999999);
          // Use model=turbo for ultra-fast generation and highest reliability
          const turboUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=720&height=1280&model=turbo&nologo=true&seed=${seed}`;
          const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=720&height=1280&model=flux&nologo=true&seed=${seed}`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);

          let imgRes = await fetch(turboUrl, { signal: controller.signal }).catch(() => null);
          if (!imgRes || !imgRes.ok) {
            imgRes = await fetch(fluxUrl, { signal: controller.signal }).catch(() => null);
          }
          clearTimeout(timeout);

          if (imgRes && imgRes.ok) {
            const blob = await imgRes.blob();
            if (blob.size > 1000) {
              coverDataUrl = await blobToDataUrl(blob);
              succeeded = true;
            }
          }
        }

        if (!succeeded || !coverDataUrl) {
          throw new Error('មិនអាចទាញយករូបភាពពី AI សេវាកម្មបានទេ។ សូមសាកល្បងចុចបង្កើតម្តងទៀត!');
        }
      }

      // Apply to canvas config as single hero
      setConfig(prev => ({
        ...prev,
        heroImage: coverDataUrl,
        layoutMode: 'single_hero'
      }));

      // Automatically remember as Master Series Cover in localStorage
      try {
        localStorage.setItem(seriesStorageKey, coverDataUrl);
        setIsMasterCoverSaved(true);
      } catch (storageErr) {
        console.warn('Storage quota notice:', storageErr);
      }

      if (analyzedChars && analyzedChars.length > 0) {
        setAiCharactersList(analyzedChars);
      }
      if (finalPrompt) {
        setAiGeneratedPrompt(finalPrompt);
      }

      if (onToast) {
        onToast('success', '🎨 បង្កើត Master Cover ជោគជ័យ!', 'រូបភាពត្រូវបានកំណត់ជា Default សម្រាប់គ្រប់ភាគនៃរឿងនេះ។');
      }
    } catch (err: any) {
      console.error('AI Cover error:', err);
      if (onToast) {
        onToast('error', 'ការបង្កើត Master Cover បរាជ័យ', err.message || 'សូមពិនិត្យមើល API Key ឬភ្ជាប់អ៊ីនធឺណិត');
      }
    } finally {
      setIsGeneratingAiCover(false);
    }
  };

  const handleSaveAsMasterCover = () => {
    if (!config.heroImage) {
      if (onToast) onToast('warning', 'មិនទាន់មានរូបភាព', 'សូមជ្រើសរើស ឬបង្កើតរូបភាពជាមុនសិន');
      return;
    }
    try {
      localStorage.setItem(seriesStorageKey, config.heroImage);
      setIsMasterCoverSaved(true);
      if (onToast) {
        onToast('success', '📌 បានចងចាំជា Master Cover!', `រូបភាពនេះនឹងត្រូវប្រើស្វ័យប្រវត្តិក្នងរឿង "${cleanSeriesName}" សម្រាប់គ្រប់ភាគ។`);
      }
    } catch (e: any) {
      console.warn('LocalStorage save failed:', e);
      if (onToast) onToast('warning', 'ទំហំផ្ទុកពេញ', 'មិនអាចចងចាំក្នុង Browser Cache បានទេ ប៉ុន្តែអ្នកអាចចុច "កំណត់ជាគម្របវីដេអូ" បាន។');
    }
  };

  const handleLoadMasterCover = () => {
    const saved = localStorage.getItem(seriesStorageKey);
    if (saved) {
      setConfig(prev => ({ ...prev, heroImage: saved, layoutMode: 'single_hero' }));
      setIsMasterCoverSaved(true);
      if (onToast) onToast('info', 'បានផ្ទុក Master Cover', 'បានផ្ទុករូបភាពមេសម្រាប់រឿងនេះរួចរាល់។');
    } else {
      if (onToast) onToast('warning', 'មិនទាន់មាន Master Cover', 'មិនទាន់មានរូបភាពមេត្រូវបានរក្សាទុកសម្រាប់រឿងនេះនៅឡើយទេ។');
    }
  };

  // ----------------------------------------------------
  // ⚡ BATCH EPISODE EXPORT (ទាញយក Thumbnail គ្រប់ភាគក្នុងពេលតែមួយ)
  // ----------------------------------------------------
  const handleBatchExport = async () => {
    if (isBatchExporting) return;
    const startEp = Math.min(batchRange.start, batchRange.end);
    const endEp = Math.max(batchRange.start, batchRange.end);
    const totalEps = endEp - startEp + 1;

    if (totalEps <= 0) {
      if (onToast) onToast('warning', 'ចំនួនភាគមិនត្រឹមត្រូវ', 'សូមជ្រើសរើសចន្លោះភាគឱ្យបានត្រឹមត្រូវ');
      return;
    }

    if (totalEps > 50) {
      if (onToast) onToast('warning', 'កំណត់ត្រឹម 50 ភាគ', 'សូមទាញយកម្តងអតិបរមា 50 ភាគ');
      return;
    }

    setIsBatchExporting(true);
    setBatchProgress({ current: 0, total: totalEps });

    const cleanTitle = (config.movieTitle || 'reels_thumbnail').replace(/[^a-zA-Z0-9\u1780-\u17FF_-]/g, '_');

    try {
      for (let i = 0; i < totalEps; i++) {
        const currentEp = startEp + i;
        const paddedEp = String(currentEp).padStart(2, '0');
        const epText = `ភាគ ${paddedEp}`;

        setBatchProgress({ current: i + 1, total: totalEps });

        // Generate clean data URL for this episode with identical master background!
        const epConfig = { ...config, episodeText: epText };
        const dataUrl = await generateCleanDataUrl(epConfig, 'png');

        const link = document.createElement('a');
        link.download = `${cleanTitle}_Part_${paddedEp}_Reels.png`;
        link.href = dataUrl;
        link.click();

        // Brief delay between downloads so browser doesn't block sequential popup downloads
        await new Promise(r => setTimeout(r, 650));
      }

      if (onToast) {
        onToast('success', '🎉 ទាញយកគ្រប់ភាគជោគជ័យ!', `បានទាញយក Thumbnail ភាគ ${startEp} ដល់ ${endEp} (សរុប ${totalEps} ភាគ) ដោយរក្សារូបភាពមេដដែល!`);
      }
    } catch (err: any) {
      console.error('Batch export error:', err);
      if (onToast) onToast('error', 'ការទាញយកមានបញ្ហា', err.message);
    } finally {
      setIsBatchExporting(false);
      setBatchProgress(null);
    }
  };

  // ----------------------------------------------------
  // EXPORT & SAVE HANDLERS
  // ----------------------------------------------------
  const handleDownload = async (format: 'png' | 'jpeg') => {
    try {
      const dataUrl = await generateCleanDataUrl(config, format);
      if (!dataUrl) return;

      const link = document.createElement('a');
      const cleanTitle = (config.movieTitle || 'reels_thumbnail').replace(/[^a-zA-Z0-9\u1780-\u17FF_-]/g, '_');
      const cleanEp = config.episodeText.replace(/\s+/g, '_');
      link.download = `${cleanTitle}_${cleanEp}_reels_cover.${format}`;
      link.href = dataUrl;
      link.click();

      if (onToast) onToast('success', 'ទាញយករូបភាពជោគជ័យ', `បានរក្សាទុក ${link.download}`);
    } catch (e: any) {
      if (onToast) onToast('error', 'ទាញយកបរាជ័យ', e.message);
    }
  };

  const handleCopyClipboard = async () => {
    try {
      const dataUrl = await generateCleanDataUrl(config, 'png');
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
      if (onToast) onToast('success', 'បានចម្លងជោគជ័យ!', 'រូបភាព Thumbnail ត្រូវបានចម្លងទៅ Clipboard រួចរាល់។');
    } catch (e: any) {
      console.warn('Clipboard write failed:', e);
      if (onToast) onToast('error', 'មិនអាច Copy បាន', 'សូមប្រើប៊ូតុង "ទាញយក PNG" ជំនួសវិញ');
    }
  };

  const handleApplyAsCover = async () => {
    try {
      const dataUrl = await generateCleanDataUrl(config, 'jpeg');
      onSaveThumbnail(dataUrl, config);
      // Also remember as master cover for this series
      try {
        localStorage.setItem(seriesStorageKey, config.heroImage);
        setIsMasterCoverSaved(true);
      } catch {}
      if (onToast) onToast('success', '🎉 កំណត់ជាគម្របរួចរាល់!', 'Thumbnail នេះត្រូវបានរក្សាទុកជាគម្របវីដេអូសម្រាប់គម្រោង។');
      onClose();
    } catch (e: any) {
      if (onToast) onToast('error', 'កំណត់គម្របបរាជ័យ', e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-y-auto animate-fadeIn font-khmer">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        
        {/* 1. Modal Top Bar */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-600 via-rose-500 to-amber-400 flex items-center justify-center shadow-lg shadow-pink-500/20 shrink-0">
              <Image className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                <span>បង្កើត Cover & Thumbnail សម្រាប់ Facebook Reels</span>
                <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/40 px-2 py-0.5 rounded-full font-sans font-semibold">
                  HD 1080p
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-sans truncate">
                ដាក់លេខភាគធំៗច្បាស់ៗ • ពិនិត្យ Safe-Zone 1:1 • ងាយស្រួលទស្សនិកជនមើលរកភាគលើ Facebook
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Aspect Ratio Switch */}
            <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs font-sans">
              <button
                onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '9:16' }))}
                className={`px-2.5 py-1 rounded-md transition font-medium ${config.aspectRatio === '9:16' ? 'bg-pink-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
              >
                9:16 Reels
              </button>
              <button
                onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '1:1' }))}
                className={`px-2.5 py-1 rounded-md transition font-medium ${config.aspectRatio === '1:1' ? 'bg-pink-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
              >
                1:1 Post
              </button>
              <button
                onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '16:9' }))}
                className={`px-2.5 py-1 rounded-md transition font-medium ${config.aspectRatio === '16:9' ? 'bg-pink-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
              >
                16:9 Video
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. Main Studio Body (Split: Preview Canvas on Left, Controls on Right) */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          
          {/* LEFT: Live WYSIWYG Canvas Preview & Video Scrubbing */}
          <div className="w-full lg:w-[46%] bg-slate-950 p-3 sm:p-4 flex flex-col items-center justify-between border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto">
            
            {/* Safe-Zone Toggle & Hint Bar */}
            <div className="w-full flex items-center justify-between gap-2 mb-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={config.showSafeZoneGuide}
                  onChange={(e) => setConfig(prev => ({ ...prev, showSafeZoneGuide: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-pink-600 focus:ring-0 cursor-pointer"
                />
                <span className="font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>បន្ទាត់សុវត្ថិភាព Safe-Zone 1:1</span>
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={config.showVignette}
                  onChange={(e) => setConfig(prev => ({ ...prev, showVignette: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-pink-600 focus:ring-0 cursor-pointer"
                />
                <span className="font-medium">ស្រមោលអក្សរ (Shadow)</span>
              </label>
            </div>

            {/* Canvas Container */}
            <div className="relative flex items-center justify-center w-full my-auto py-1">
              <div 
                className={`relative rounded-xl overflow-hidden shadow-2xl border-2 border-slate-700/80 bg-black flex items-center justify-center transition-all ${
                  config.aspectRatio === '9:16' ? 'aspect-[9/16] max-h-[52vh] sm:max-h-[56vh]' : 
                  config.aspectRatio === '1:1' ? 'aspect-square max-h-[50vh]' : 'aspect-video max-h-[46vh]'
                }`}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain"
                />

                {/* Animated AI Generating Overlay */}
                {isGeneratingAiCover && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20 animate-fadeIn">
                    <div className="relative mb-3">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-purple-500/40 animate-pulse">
                        <Sparkles className="w-7 h-7 text-amber-300 animate-spin" />
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-white mb-1">
                      AI កំពុងវិភាគតួអង្គ & គូរ Master Cover...
                    </span>
                    <span className="text-[11px] text-indigo-300 font-sans">
                      កំពុងបង្កើតរូបភាពបញ្ឈរ 9:16 HD ដោយឥតគិតថ្លៃ
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Video Frame Scrubber & Keyframe Toolbar */}
            {videoUrl && (
              <div className="w-full mt-2 pt-2 border-t border-slate-800/80 space-y-2">
                
                {/* Scrubbing Bar & Time */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {Math.floor(videoCurrentTime / 60)}:{(Math.floor(videoCurrentTime % 60)).toString().padStart(2, '0')}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 60}
                    step={0.1}
                    value={videoCurrentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      setVideoCurrentTime(t);
                      if (previewVideoRef.current) previewVideoRef.current.currentTime = t;
                    }}
                    className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {Math.floor(videoDuration / 60)}:{(Math.floor(videoDuration % 60)).toString().padStart(2, '0')}
                  </span>

                  <button
                    onClick={handleCaptureVideoFrame}
                    className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                    title="ចាប់យកប្លង់រូបភាពនៅវិនាទីនេះ (Capture Current Video Frame)"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>ថតប្លង់នេះ</span>
                  </button>
                </div>

                {/* Hidden preview video for seek grabbing */}
                <video
                  ref={previewVideoRef}
                  src={videoUrl}
                  crossOrigin="anonymous"
                  className="hidden"
                  muted
                  playsInline
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                />

                {/* 6 Keyframe Moments Carousel */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  <button
                    onClick={handleExtractAutoKeyframes}
                    disabled={isExtractingKeyframes}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10.5px] font-medium flex items-center gap-1 shrink-0 transition border border-slate-700"
                  >
                    <Sparkles className={`w-3 h-3 text-amber-400 ${isExtractingKeyframes ? 'animate-spin' : ''}`} />
                    <span>{isExtractingKeyframes ? 'កំពុងស្វែងរក...' : '✨ ទាញ 6 ប្លង់ស្អាតៗ'}</span>
                  </button>

                  {autoKeyframes.map((kf, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (config.layoutMode === 'single_hero') {
                          setConfig(prev => ({ ...prev, heroImage: kf.dataUrl }));
                        } else {
                          setConfig(prev => {
                            const splits = [...(prev.splitImages || ['', '', ''])];
                            splits[activeSlotIndex] = kf.dataUrl;
                            return { ...prev, splitImages: splits, heroImage: splits[0] || kf.dataUrl };
                          });
                        }
                      }}
                      className="relative rounded-lg overflow-hidden border border-slate-700 hover:border-pink-500 transition shrink-0 group aspect-video h-9"
                    >
                      <img src={kf.dataUrl} alt={`Keyframe ${i}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center font-mono text-slate-300">
                        {Math.floor(kf.time)}s
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Customization Studio Controls */}
          <div className="flex-1 p-3 sm:p-5 overflow-y-auto space-y-4 bg-slate-900 scrollbar-thin">
            
            {/* PANEL 0: 🪄 AI MASTER SERIES COVER (វិភាគតួអង្គ & បង្កើត Master Cover 9:16) */}
            <div className="bg-gradient-to-br from-indigo-950/80 via-slate-950 to-purple-950/60 border border-indigo-500/40 rounded-xl p-3 sm:p-4 space-y-3 shadow-lg relative overflow-hidden">
              
              {/* Header with Title & Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <span>AI វិភាគតួអង្គ & បង្កើត Master Cover</span>
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 px-2 py-0.5 rounded-full font-mono font-semibold">
                        FLUX 9:16
                      </span>
                    </h3>
                    <p className="text-[11px] text-indigo-200/80">
                      បង្កើតរូបភាពមេម្តង ទុកប្រើរួមគ្រប់ Facebook Page និងគ្រប់ភាគទាំងអស់ (ដូរតែលេខភាគ)
                    </p>
                  </div>
                </div>

                {isMasterCoverSaved && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10.5px] font-bold shrink-0 shadow-xs">
                    <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Master Cover រួចរាល់</span>
                  </span>
                )}
              </div>

              {/* Detected Characters Tag Display */}
              {detectedCharacters.length > 0 && (
                <div className="bg-slate-900/90 border border-indigo-900/50 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-indigo-300 font-semibold">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>តួអង្គដែលបានរកឃើញក្នុងរឿង៖</span>
                    </span>
                    <span className="text-[10.5px] font-mono text-slate-400">{detectedCharacters.length} តួអង្គ</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto scrollbar-thin">
                    {detectedCharacters.map((charName, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-indigo-950 text-indigo-200 border border-indigo-700/60 rounded-md text-[10.5px] font-medium"
                      >
                        🎭 {charName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Prompt & Style Customization Toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShowAiPromptEditor(!showAiPromptEditor)}
                    className="text-indigo-300 hover:text-indigo-200 flex items-center gap-1 font-medium transition cursor-pointer"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>{showAiPromptEditor ? 'លាក់ជម្រើសកំណត់ Prompt' : '⚙️ បន្ថែមការពិពណ៌នាប្លង់/ស្ទីលផ្ទាល់ខ្លួន (ស្រេចចិត្ត)'}</span>
                  </button>

                  {aiGeneratedPrompt && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      ✓ AI Prompt ភ្ជាប់ជោគជ័យ
                    </span>
                  )}
                </div>

                {showAiPromptEditor && (
                  <div className="space-y-2 pt-1 animate-fadeIn">
                    <input
                      type="text"
                      value={customAiVision}
                      onChange={(e) => setCustomAiVision(e.target.value)}
                      placeholder="ឧទាហរណ៍៖ រចនាបថចិនបុរាណ ដាវពន្លឺព្រះចន្ទ លើភ្នំព្រិល មានអ័ព្ទត្រជាក់..."
                      className="w-full bg-slate-900/90 border border-indigo-700/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                    />
                    {aiGeneratedPrompt && (
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-400 font-mono max-h-20 overflow-y-auto">
                        <span className="text-amber-400 block font-bold mb-0.5">Prompt ចុងក្រោយ៖</span>
                        {aiGeneratedPrompt}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Main Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleGenerateAiMasterCover}
                  disabled={isGeneratingAiCover}
                  className={`flex-1 min-w-[210px] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer ${
                    isGeneratingAiCover
                      ? 'bg-indigo-900 text-indigo-300 cursor-wait'
                      : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white shadow-indigo-600/30'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 text-amber-300 ${isGeneratingAiCover ? 'animate-spin' : ''}`} />
                  <span>
                    {isGeneratingAiCover 
                      ? 'កំពុងវិភាគតួអង្គ & បង្កើត Master Cover HD...' 
                      : '✨ AI វិភាគតួអង្គ & បង្កើត Master Cover (FLUX 9:16)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAsMasterCover}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
                  title="ចងចាំរូបភាពនេះជា Master Cover សម្រាប់គ្រប់ភាគទាំងអស់"
                >
                  <BookmarkCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>ចងចាំជា Master Cover</span>
                </button>

                {localStorage.getItem(seriesStorageKey) && (
                  <button
                    type="button"
                    onClick={handleLoadMasterCover}
                    className="px-2.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-indigo-300 rounded-xl text-xs font-medium flex items-center gap-1 transition border border-indigo-900/60 cursor-pointer"
                    title="ផ្ទុករូបភាព Master Cover របស់រឿងនេះមកប្រើវិញ"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>ផ្ទុក Master Cover</span>
                  </button>
                )}
              </div>

              {/* Informative Workflow Tip */}
              <div className="text-[10.5px] text-slate-400 bg-black/30 rounded-lg p-2 flex items-start gap-1.5">
                <span className="text-amber-400 shrink-0">💡</span>
                <span>
                  <strong className="text-indigo-300 font-semibold">របៀបប្រើ៖</strong> បង្កើត Master Cover តែម្តងសម្រាប់រឿងនេះ រួចរក្សាទុក។ សម្រាប់គ្រប់ភាគ (ភាគ ០១, ភាគ ០២...) រូបភាពនឹងនៅដដែល គឺគ្រាន់តែចុចដូរលេខភាគ ឬចុច <span className="text-amber-300 font-bold">"Batch Export"</span> ទាញយក Thumbnail គ្រប់ភាគក្នុងពេលតែមួយ!
                </span>
              </div>
            </div>

            {/* PANEL 1: 🔢 EPISODE BADGE & FINDER (ងាយស្រួលមើលរកភាគ) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span>🔢</span>
                  <span>លេខភាគ (Episode Badge - ងាយស្រួលរកភាគ)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-sans">
                  ទស្សនិកជនមើលឃើញភាគច្បាស់ ១០០%
                </span>
              </div>

              {/* Episode Text Input with Stepper */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleIncrementEpisode(-1)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-base transition border border-slate-700 shrink-0 cursor-pointer"
                  title="ថយក្រោយ ១ ភាគ"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={config.episodeText}
                  onChange={(e) => setConfig(prev => ({ ...prev, episodeText: e.target.value }))}
                  placeholder="ភាគ ០១"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold text-yellow-300 text-center focus:border-pink-500 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => handleIncrementEpisode(1)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-base transition border border-slate-700 shrink-0 cursor-pointer"
                  title="ឡើង ១ ភាគ"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Episode Selection Buttons (1-20 + Specials) */}
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-thin">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(n => {
                  const isCurrent = config.episodeText === `ភាគ ${String(n).padStart(2, '0')}`;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleSetEpisodeNumber(n)}
                      className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition border cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-400 text-black border-amber-300 shadow-sm'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
                      }`}
                    >
                      ភាគ {String(n).padStart(2, '0')}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, episodeText: 'ភាគបញ្ចប់' }))}
                  className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-bold transition border border-rose-800/60 cursor-pointer"
                >
                  ភាគបញ្ចប់
                </button>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, episodeText: 'វគ្គពិសេស' }))}
                  className="px-2 py-1 bg-purple-950/60 hover:bg-purple-900 text-purple-300 rounded-lg text-xs font-bold transition border border-purple-800/60 cursor-pointer"
                >
                  វគ្គពិសេស
                </button>
              </div>

              {/* Badge Visual Presets */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-medium text-slate-400">ជ្រើសរើសស្ទីល Badge ភាគ៖</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BADGE_PRESETS.map((bp) => (
                    <button
                      key={bp.id}
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, badgeStyle: bp.id }))}
                      className={`px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between border transition cursor-pointer ${
                        config.badgeStyle === bp.id
                          ? 'border-pink-500 bg-pink-500/10 text-white ring-1 ring-pink-500'
                          : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span>{bp.name}</span>
                      <span className={`w-3 h-3 rounded-full bg-gradient-to-r ${bp.previewClass}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Badge Position & Scale */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">ទីតាំង Badge ភាគ៖</label>
                  <select
                    value={config.badgePosition}
                    onChange={(e) => setConfig(prev => ({ ...prev, badgePosition: e.target.value as any }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="safe_center">🎯 កណ្តាល Safe-Zone (ល្អបំផុតលើ Reels)</option>
                    <option value="top_center">⬆️ ផ្នែកខាងលើកណ្តាល</option>
                    <option value="top_left">↖️ ផ្នែកខាងលើឆ្វេង</option>
                    <option value="top_right">↗️ ផ្នែកខាងលើស្តាំ</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>ទំហំ Badge៖</span>
                    <span>{(config.badgeScale * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.5}
                    step={0.05}
                    value={config.badgeScale}
                    onChange={(e) => setConfig(prev => ({ ...prev, badgeScale: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500 mt-2"
                  />
                </div>
              </div>

              {/* ⚡ BATCH EPISODE EXPORT SECTION (ទាញយក Thumbnail គ្រប់ភាគក្នុងពេលតែមួយ) */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>ទាញយក Thumbnail គ្រប់ភាគក្នុងពេលតែមួយ (Batch Export)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    រក្សារូបមេដដែល ប្តូរតែលេខភាគ
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span>ពីភាគ៖</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={batchRange.start}
                      onChange={(e) => setBatchRange(prev => ({ ...prev, start: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center font-bold text-amber-300 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span>ដល់ភាគ៖</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={batchRange.end}
                      onChange={(e) => setBatchRange(prev => ({ ...prev, end: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center font-bold text-amber-300 text-xs focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleBatchExport}
                    disabled={isBatchExporting}
                    className={`flex-1 min-w-[180px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer ${
                      isBatchExporting
                        ? 'bg-amber-900 text-amber-200 cursor-wait'
                        : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-extrabold shadow-amber-500/20'
                    }`}
                  >
                    <FolderDown className={`w-3.5 h-3.5 ${isBatchExporting ? 'animate-bounce' : ''}`} />
                    <span>
                      {isBatchExporting 
                        ? `កំពុងទាញយក (${batchProgress?.current || 0}/${batchProgress?.total || 0})...` 
                        : `ទាញយកភាគ ${batchRange.start} ដល់ ${batchRange.end} ទាំងអស់ (PNG)`}
                    </span>
                  </button>
                </div>

                {isBatchExporting && batchProgress && (
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-1">
                    <div 
                      className="bg-gradient-to-r from-amber-400 to-rose-500 h-2 transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>

            </div>

            {/* PANEL 2: ✍️ MOVIE TITLE & TYPOGRAPHY (ត្រូវនឹងរឿង) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3 shadow-xs">
              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" />
                <span>ចំណងជើងរឿង & ពាក្យទាក់ទាញ (Title & Tagline)</span>
              </span>

              {/* Main Title Input */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">ឈ្មោះរឿងជាភាសាខ្មែរ៖</label>
                <input
                  type="text"
                  value={config.movieTitle}
                  onChange={(e) => setConfig(prev => ({ ...prev, movieTitle: e.target.value }))}
                  placeholder="បញ្ចូលឈ្មោះរឿង..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold text-white focus:border-pink-500 focus:outline-none"
                />
              </div>

              {/* Tagline / Subtitle */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">ពាក្យទាក់ទាញ (Tagline)៖</label>
                <input
                  type="text"
                  value={config.taglineText}
                  onChange={(e) => setConfig(prev => ({ ...prev, taglineText: e.target.value }))}
                  placeholder="សម្រាយសាច់រឿងលម្អិត • ចប់ក្នុងភាគនេះ"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-yellow-300 focus:border-pink-500 focus:outline-none"
                />
              </div>

              {/* Font Family & Text Style */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">ពុម្ពអក្សរខ្មែរ (Font)៖</label>
                  <select
                    value={config.fontFamily}
                    onChange={(e) => setConfig(prev => ({ ...prev, fontFamily: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {KHMER_FONTS.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">ស្ទីលពណ៌អក្សរ៖</label>
                  <select
                    value={config.textStyle}
                    onChange={(e) => setConfig(prev => ({ ...prev, textStyle: e.target.value as any }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {TEXT_STYLES.map(ts => (
                      <option key={ts.id} value={ts.id}>{ts.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title Font Size Slider */}
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>ទំហំអក្សរចំណងជើង៖</span>
                  <span>{config.titleFontSize}px</span>
                </div>
                <input
                  type="range"
                  min={48}
                  max={110}
                  step={2}
                  value={config.titleFontSize}
                  onChange={(e) => setConfig(prev => ({ ...prev, titleFontSize: parseInt(e.target.value, 10) }))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>
            </div>

            {/* PANEL 3: 🖼️ LAYOUT & BACKGROUND SCENE (ប្លង់រូបភាព) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  <span>ប្លង់រូបភាព (Layout Mode)</span>
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-medium flex items-center gap-1 transition border border-slate-700 cursor-pointer"
                >
                  <Image className="w-3 h-3 text-sky-400" />
                  <span>បញ្ចូលរូបពីកុំព្យូទ័រ</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Layout Mode Chooser */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, layoutMode: 'single_hero' }))}
                  className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                    config.layoutMode === 'single_hero'
                      ? 'border-pink-500 bg-pink-500/10 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="w-6 h-8 rounded border border-current flex items-center justify-center text-[10px]">
                    1
                  </div>
                  <span>១ ប្លង់ពេញ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, layoutMode: 'split_2' }))}
                  className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                    config.layoutMode === 'split_2'
                      ? 'border-pink-500 bg-pink-500/10 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="w-6 h-8 rounded border border-current flex flex-col justify-between p-0.5 text-[8px]">
                    <div className="h-3 bg-current/20 rounded-xs" />
                    <div className="h-3 bg-current/20 rounded-xs" />
                  </div>
                  <span>២ ប្លង់ (Reels)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, layoutMode: 'split_3' }))}
                  className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                    config.layoutMode === 'split_3'
                      ? 'border-pink-500 bg-pink-500/10 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="w-6 h-8 rounded border border-current flex flex-col justify-between p-0.5 text-[8px]">
                    <div className="h-2 bg-current/20 rounded-xs" />
                    <div className="h-2 bg-current/20 rounded-xs" />
                    <div className="h-2 bg-current/20 rounded-xs" />
                  </div>
                  <span>៣ ប្លង់</span>
                </button>
              </div>

              {/* Slot Switcher for Multi-Split Layouts */}
              {config.layoutMode !== 'single_hero' && (
                <div className="flex items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400 text-[11px]">ប្លង់ដែលកំពុងជ្រើស៖</span>
                  {[0, 1, ...(config.layoutMode === 'split_3' ? [2] : [])].map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setActiveSlotIndex(slot)}
                      className={`px-3 py-1 rounded-lg font-bold border transition ${
                        activeSlotIndex === slot
                          ? 'border-pink-500 bg-pink-500 text-white'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      ប្លង់ទី {slot + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Brightness & Contrast Adjustments */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>ពន្លឺ (Brightness)៖</span>
                    <span>{(config.brightness * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={1.4}
                    step={0.05}
                    value={config.brightness}
                    onChange={(e) => setConfig(prev => ({ ...prev, brightness: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>កម្រិតពណ៌ (Contrast)៖</span>
                    <span>{(config.contrast * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.6}
                    step={0.05}
                    value={config.contrast}
                    onChange={(e) => setConfig(prev => ({ ...prev, contrast: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                </div>
              </div>
            </div>

            {/* PANEL 4: 🏷️ VIRAL BADGES & STICKERS */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-2 shadow-xs">
              <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <span>🏷️</span>
                <span>ស្លាកទាក់ទាញ (Viral Click Stickers)</span>
              </span>

              <div className="flex flex-wrap gap-1.5">
                {POPULAR_STICKERS.map(stk => {
                  const isSelected = config.tagStickers.includes(stk);
                  return (
                    <button
                      key={stk}
                      type="button"
                      onClick={() => {
                        setConfig(prev => ({
                          ...prev,
                          tagStickers: isSelected
                            ? prev.tagStickers.filter(s => s !== stk)
                            : [...prev.tagStickers, stk]
                        }));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        isSelected
                          ? 'bg-rose-600 text-white border-rose-500 shadow-xs'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {stk}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* 3. Bottom Action Bar */}
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 pb-safe">
          <div className="text-[11px] text-slate-400 font-sans hidden sm:block">
            💡 ព័ត៌មានជំនួយ៖ ប្រើ <span className="text-sky-300 font-semibold">Safe-Zone 1:1</span> ធានាថានៅពេលបង្ហោះលើ Facebook Reels លេខភាគមិនត្រូវបានកាត់ផ្តាច់ឡើយ។
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end">
            {/* Copy Image Button */}
            <button
              onClick={handleCopyClipboard}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-slate-700"
              title="ចម្លងរូបភាពទៅ Clipboard ដើម្បី Paste លើ Facebook/Chat"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'បានចម្លង!' : 'Copy រូប'}</span>
            </button>

            {/* Download JPG */}
            <button
              onClick={() => handleDownload('jpeg')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-slate-700"
              title="ទាញយករូបភាពជា JPG"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JPG</span>
            </button>

            {/* Download PNG HD */}
            <button
              onClick={() => handleDownload('png')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-slate-700"
              title="ទាញយករូបភាពជា PNG គុណភាពខ្ពស់ HD"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>PNG HD</span>
            </button>

            {/* Set as Video Cover Frame */}
            <button
              onClick={handleApplyAsCover}
              className="px-4 py-1.5 bg-gradient-to-r from-pink-600 via-rose-600 to-amber-500 hover:from-pink-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-pink-600/30 transition active:scale-95 cursor-pointer"
              title="រក្សាទុកជារូបភាពគម្របសម្រាប់គម្រោងវីដេអូនេះ"
            >
              <BookmarkCheck className="w-4 h-4 text-yellow-200" />
              <span>កំណត់ជាគម្របវីដេអូ</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
