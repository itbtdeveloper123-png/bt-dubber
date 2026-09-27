import fs from 'fs';
import path from 'path';
// @ts-ignore - node:sqlite is built-in in Node.js v22.5+ & v24+
import { DatabaseSync } from 'node:sqlite';
import { ClonedVoiceProfile } from '../types';

const DATA_DIR = process.env.APP_DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'dubber.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL Mode & High-Performance Caching for lightning-fast concurrent reads/writes
try { db.exec(`PRAGMA journal_mode = WAL;`); } catch {}
try { db.exec(`PRAGMA synchronous = NORMAL;`); } catch {}
try { db.exec(`PRAGMA cache_size = -64000;`); } catch {} // 64MB Cache
try { db.exec(`PRAGMA temp_store = MEMORY;`); } catch {}

// Initialize Tables
export function initDatabase() {
  // Table 1: Translated Recaps & Scripts
  db.exec(`
    CREATE TABLE IF NOT EXISTS recaps (
      id TEXT PRIMARY KEY,
      movie_title TEXT NOT NULL,
      series_title TEXT,
      episode_number INTEGER DEFAULT 1,
      genre_tag TEXT,
      total_duration TEXT,
      translation_mode TEXT,
      video_url TEXT,
      video_file_name TEXT,
      bgm_track_url TEXT,
      bgm_file_name TEXT,
      segments_json TEXT NOT NULL,
      raw_data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Table 2: Multi-Episode Series Projects & Timeline Sequences
  db.exec(`
    CREATE TABLE IF NOT EXISTS series_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      aspect_ratio TEXT DEFAULT '16:9',
      clips_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Table 3: TTS Audio Cache (Piseth, Sreymom, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tts_cache (
      cache_key TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      voice_name TEXT NOT NULL,
      rate TEXT,
      pitch TEXT,
      audio_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Table 4: Folders for Project Organization
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3B82F6',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Table 5: Cloned Voice Profiles
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloned_voices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      gender TEXT DEFAULT 'male',
      sample_audio_url TEXT,
      sample_file_name TEXT,
      pitch_offset INTEGER DEFAULT 0,
      formant_shift REAL DEFAULT 1.0,
      speed_rate REAL DEFAULT 1.0,
      timbre_preset TEXT DEFAULT 'natural',
      base_voice TEXT DEFAULT 'km-KH-PisethNeural',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrations for existing recaps & cloned_voices tables
  try {
    db.exec(`ALTER TABLE recaps ADD COLUMN folder_name TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE recaps ADD COLUMN folder_id TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cloned_voices ADD COLUMN is_pure_clone INTEGER DEFAULT 1`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cloned_voices ADD COLUMN provider TEXT DEFAULT 'edge'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cloned_voices ADD COLUMN kiri_voice_id TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cloned_voices ADD COLUMN hf_model TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cloned_voices ADD COLUMN colab_url TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cloned_voices ADD COLUMN sample_text TEXT DEFAULT ''`);
  } catch {}

  // High-Speed Database Indexes for instantaneous queries and filtering
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_recaps_folder_id ON recaps(folder_id);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_recaps_folder_name ON recaps(folder_name);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_recaps_movie_title ON recaps(movie_title);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_recaps_series_title ON recaps(series_title);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_folders_name ON folders(name);`); } catch {}

  // Auto-clean & merge any legacy duplicate folders on startup
  deduplicateFoldersInDb();

  console.log(`[SQLite DB] Initialized high-performance WAL database at: ${DB_PATH}`);

  // Auto-heal / migrate any legacy ephemeral blob: URLs or mismatched URLs to permanent /api/media/... files
  try {
    const rows = db.prepare('SELECT id, movie_title, video_url, video_file_name, bgm_track_url, bgm_file_name, total_duration, segments_json, created_at, raw_data_json FROM recaps').all() as any[];
    for (const row of rows) {
      const durSec = extractRecapDurationSeconds(row);
      const fixedVideo = resolveSafeMediaUrl(row.video_url, row.video_file_name, '', row.created_at || row.id, durSec);
      const fixedBgm = resolveSafeMediaUrl(row.bgm_track_url, row.bgm_file_name || row.video_file_name, 'bgm_', row.created_at || row.id);
      
      let changed = false;
      let rawObj: any = {};
      try { rawObj = JSON.parse(row.raw_data_json); } catch {}

      if (fixedVideo && fixedVideo !== row.video_url) {
        row.video_url = fixedVideo;
        rawObj.videoUrl = fixedVideo;
        changed = true;
      }
      if (fixedBgm && fixedBgm !== row.bgm_track_url) {
        row.bgm_track_url = fixedBgm;
        rawObj.bgmTrackUrl = fixedBgm;
        changed = true;
      }

      if (changed) {
        db.prepare('UPDATE recaps SET video_url = ?, bgm_track_url = ?, raw_data_json = ? WHERE id = ?')
          .run(fixedVideo, fixedBgm, JSON.stringify(rawObj), row.id);
        console.log(`[SQLite Migration] Auto-healed media URLs for: ${row.id} (${row.movie_title}) -> video: ${fixedVideo}, bgm: ${fixedBgm}`);
      }
    }

    // Clean up exact duplicate movie titles (keeping the newest one)
    db.exec(`
      DELETE FROM recaps 
      WHERE rowid NOT IN (
        SELECT MAX(rowid) 
        FROM recaps 
        GROUP BY movie_title
      );
    `);
  } catch (e) {
    console.warn('[SQLite Migration Notice]:', e);
  }
}

// ----------------- Media URL Auto-Resolution Helpers -----------------

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

// Fast sub-millisecond MP4 duration parser from header box (mvhd)
export function getMp4Duration(filePath: string): number | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(500000);
    const bytesRead = fs.readSync(fd, buffer, 0, 500000, 0);
    fs.closeSync(fd);
    
    const idx = buffer.indexOf(Buffer.from('mvhd'));
    if (idx !== -1 && idx + 32 <= bytesRead) {
      const version = buffer.readUInt8(idx + 4);
      if (version === 0) {
        const timescale = buffer.readUInt32BE(idx + 16);
        const duration = buffer.readUInt32BE(idx + 20);
        if (timescale > 0) return duration / timescale;
      } else if (version === 1) {
        const timescale = buffer.readUInt32BE(idx + 24);
        const duration = Number(buffer.readBigUInt64BE(idx + 28));
        if (timescale > 0) return duration / timescale;
      }
    }
  } catch {}
  return null;
}

export function parseDurationString(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':').map(p => parseFloat(p) || 0);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const directNum = parseFloat(timeStr);
  return isNaN(directNum) ? 0 : directNum;
}

export function extractRecapDurationSeconds(recapOrRow: any): number {
  if (!recapOrRow) return 0;
  let dur = parseDurationString(recapOrRow.total_recap_duration_est || recapOrRow.total_duration);
  let segs: any[] = [];
  try {
    if (typeof recapOrRow.segments_json === 'string') {
      segs = JSON.parse(recapOrRow.segments_json);
    } else if (Array.isArray(recapOrRow.recap_segments)) {
      segs = recapOrRow.recap_segments;
    }
  } catch {}
  for (const s of segs) {
    const end = parseDurationString(s.end_time);
    if (end > dur) dur = end;
  }
  return dur;
}

export function findUploadMatch(
  fileName?: string | null, 
  prefix = '', 
  targetTimestamp?: number | string | null,
  targetDurationSec?: number | null
): string | null {
  if (!fileName || !fs.existsSync(UPLOADS_DIR)) return null;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const baseNoExt = safe.replace(/\.[^/.]+$/, '');
    
    let targetTs: number | null = null;
    if (typeof targetTimestamp === 'number') {
      targetTs = targetTimestamp;
    } else if (typeof targetTimestamp === 'string') {
      const matchId = targetTimestamp.match(/recap_(\d+)/);
      if (matchId) {
        targetTs = parseInt(matchId[1], 10);
      } else {
        try {
          const dt = new Date(targetTimestamp).getTime();
          if (!isNaN(dt)) targetTs = dt;
        } catch {}
      }
    }

    // 1. Exact match
    const exact = files.find(f => f === safe || f === fileName);
    if (exact && (!targetDurationSec || prefix)) return `/api/media/${exact}`;

    // 2. Strict suffix match with timestamp: e.g. 1787023456595_ep1.mp4 for fileName "ep1.mp4"
    const candidates: { file: string; ts: number; dur?: number | null; durDiff: number; tsDiff: number }[] = [];
    for (const f of files) {
      if (prefix && !f.startsWith(prefix)) continue;
      if (!prefix && (f.startsWith('bgm_') || f.startsWith('clean_') || f.endsWith('_opt.mp4'))) continue;

      let isMatch = false;
      if (prefix === 'bgm_' && (f.endsWith(`_${safe}.wav`) || f.endsWith(`_${safe}.mp4.wav`) || f.endsWith(`_${baseNoExt}.wav`) || f.endsWith(`_${baseNoExt}.mp4.wav`) || f.endsWith(`_${fileName}`))) {
        isMatch = true;
      } else if (f.endsWith(`_${safe}`) || f.endsWith(`_${fileName}`) || f === safe || f === fileName) {
        isMatch = true;
      }

      if (isMatch) {
        const tm = f.match(/^(?:bgm_)?(\d+)_/);
        const ts = tm ? parseInt(tm[1], 10) : 0;
        const tsDiff = targetTs ? Math.abs(targetTs - ts) : 0;
        
        let dur: number | null = null;
        let durDiff = 999999;
        if (!prefix && targetDurationSec && targetDurationSec > 0 && f.endsWith('.mp4')) {
          dur = getMp4Duration(path.join(UPLOADS_DIR, f));
          if (dur !== null) {
            durDiff = Math.abs(targetDurationSec - dur);
          }
        }
        candidates.push({ file: f, ts, dur, durDiff, tsDiff });
      }
    }

    if (candidates.length > 0) {
      if (!prefix && targetDurationSec && targetDurationSec > 0) {
        // Duration matches take highest priority (e.g. 04:17 matching 256.4s vs 102s)
        candidates.sort((a, b) => {
          if (Math.abs(a.durDiff - b.durDiff) > 5) {
            return a.durDiff - b.durDiff;
          }
          return a.tsDiff - b.tsDiff;
        });
      } else if (targetTs) {
        candidates.sort((a, b) => a.tsDiff - b.tsDiff);
      } else {
        candidates.sort((a, b) => b.ts - a.ts);
      }
      return `/api/media/${candidates[0].file}`;
    }

    // 3. Exact word boundary match for base name (prevents ep1 from matching ep10, ep11, etc.)
    const escapedBase = baseNoExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|_)${escapedBase}(\\.[^.]+$|$)`, 'i');
    const wordMatches: { file: string; ts: number; dur?: number | null; durDiff: number; tsDiff: number }[] = [];
    for (const f of files) {
      if (prefix && !f.startsWith(prefix)) continue;
      if (!prefix && (f.startsWith('bgm_') || f.startsWith('clean_') || f.endsWith('_opt.mp4'))) continue;
      if (regex.test(f)) {
        const tm = f.match(/^(?:bgm_)?(\d+)_/);
        const ts = tm ? parseInt(tm[1], 10) : 0;
        const tsDiff = targetTs ? Math.abs(targetTs - ts) : 0;
        let dur: number | null = null;
        let durDiff = 999999;
        if (!prefix && targetDurationSec && targetDurationSec > 0 && f.endsWith('.mp4')) {
          dur = getMp4Duration(path.join(UPLOADS_DIR, f));
          if (dur !== null) {
            durDiff = Math.abs(targetDurationSec - dur);
          }
        }
        wordMatches.push({ file: f, ts, dur, durDiff, tsDiff });
      }
    }

    if (wordMatches.length > 0) {
      if (!prefix && targetDurationSec && targetDurationSec > 0) {
        wordMatches.sort((a, b) => {
          if (Math.abs(a.durDiff - b.durDiff) > 5) {
            return a.durDiff - b.durDiff;
          }
          return a.tsDiff - b.tsDiff;
        });
      } else if (targetTs) {
        wordMatches.sort((a, b) => a.tsDiff - b.tsDiff);
      } else {
        wordMatches.sort((a, b) => b.ts - a.ts);
      }
      return `/api/media/${wordMatches[0].file}`;
    }

    return null;
  } catch {
    return null;
  }
}

export function resolveSafeMediaUrl(
  url?: string | null, 
  fileName?: string | null, 
  prefix = '', 
  targetTimestamp?: number | string | null,
  targetDurationSec?: number | null
): string | null {
  if (url && (url.startsWith('/api/media/') || url.includes('/api/media/'))) {
    const rawFileName = url.replace(/.*\/api\/media\//, '').split('?')[0];
    const decodedFileName = decodeURIComponent(rawFileName);
    const fullPath = path.join(UPLOADS_DIR, decodedFileName);
    if (fs.existsSync(fullPath)) {
      // If we have targetDurationSec and the existing file's duration is wildly mismatched (e.g. 102s vs 256s)
      if (!prefix && targetDurationSec && targetDurationSec > 0 && fileName) {
        const curDur = getMp4Duration(fullPath);
        if (curDur !== null && Math.abs(curDur - targetDurationSec) > 15) {
          const betterMatch = findUploadMatch(fileName, prefix, targetTimestamp, targetDurationSec);
          if (betterMatch) return betterMatch;
        }
      }
      return url;
    }
  }
  
  if (url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    return url;
  }
  
  // If url is blob: or missing or missing from disk, search data/uploads for permanent file
  const matched = findUploadMatch(fileName, prefix, targetTimestamp, targetDurationSec);
  if (matched) return matched;

  // If still blob: and not resolved in uploads, discard expired blob URL
  if (url && url.startsWith('blob:')) {
    return null;
  }

  return url || null;
}

// ----------------- Recap CRUD Helpers -----------------

export function saveRecapToDb(recap: any): any {
  // 1. Never save dummy demo recaps
  if (
    recap.movie_title?.includes('Cyber Vault') || 
    recap.movie_title?.includes('ប្លន់ធនាគារ') ||
    recap.movie_title?.includes('ក្មេងស្រីអនាថា') ||
    recap.videoUrl?.includes('flower.mp4')
  ) {
    return recap;
  }

  // 2. Allow saving if there are segments OR if there is a real videoUrl/videoFileName/folderName/seriesTitle
  const hasContent = (recap.recap_segments && recap.recap_segments.length > 0) || 
    Boolean(recap.videoUrl) || 
    Boolean(recap.videoFileName) || 
    Boolean(recap.folderName) || 
    Boolean(recap.folder_name) || 
    Boolean(recap.seriesTitle);

  if (!hasContent) {
    return recap;
  }

  // 3. Handle explicit renaming: If oldTitle was supplied and differs from new movie_title, remove old record
  if (recap.old_title && recap.old_title !== recap.movie_title) {
    try {
      db.prepare('DELETE FROM recaps WHERE movie_title = ?').run(recap.old_title);
    } catch {}
  }

  // 4. Deduplicate: Find existing record by id, movie_title, or video_file_name
  let existingId = recap.id;
  if (!existingId && recap.movie_title) {
    const existing = db.prepare('SELECT id FROM recaps WHERE movie_title = ? LIMIT 1').get(recap.movie_title) as any;
    if (existing) {
      existingId = existing.id;
    }
  }

  // Also check if existing record has same video file name
  if (!existingId && recap.videoFileName) {
    const existingByFile = db.prepare('SELECT id FROM recaps WHERE video_file_name = ? LIMIT 1').get(recap.videoFileName) as any;
    if (existingByFile) {
      existingId = existingByFile.id;
    }
  }

  const id = existingId || `recap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const createdAt = recap.created_at || now;
  const updatedAt = now;

  const durSec = extractRecapDurationSeconds(recap);
  const safeVideoUrl = resolveSafeMediaUrl(recap.videoUrl, recap.videoFileName, '', createdAt || id, durSec);
  const safeBgmUrl = resolveSafeMediaUrl(recap.bgmTrackUrl, recap.bgmFileName || recap.videoFileName, 'bgm_', createdAt || id);
  const targetFolderName = recap.folderName || recap.folder_name || recap.seriesTitle || '';
  const targetFolderId = recap.folderId || recap.folder_id || '';

  const sanitizedRecap = {
    ...recap,
    id,
    movie_title: recap.movie_title || recap.title || 'Untitled Recap',
    folderName: targetFolderName,
    folderId: targetFolderId,
    videoUrl: safeVideoUrl || (recap.videoUrl?.startsWith('blob:') ? null : recap.videoUrl),
    bgmTrackUrl: safeBgmUrl || (recap.bgmTrackUrl?.startsWith('blob:') ? null : recap.bgmTrackUrl),
    created_at: createdAt,
    updated_at: updatedAt
  };

  const stmt = db.prepare(`
    INSERT INTO recaps (
      id, movie_title, series_title, folder_name, folder_id, episode_number, genre_tag, 
      total_duration, translation_mode, video_url, video_file_name,
      bgm_track_url, bgm_file_name, segments_json, raw_data_json, 
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      movie_title=excluded.movie_title,
      series_title=excluded.series_title,
      folder_name=excluded.folder_name,
      folder_id=excluded.folder_id,
      episode_number=excluded.episode_number,
      genre_tag=excluded.genre_tag,
      total_duration=excluded.total_duration,
      translation_mode=excluded.translation_mode,
      video_url=excluded.video_url,
      video_file_name=excluded.video_file_name,
      bgm_track_url=excluded.bgm_track_url,
      bgm_file_name=excluded.bgm_file_name,
      segments_json=excluded.segments_json,
      raw_data_json=excluded.raw_data_json,
      updated_at=excluded.updated_at
  `);

  stmt.run(
    id,
    sanitizedRecap.movie_title,
    recap.seriesTitle || targetFolderName || null,
    targetFolderName || null,
    targetFolderId || null,
    recap.episodeNumber || 1,
    recap.genre_tag || 'Action',
    recap.total_recap_duration_est || '00:00',
    recap.translationMode || 'movie_recap',
    sanitizedRecap.videoUrl || null,
    recap.videoFileName || null,
    sanitizedRecap.bgmTrackUrl || null,
    recap.bgmFileName || null,
    JSON.stringify(recap.recap_segments || []),
    JSON.stringify(sanitizedRecap),
    createdAt,
    updatedAt
  );

  return sanitizedRecap;
}

export function getAllRecapsFromDb(): any[] {
  const stmt = db.prepare(`
    SELECT * FROM recaps ORDER BY updated_at DESC
  `);
  const rows = stmt.all();
  return rows.map((row: any) => {
    const durSec = extractRecapDurationSeconds(row);
    try {
      const parsed = JSON.parse(row.raw_data_json);
      const safeVideo = resolveSafeMediaUrl(parsed.videoUrl || row.video_url, parsed.videoFileName || row.video_file_name, '', row.created_at || row.id, durSec);
      const safeBgm = resolveSafeMediaUrl(parsed.bgmTrackUrl || row.bgm_track_url, parsed.bgmFileName || row.bgm_file_name || row.video_file_name, 'bgm_', row.created_at || row.id);

      return {
        ...parsed,
        id: row.id,
        folderName: row.folder_name || parsed.folderName || parsed.seriesTitle || '',
        folderId: row.folder_id || parsed.folderId || '',
        videoUrl: safeVideo,
        bgmTrackUrl: safeBgm,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch {
      const safeVideo = resolveSafeMediaUrl(row.video_url, row.video_file_name, '', row.created_at || row.id, durSec);
      const safeBgm = resolveSafeMediaUrl(row.bgm_track_url, row.bgm_file_name || row.video_file_name, 'bgm_', row.created_at || row.id);

      return {
        id: row.id,
        movie_title: row.movie_title,
        seriesTitle: row.series_title,
        folderName: row.folder_name || row.series_title || '',
        folderId: row.folder_id || '',
        episodeNumber: row.episode_number,
        genre_tag: row.genre_tag,
        total_recap_duration_est: row.total_duration,
        translationMode: row.translation_mode,
        videoUrl: safeVideo,
        videoFileName: row.video_file_name,
        bgmTrackUrl: safeBgm,
        bgmFileName: row.bgm_file_name,
        recap_segments: JSON.parse(row.segments_json || '[]'),
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  });
}

export function getRecapByIdFromDb(id: string): any | null {
  const stmt = db.prepare(`SELECT * FROM recaps WHERE id = ?`);
  const row = stmt.get(id) as any;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.raw_data_json);
    const safeVideo = resolveSafeMediaUrl(parsed.videoUrl || row.video_url, parsed.videoFileName || row.video_file_name, '');
    const safeBgm = resolveSafeMediaUrl(parsed.bgmTrackUrl || row.bgm_track_url, parsed.bgmFileName || row.bgm_file_name || row.video_file_name, 'bgm_');

    return { 
      ...parsed, 
      id: row.id, 
      folderName: row.folder_name || parsed.folderName || parsed.seriesTitle || '',
      folderId: row.folder_id || parsed.folderId || '',
      videoUrl: safeVideo,
      bgmTrackUrl: safeBgm,
      created_at: row.created_at, 
      updated_at: row.updated_at 
    };
  } catch {
    return null;
  }
}

export function getRecapsByFolderNameFromDb(folderName: string, folderId?: string): any[] {
  const all = getAllRecapsFromDb();
  const cleanTarget = (folderName || '').trim().toLowerCase();
  return all.filter(r => {
    if (folderId && r.folderId === folderId) return true;
    const fName = (r.folderName || r.seriesTitle || '').trim().toLowerCase();
    return (cleanTarget && fName === cleanTarget) || (cleanTarget && fName.includes(cleanTarget)) || (fName && cleanTarget.includes(fName));
  }).sort((a, b) => (a.episodeNumber || 1) - (b.episodeNumber || 1));
}

export function deleteRecapFromDb(idOrTitle: string): boolean {
  try {
    const stmt = db.prepare(`DELETE FROM recaps WHERE id = ? OR movie_title = ?`);
    stmt.run(idOrTitle, idOrTitle);
  } catch (e) {
    console.warn('SQLite delete recap error:', e);
  }
  return true;
}

// ----------------- Series Continuity & Character Names Auto-Lookup -----------------

export function getSeriesContextAndCharactersFromDb(seriesTitle?: string, currentMovieTitle?: string, currentEpisodeNumber?: number): {
  seriesTitle: string;
  currentEpisode: number;
  hasPreviousEpisodes: boolean;
  characterNames: string[];
  glossaryPrompt: string;
} {
  try {
    const rows = db.prepare('SELECT * FROM recaps ORDER BY episode_number ASC, created_at ASC').all() as any[];
    if (!rows || rows.length === 0) {
      return { seriesTitle: seriesTitle || 'Movie', currentEpisode: currentEpisodeNumber || 1, hasPreviousEpisodes: false, characterNames: [], glossaryPrompt: '' };
    }

    // Clean base series title from movieTitle if not explicitly provided
    let cleanSeries = (seriesTitle || '').trim();
    if (!cleanSeries && currentMovieTitle) {
      cleanSeries = currentMovieTitle
        .replace(/\s*[-_–|]\s*(?:ភាគ|វគ្គ|EP|Episode)\s*(?:ទី)?\s*\d+/gi, '')
        .replace(/\s*(?:ភាគ|វគ្គ|EP|Episode)\s*(?:ទី)?\s*\d+/gi, '')
        .replace(/\.[^/.]+$/, '')
        .trim();
    }

    // Find matching recaps in the series / folder
    const matching = rows.filter(r => {
      const rSeries = (r.series_title || r.folder_name || '').trim().toLowerCase();
      const rMovie = (r.movie_title || '').trim().toLowerCase();
      const target = cleanSeries.toLowerCase();
      if (!target) return false;
      return (rSeries && (rSeries.includes(target) || target.includes(rSeries))) ||
             (rMovie && (rMovie.includes(target) || target.includes(rMovie)));
    });

    if (matching.length === 0) {
      return { seriesTitle: cleanSeries || 'Movie', currentEpisode: currentEpisodeNumber || 1, hasPreviousEpisodes: false, characterNames: [], glossaryPrompt: '' };
    }

    const characterMap = new Map<string, { count: number; gender: string; sampleLines: string[] }>();
    const epSummaries: string[] = [];

    matching.forEach(m => {
      let segs: any[] = [];
      try { segs = JSON.parse(m.segments_json || '[]'); } catch {}
      const epN = m.episode_number || 1;
      const keyCharacters = new Set<string>();

      segs.forEach(s => {
        if (s.speaker_name && s.speaker_name !== 'អ្នកសម្រាយ' && s.speaker_name !== 'Narrator') {
          const name = s.speaker_name.trim();
          if (name && !name.includes('អ្នកភូមិ') && !name.includes('ហ្វូងមនុស្ស') && !name.includes('អ្នក村民')) {
            keyCharacters.add(name);
            if (!characterMap.has(name)) {
              characterMap.set(name, { count: 0, gender: s.speaker_gender || 'male', sampleLines: [] });
            }
            const entry = characterMap.get(name)!;
            entry.count++;
            if (entry.sampleLines.length < 2 && s.khmer_script) {
              entry.sampleLines.push(s.khmer_script);
            }
          }
        }
      });

      if (segs.length > 0) {
        const epSummary = segs.slice(0, 3).map((s: any) => s.khmer_script).join(' ');
        epSummaries.push(`- ភាគទី ${epN} (${m.movie_title}): តួអង្គ [${[...keyCharacters].join(', ')}] | បរិបទ: "${epSummary.slice(0, 150)}..."`);
      }
    });

    const sortedCharacters = [...characterMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);

    const characterNames = sortedCharacters.map(([name]) => name);

    let glossaryPrompt = `
========================================================================================
CRITICAL MULTI-EPISODE SERIES CONTINUITY & CHARACTER NAMES GLOSSARY (វចនានុក្រមឈ្មោះតួអង្គ និងការតភ្ជាប់ភាគ):
========================================================================================
- Series / Universe Title: "${cleanSeries || 'Drama Series'}"
- Current Episode Being Translated: Episode ${currentEpisodeNumber || (matching.length + 1)}

ESTABLISHED CHARACTER NAMES FROM PREVIOUS EPISODES (ឈ្មោះតួអង្គដែលបានប្រើប្រាស់ក្នុងភាគមុនៗ - ត្រូវតែបន្តប្រើឈ្មោះនេះ ១០០%):
${sortedCharacters.map(([name, data]) => `  * "${name}" (${data.gender}) -> គំរូប្រយោគនិយាយ: "${data.sampleLines[0] || '...'}"`).join('\n')}

PREVIOUS EPISODES STORY CONTEXT (សាច់រឿងភាគមុនៗ):
${epSummaries.slice(-4).join('\n')}

CRITICAL RULES FOR CHARACTER NAME CONSISTENCY (ក្បួនដាច់ខាតសម្រាប់ឈ្មោះតួអង្គ):
1. **STRICT ZERO-DEVIATION NAME CONTINUITY**: You MUST strictly use the exact established Khmer names listed above!
   - NEVER invent new alternative transliterations or rename characters!
   - (e.g. If the main character is established as "ឡៅចៅ", DO NOT rename him to "លីវ" or "តាលីវ" or "ចាវ"!).
   - (e.g. If the female lead is "គុយអ៊ីង", DO NOT change her to "ចេន គួយអ៊ីង" or "គួយអុីង"!).
2. Accurately assign these exact names in "speaker_name" and in all spoken dialogue sentences.
`;

    return {
      seriesTitle: cleanSeries,
      currentEpisode: currentEpisodeNumber || (matching.length + 1),
      hasPreviousEpisodes: true,
      characterNames,
      glossaryPrompt
    };
  } catch (err) {
    console.warn('Error fetching series context:', err);
    return { seriesTitle: seriesTitle || 'Movie', currentEpisode: currentEpisodeNumber || 1, hasPreviousEpisodes: false, characterNames: [], glossaryPrompt: '' };
  }
}

// ----------------- Folders CRUD & Deduplication Helpers -----------------

export function deduplicateFoldersInDb(): void {
  try {
    const all = db.prepare(`SELECT * FROM folders ORDER BY created_at ASC`).all() as any[];
    const seenNames = new Map<string, string>(); // lowerName -> primaryId
    const toDeleteIds: string[] = [];

    for (const f of all) {
      const cleanName = (f.name || '').trim().toLowerCase();
      if (!cleanName) continue;

      if (!seenNames.has(cleanName)) {
        seenNames.set(cleanName, f.id);
      } else {
        const primaryId = seenNames.get(cleanName)!;
        toDeleteIds.push(f.id);
        // Remap any recaps pointing to this duplicate folder to the primary folder
        try {
          db.prepare(`UPDATE recaps SET folder_id = ? WHERE folder_id = ?`).run(primaryId, f.id);
        } catch {}
      }
    }

    if (toDeleteIds.length > 0) {
      const delStmt = db.prepare(`DELETE FROM folders WHERE id = ?`);
      for (const delId of toDeleteIds) {
        delStmt.run(delId);
      }
      console.log(`🧹 [Database Cleaner] Merged and cleaned up ${toDeleteIds.length} duplicate folders in SQLite!`);
    }
  } catch (err) {
    console.warn('Folder deduplication notice:', err);
  }
}

export function getAllFoldersFromDb(): any[] {
  const stmt = db.prepare(`SELECT * FROM folders ORDER BY name ASC`);
  const rows = stmt.all() as any[];
  const seenNames = new Set<string>();
  const uniqueFolders: any[] = [];

  for (const row of rows) {
    const cleanName = (row.name || '').trim();
    const lower = cleanName.toLowerCase();
    if (!lower || seenNames.has(lower)) continue;
    seenNames.add(lower);
    uniqueFolders.push({
      id: row.id,
      name: cleanName,
      color: row.color || '#3B82F6',
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  return uniqueFolders;
}

export function saveFolderToDb(folder: any): any {
  const now = new Date().toISOString();
  const rawName = (folder.name || 'Folder ថ្មី').trim();
  const lowerName = rawName.toLowerCase();

  // 1. Check if folder already exists by exact ID
  if (folder.id) {
    const existingById = db.prepare(`SELECT * FROM folders WHERE id = ?`).get(folder.id) as any;
    if (existingById) {
      const stmt = db.prepare(`UPDATE folders SET name = ?, color = ?, updated_at = ? WHERE id = ?`);
      stmt.run(rawName, folder.color || existingById.color || '#3B82F6', now, folder.id);
      return { id: folder.id, name: rawName, color: folder.color || existingById.color, created_at: existingById.created_at, updated_at: now };
    }
  }

  // 2. Deduplicate: Check if a folder with the same name already exists
  const existingByName = db.prepare(`SELECT * FROM folders WHERE LOWER(TRIM(name)) = ?`).get(lowerName) as any;
  if (existingByName) {
    const stmt = db.prepare(`UPDATE folders SET color = ?, updated_at = ? WHERE id = ?`);
    stmt.run(folder.color || existingByName.color || '#3B82F6', now, existingByName.id);
    return { id: existingByName.id, name: existingByName.name, color: folder.color || existingByName.color, created_at: existingByName.created_at, updated_at: now };
  }

  // 3. Create new unique folder record
  const id = folder.id || `folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const createdAt = folder.created_at || now;
  const updatedAt = now;

  const stmt = db.prepare(`
    INSERT INTO folders (id, name, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, rawName, folder.color || '#3B82F6', createdAt, updatedAt);
  return { id, name: rawName, color: folder.color || '#3B82F6', created_at: createdAt, updated_at: updatedAt };
}

export function deleteFolderFromDb(id: string): boolean {
  // 1. Delete folder record
  const stmt = db.prepare(`DELETE FROM folders WHERE id = ?`);
  stmt.run(id);
  // 2. Unlink recaps assigned to this folder
  try {
    db.prepare(`UPDATE recaps SET folder_id = '', folder_name = '' WHERE folder_id = ?`).run(id);
  } catch {}
  return true;
}

export function assignRecapFolderInDb(recapId: string, folderName: string, folderId: string = ''): boolean {
  const now = new Date().toISOString();
  // Fetch existing recap raw_data_json to keep synced
  const row = db.prepare(`SELECT raw_data_json FROM recaps WHERE id = ?`).get(recapId) as any;
  let rawJson = '';
  if (row && row.raw_data_json) {
    try {
      const obj = JSON.parse(row.raw_data_json);
      obj.folderName = folderName;
      obj.folderId = folderId;
      rawJson = JSON.stringify(obj);
    } catch {}
  }

  if (rawJson) {
    db.prepare(`
      UPDATE recaps SET folder_name = ?, folder_id = ?, raw_data_json = ?, updated_at = ? WHERE id = ?
    `).run(folderName, folderId, rawJson, now, recapId);
  } else {
    db.prepare(`
      UPDATE recaps SET folder_name = ?, folder_id = ?, updated_at = ? WHERE id = ?
    `).run(folderName, folderId, now, recapId);
  }
  return true;
}

// ----------------- Series Projects & Sequences CRUD Helpers -----------------

export function saveSeriesProjectToDb(project: any): any {
  const id = project.id || `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const createdAt = project.created_at || now;
  const updatedAt = now;

  const stmt = db.prepare(`
    INSERT INTO series_projects (
      id, title, description, aspect_ratio, clips_json, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      description=excluded.description,
      aspect_ratio=excluded.aspect_ratio,
      clips_json=excluded.clips_json,
      updated_at=excluded.updated_at
  `);

  stmt.run(
    id,
    project.title || 'Untitled Series',
    project.description || '',
    project.aspectRatio || '16:9',
    JSON.stringify(project.clips || []),
    createdAt,
    updatedAt
  );

  return { ...project, id, created_at: createdAt, updated_at: updatedAt };
}

export function getAllSeriesProjectsFromDb(): any[] {
  const stmt = db.prepare(`SELECT * FROM series_projects ORDER BY updated_at DESC`);
  const rows = stmt.all();
  return rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    aspectRatio: row.aspect_ratio,
    clips: JSON.parse(row.clips_json || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function getSeriesProjectByIdFromDb(id: string): any | null {
  const stmt = db.prepare(`SELECT * FROM series_projects WHERE id = ?`);
  const row = stmt.get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    aspectRatio: row.aspect_ratio,
    clips: JSON.parse(row.clips_json || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function deleteSeriesProjectFromDb(id: string): boolean {
  const stmt = db.prepare(`DELETE FROM series_projects WHERE id = ?`);
  stmt.run(id);
  return true;
}

// ----------------- TTS Cache Helpers -----------------

export function getCachedTTSFromDb(key: string): string | null {
  try {
    const stmt = db.prepare(`SELECT audio_base64 FROM tts_cache WHERE cache_key = ?`);
    const row = stmt.get(key) as any;
    return row ? row.audio_base64 : null;
  } catch {
    return null;
  }
}

export function setCachedTTSToDb(key: string, text: string, voiceName: string, rate: string, pitch: string, audioBase64: string) {
  try {
    const stmt = db.prepare(`
      INSERT INTO tts_cache (cache_key, text, voice_name, rate, pitch, audio_base64, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET audio_base64=excluded.audio_base64
    `);
    stmt.run(key, text, voiceName, rate, pitch, audioBase64, new Date().toISOString());
  } catch (e) {
    console.warn('TTS Cache save error:', e);
  }
}

export function clearAllTTSCacheFromDb(): void {
  try {
    db.prepare(`DELETE FROM tts_cache`).run();
  } catch (e) {
    console.warn('TTS Cache clear error:', e);
  }
}

// ----------------- Cloned Voices CRUD -----------------
export function getAllClonedVoicesFromDb(): ClonedVoiceProfile[] {
  try {
    const rows = db.prepare(`SELECT * FROM cloned_voices ORDER BY created_at DESC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      gender: r.gender || 'male',
      sampleAudioUrl: r.sample_audio_url || '',
      sampleFileName: r.sample_file_name || '',
      sampleText: r.sample_text || '',
      pitchOffset: r.pitch_offset ?? 0,
      formantShift: r.formant_shift ?? 1.0,
      speedRate: r.speed_rate ?? 1.0,
      timbrePreset: r.timbre_preset || 'natural',
      baseVoice: r.base_voice || (r.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural'),
      isPureClone: r.is_pure_clone !== undefined ? Boolean(r.is_pure_clone) : true,
      provider: r.provider || 'edge',
      kiriVoiceId: r.kiri_voice_id || undefined,
      hfModel: r.hf_model || undefined,
      colabUrl: r.colab_url || undefined,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  } catch (err) {
    console.error('Failed to get cloned voices from SQLite:', err);
    return [];
  }
}

export function getClonedVoiceByIdFromDb(id: string): ClonedVoiceProfile | null {
  try {
    const stmt = db.prepare(`SELECT * FROM cloned_voices WHERE LOWER(id) = LOWER(?)`);
    const r = stmt.get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      gender: r.gender || 'male',
      sampleAudioUrl: r.sample_audio_url || '',
      sampleFileName: r.sample_file_name || '',
      sampleText: r.sample_text || '',
      pitchOffset: r.pitch_offset ?? 0,
      formantShift: r.formant_shift ?? 1.0,
      speedRate: r.speed_rate ?? 1.0,
      timbrePreset: r.timbre_preset || 'natural',
      baseVoice: r.base_voice || (r.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural'),
      isPureClone: r.is_pure_clone !== undefined ? Boolean(r.is_pure_clone) : true,
      provider: r.provider || 'edge',
      kiriVoiceId: r.kiri_voice_id || undefined,
      hfModel: r.hf_model || undefined,
      colabUrl: r.colab_url || undefined,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  } catch {
    return null;
  }
}

export function saveClonedVoiceToDb(voice: Partial<ClonedVoiceProfile>): ClonedVoiceProfile {
  const id = voice.id || `voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const name = voice.name || 'Cloned Voice';
  const description = voice.description || '';
  const gender = voice.gender || 'male';
  const sampleAudioUrl = voice.sampleAudioUrl || '';
  const sampleFileName = voice.sampleFileName || '';
  const sampleText = voice.sampleText || '';
  const pitchOffset = voice.pitchOffset ?? 0;
  const formantShift = voice.formantShift ?? 1.0;
  const speedRate = voice.speedRate ?? 1.0;
  const timbrePreset = voice.timbrePreset || 'natural';
  const baseVoice = voice.baseVoice || (gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural');
  const isPureClone = voice.isPureClone !== undefined ? (voice.isPureClone ? 1 : 0) : 1;
  const provider = voice.provider || 'edge';
  const kiriVoiceId = voice.kiriVoiceId || '';
  const hfModel = voice.hfModel || '';
  const colabUrl = voice.colabUrl || '';
  const createdAt = voice.created_at || now;

  const stmt = db.prepare(`
    INSERT INTO cloned_voices (
      id, name, description, gender, sample_audio_url, sample_file_name, sample_text,
      pitch_offset, formant_shift, speed_rate, timbre_preset, base_voice,
      is_pure_clone, provider, kiri_voice_id, hf_model, colab_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      description=excluded.description,
      gender=excluded.gender,
      sample_audio_url=excluded.sample_audio_url,
      sample_file_name=excluded.sample_file_name,
      sample_text=excluded.sample_text,
      pitch_offset=excluded.pitch_offset,
      formant_shift=excluded.formant_shift,
      speed_rate=excluded.speed_rate,
      timbre_preset=excluded.timbre_preset,
      base_voice=excluded.base_voice,
      is_pure_clone=excluded.is_pure_clone,
      provider=excluded.provider,
      kiri_voice_id=excluded.kiri_voice_id,
      hf_model=excluded.hf_model,
      colab_url=excluded.colab_url,
      updated_at=excluded.updated_at
  `);

  stmt.run(
    id, name, description, gender, sampleAudioUrl, sampleFileName, sampleText,
    pitchOffset, formantShift, speedRate, timbrePreset, baseVoice,
    isPureClone, provider, kiriVoiceId, hfModel, colabUrl, createdAt, now
  );

  return {
    id,
    name,
    description,
    gender,
    sampleAudioUrl,
    sampleFileName,
    pitchOffset,
    formantShift,
    speedRate,
    timbrePreset,
    baseVoice,
    isPureClone: Boolean(isPureClone),
    provider,
    kiriVoiceId: kiriVoiceId || undefined,
    hfModel: hfModel || undefined,
    colabUrl: colabUrl || undefined,
    created_at: createdAt,
    updated_at: now,
  };
}

export function deleteClonedVoiceFromDb(id: string): boolean {
  try {
    const stmt = db.prepare(`DELETE FROM cloned_voices WHERE id = ?`);
    stmt.run(id);
    return true;
  } catch {
    return false;
  }
}

export { db };
