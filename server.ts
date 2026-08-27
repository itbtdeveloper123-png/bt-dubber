import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import { Readable } from "stream";
import { exec, spawn, spawnSync } from "child_process";
import { GoogleGenAI, Type } from "@google/genai";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import dotenv from "dotenv";
import {
  initDatabase,
  saveRecapToDb,
  getAllRecapsFromDb,
  getRecapByIdFromDb,
  deleteRecapFromDb,
  getAllFoldersFromDb,
  saveFolderToDb,
  deleteFolderFromDb,
  assignRecapFolderInDb,
  saveSeriesProjectToDb,
  getAllSeriesProjectsFromDb,
  getSeriesProjectByIdFromDb,
  deleteSeriesProjectFromDb,
  getCachedTTSFromDb,
  setCachedTTSToDb,
  clearAllTTSCacheFromDb,
  getAllClonedVoicesFromDb,
  getClonedVoiceByIdFromDb,
  saveClonedVoiceToDb,
  deleteClonedVoiceFromDb,
  getSeriesContextAndCharactersFromDb,
  getRecapsByFolderNameFromDb,
  db
} from "./src/db/sqlite";

dotenv.config();

// Initialize SQLite database
initDatabase();

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Configure local storage directories (supports customizable APP_DATA_DIR for desktop app)
const DATA_DIR = process.env.APP_DATA_DIR || path.join(process.cwd(), "data");
const TEMP_DIR = path.join(DATA_DIR, "temp");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const EXPORTS_DIR = path.join(DATA_DIR, "exports");

[TEMP_DIR, UPLOADS_DIR, EXPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

process.env.TEMP = TEMP_DIR;
process.env.TMP = TEMP_DIR;

// Purge expired orphaned temporary files on server startup to maintain clean disk space
function purgeOldTempFiles(): void {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    let deletedCount = 0;

    for (const f of files) {
      const fullPath = path.join(TEMP_DIR, f);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile() && (now - stats.mtimeMs > maxAgeMs)) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        } else if (stats.isDirectory() && (now - stats.mtimeMs > maxAgeMs)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          deletedCount++;
        }
      } catch {}
    }
    if (deletedCount > 0) {
      console.log(`🧹 [Temp Cleaner] Purged ${deletedCount} expired temporary files from ${TEMP_DIR}`);
    }
  } catch (err) {
    console.warn("Temp cleanup notice:", err);
  }
}
purgeOldTempFiles();

// Helper to reliably locate python utility scripts in dev, packaged electron, or dist environments
function getPythonScriptPath(scriptName: string): string {
  const possiblePaths = [
    path.join(process.cwd(), scriptName),
    process.env.APP_DATA_DIR ? path.join(process.env.APP_DATA_DIR, "..", scriptName) : '',
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, scriptName) : '',
    path.join(__dirname, "..", scriptName),
    path.join(__dirname, scriptName),
    path.join(process.cwd(), "..", scriptName)
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), scriptName);
}

// Set generous server socket timeouts for large 4K / full-length video uploads
httpServer.timeout = 600000;
httpServer.keepAliveTimeout = 120000;
httpServer.headersTimeout = 125000;

// 1. CORS, Cross-Origin Isolation & Preflight headers
app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "credentialless");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ==========================================
// High-Performance Media Streaming Route (HTTP 206 Range Support with Nested Subfolders)
// ==========================================
app.use(["/api/media", "/api/exports"], (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  try {
    const isExport = req.baseUrl.includes("/api/exports") || req.originalUrl.includes("/api/exports");
    let rawRelPath = req.path || "";
    if (rawRelPath.startsWith("/")) rawRelPath = rawRelPath.slice(1);
    
    let decodedRelPath = rawRelPath;
    try {
      decodedRelPath = decodeURIComponent(rawRelPath);
    } catch {
      decodedRelPath = rawRelPath;
    }

    const baseDir = isExport ? EXPORTS_DIR : UPLOADS_DIR;
    let filePath = path.join(baseDir, decodedRelPath);

    if (!fs.existsSync(filePath)) {
      const altDir = isExport ? UPLOADS_DIR : EXPORTS_DIR;
      const altPath = path.join(altDir, decodedRelPath);
      if (fs.existsSync(altPath)) filePath = altPath;
    }

    // Fallback: search by basename in exports subdirectories if not found directly
    if (!fs.existsSync(filePath)) {
      const baseName = path.basename(decodedRelPath);
      const searchDirs = [EXPORTS_DIR, UPLOADS_DIR];
      for (const dir of searchDirs) {
        if (fs.existsSync(dir)) {
          const findInDir = (currentDir: string): string | null => {
            try {
              const entries = fs.readdirSync(currentDir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                  const found = findInDir(fullPath);
                  if (found) return found;
                } else if (entry.name === baseName) {
                  return fullPath;
                }
              }
            } catch {}
            return null;
          };
          const found = findInDir(dir);
          if (found) {
            filePath = found;
            break;
          }
        }
      }
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).send("Media file not found");
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mimeTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".mkv": "video/x-matroska",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".zip": "application/zip"
    };
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "video/mp4";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*"
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err: any) {
    console.error("Media streaming error:", err);
    if (!res.headersSent) {
      res.status(500).send("Error streaming media");
    }
  }
});

// 2. High-Performance Chunked Upload (5MB chunks - 100% immune to Cloudflare 100MB body limits and timeouts)
const CHUNKS_TEMP_DIR = path.join(TEMP_DIR, "chunks");
if (!fs.existsSync(CHUNKS_TEMP_DIR)) {
  fs.mkdirSync(CHUNKS_TEMP_DIR, { recursive: true });
}

app.post("/api/upload-chunk", (req, res) => {
  try {
    const uploadId = (req.query.uploadId as string) || `upload_${Date.now()}`;
    const chunkIndex = parseInt((req.query.chunkIndex as string) || "0", 10);
    const totalChunks = parseInt((req.query.totalChunks as string) || "1", 10);
    const rawFileName = (req.query.fileName as string) || "video.mp4";
    const safeBaseName = decodeURIComponent(rawFileName).replace(/[^a-zA-Z0-9._\-\u1780-\u17FF]/g, "_");

    const uploadSessionDir = path.join(CHUNKS_TEMP_DIR, uploadId);
    if (!fs.existsSync(uploadSessionDir)) {
      fs.mkdirSync(uploadSessionDir, { recursive: true });
    }

    const tempChunkPath = path.join(uploadSessionDir, `chunk_${chunkIndex.toString().padStart(6, "0")}.tmp`);
    const doneChunkPath = path.join(uploadSessionDir, `chunk_${chunkIndex.toString().padStart(6, "0")}.done`);
    
    const writeStream = fs.createWriteStream(tempChunkPath);
    req.pipe(writeStream);

    writeStream.on("finish", () => {
      try {
        if (fs.existsSync(tempChunkPath)) {
          fs.renameSync(tempChunkPath, doneChunkPath);
        }

        const lockFile = path.join(uploadSessionDir, "assembling.lock");
        const completedFile = path.join(uploadSessionDir, "completed.json");

        if (fs.existsSync(completedFile)) {
          try {
            const compData = JSON.parse(fs.readFileSync(completedFile, "utf-8"));
            return res.json(compData);
          } catch {}
        }

        const doneChunks = fs.readdirSync(uploadSessionDir).filter((f) => f.endsWith(".done"));

        if (doneChunks.length >= totalChunks) {
          if (!fs.existsSync(lockFile)) {
            fs.writeFileSync(lockFile, "1");
            const storedFileName = `${Date.now()}_${safeBaseName}`;
            const finalTargetPath = path.join(UPLOADS_DIR, storedFileName);
            const finalStream = fs.createWriteStream(finalTargetPath);

            // Stitch strictly in sequential order using low-memory streaming
            (async () => {
              try {
                for (let idx = 0; idx < totalChunks; idx++) {
                  const partFileName = `chunk_${idx.toString().padStart(6, "0")}.done`;
                  const partPath = path.join(uploadSessionDir, partFileName);
                  if (fs.existsSync(partPath)) {
                    await new Promise<void>((resolve, reject) => {
                      const readStream = fs.createReadStream(partPath);
                      readStream.on('error', reject);
                      readStream.on('end', resolve);
                      readStream.pipe(finalStream, { end: false });
                    });
                  } else {
                    console.warn(`[Chunk Assembly Warning] Missing chunk ${idx} during assembly!`);
                  }
                }
                finalStream.end();
              } catch (stitchErr) {
                console.error("Chunk assembly stream error:", stitchErr);
                finalStream.destroy(stitchErr as Error);
              }
            })();

            finalStream.on("finish", () => {
              const stats = fs.statSync(finalTargetPath);
              const mediaUrl = `/api/media/${storedFileName}`;
              const respData = { success: true, complete: true, url: mediaUrl, fileName: storedFileName, size: stats.size };

              try {
                fs.writeFileSync(completedFile, JSON.stringify(respData));
                const allFiles = fs.readdirSync(uploadSessionDir);
                allFiles.forEach((f) => {
                  try { fs.unlinkSync(path.join(uploadSessionDir, f)); } catch {}
                });
                setTimeout(() => {
                  try { fs.rmSync(uploadSessionDir, { recursive: true, force: true }); } catch {}
                }, 30000);
              } catch {}

              console.log(`[Chunked Upload] Successfully assembled ${storedFileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
              res.json(respData);
            });

            finalStream.on("error", (err) => {
              console.error("Chunk assembly write error:", err);
              res.status(500).json({ error: "Failed to assemble file chunks" });
            });
          } else {
            let waited = 0;
            const checkInterval = setInterval(() => {
              waited += 200;
              if (fs.existsSync(completedFile)) {
                clearInterval(checkInterval);
                try {
                  const compData = JSON.parse(fs.readFileSync(completedFile, "utf-8"));
                  return res.json(compData);
                } catch {
                  return res.json({ success: true, complete: true, chunkIndex });
                }
              }
              if (waited > 25000) {
                clearInterval(checkInterval);
                return res.json({ success: true, complete: true, chunkIndex });
              }
            }, 200);
          }
        } else {
          return res.json({ success: true, complete: false, chunkIndex, receivedChunks: doneChunks.length, totalChunks });
        }
      } catch (err: any) {
        console.error("Error processing chunk completion:", err);
        res.status(500).json({ error: err.message });
      }
    });

    writeStream.on("error", (err) => {
      console.error("Raw upload chunk writeStream error:", err);
      res.status(500).json({ error: "Failed to write file chunk" });
    });

    req.on("error", (err) => {
      console.error("Raw upload chunk req error:", err);
      try { writeStream.close(); fs.unlinkSync(tempChunkPath); } catch {}
    });
  } catch (err: any) {
    console.error("Error in /api/upload-chunk:", err);
    res.status(500).json({ error: err.message });
  }
});

// High-Performance Raw Binary Streaming Upload
app.post("/api/upload-raw", (req, res) => {
  try {
    const rawFileName = (req.query.fileName as string) || (req.headers["x-file-name"] as string) || "video.mp4";
    const safeBaseName = decodeURIComponent(rawFileName).replace(/[^a-zA-Z0-9._\-\u1780-\u17FF]/g, "_");
    const storedFileName = `${Date.now()}_${safeBaseName}`;
    const targetPath = path.join(UPLOADS_DIR, storedFileName);

    const writeStream = fs.createWriteStream(targetPath);
    req.pipe(writeStream);

    writeStream.on("finish", () => {
      try {
        const stats = fs.statSync(targetPath);
        const mediaUrl = `/api/media/${storedFileName}`;
        console.log(`[Upload Raw] Successfully saved ${storedFileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        res.json({ success: true, url: mediaUrl, fileName: storedFileName, size: stats.size });
      } catch (e) {
        res.status(500).json({ error: "Failed to verify uploaded file" });
      }
    });

    writeStream.on("error", (err) => {
      console.error("Raw upload writeStream error:", err);
      res.status(500).json({ error: "Failed to write file" });
    });

    req.on("error", (err) => {
      console.error("Raw upload req error:", err);
      try { writeStream.close(); fs.unlinkSync(targetPath); } catch {}
    });
  } catch (err: any) {
    console.error("Error in /api/upload-raw:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Body Parsers for standard JSON & Form requests
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Permanent Media Upload & Auto-Compress Endpoint
app.post("/api/upload-media", async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType, autoCompress = true } = req.body || {};
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: "Missing fileBase64 or fileName" });
    }
    const safeBaseName = (fileName || "video.mp4").replace(/[^a-zA-Z0-9._\-\u1780-\u17FF]/g, "_");
    const storedFileName = `${Date.now()}_${safeBaseName}`;
    const targetPath = path.join(UPLOADS_DIR, storedFileName);
    fs.writeFileSync(targetPath, Buffer.from(fileBase64, "base64"));
    
    const stats = fs.statSync(targetPath);
    let finalFileName = storedFileName;
    let finalUrl = `/api/media/${storedFileName}`;
    let isCompressed = false;
    let savedPercent = "0%";
    
    // Auto-compress high bitrate / large video files (> 20MB) in background
    if (autoCompress && stats.size > 20 * 1024 * 1024 && /\.(mp4|mov|mkv|webm|avi)$/i.test(fileName)) {
      try {
        console.log(`⚡ [Auto-Compress] Video "${fileName}" is ${(stats.size / 1024 / 1024).toFixed(1)}MB. Auto-compressing with veryfast engine...`);
        const compOutName = `${Date.now()}_${path.basename(safeBaseName, path.extname(safeBaseName))}_opt.mp4`;
        const compOutPath = path.join(UPLOADS_DIR, compOutName);
        const tempConfigPath = path.join(TEMP_DIR, `autocomp_${Date.now()}.json`);
        
        fs.writeFileSync(tempConfigPath, JSON.stringify({
          action: "compress",
          videoPath: targetPath,
          outputPath: compOutPath,
          mode: "smart_hd"
        }));
        
        const pyScript = getPythonScriptPath("video_renderer.py");
        const compProc = spawnSync("python", [pyScript, tempConfigPath], { windowsHide: true, timeout: 60000 });
        try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch {}
        
        if (compProc.status === 0 && fs.existsSync(compOutPath) && fs.statSync(compOutPath).size > 1000) {
          const compStats = fs.statSync(compOutPath);
          const pct = Math.round((1 - compStats.size / stats.size) * 100);
          console.log(`🎉 [Auto-Compress Success] Reduced ${(stats.size / 1024 / 1024).toFixed(1)}MB -> ${(compStats.size / 1024 / 1024).toFixed(1)}MB (-${pct}%)!`);
          finalFileName = compOutName;
          finalUrl = `/api/media/${compOutName}`;
          isCompressed = true;
          savedPercent = `${pct}%`;
        }
      } catch (cErr) {
        console.warn("Auto-compress background notice:", cErr);
      }
    }
    
    res.json({
      success: true,
      url: finalUrl,
      fileUrl: finalUrl,
      fileName: finalFileName,
      size: stats.size,
      isCompressed,
      savedPercent
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to instantiate GoogleGenAI lazily with support for user-supplied Translation API key
function getGenAIClient(customApiKey?: string): GoogleGenAI {
  dotenv.config({ override: true });
  const apiKey = (customApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("មិនទាន់មាន Gemini API Key នៅឡើយទេ។ សូមចុចលើប៊ូតុង 'ដាក់ API Key' ខាងលើដើម្បីបញ្ចូល API Key របស់អ្នក!");
  }
  return new GoogleGenAI({ apiKey });
}

// Helper to instantiate GoogleGenAI with dedicated Voice Clone & Audio Generation API key
function getVoiceGenAIClient(customVoiceApiKey?: string): GoogleGenAI {
  dotenv.config({ override: true });
  const apiKey = (
    customVoiceApiKey ||
    process.env.VOICE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    ""
  ).trim();
  if (!apiKey) {
    throw new Error("មិនទាន់មាន Voice Clone API Key នៅឡើយទេ។ សូមកំណត់ API Key សម្រាប់ Voice Clone!");
  }
  return new GoogleGenAI({ apiKey });
}

function sanitizeGeminiMimeType(mime: string, fileName = ""): string {
  if (!mime || typeof mime !== "string") {
    mime = "";
  }
  const cleanMime = mime.split(";")[0].trim().toLowerCase();
  if (
    cleanMime === "video/mp4" ||
    cleanMime === "video/webm" ||
    cleanMime === "video/mpeg" ||
    cleanMime === "video/mov" ||
    cleanMime === "video/quicktime" ||
    cleanMime === "video/x-matroska" ||
    cleanMime === "video/avi"
  ) {
    return "video/mp4";
  }
  if (cleanMime === "audio/wav" || cleanMime === "audio/x-wav") {
    return "audio/wav";
  }
  if (cleanMime === "audio/mp3" || cleanMime === "audio/mpeg") {
    return "audio/mp3";
  }
  if (cleanMime === "audio/aac" || cleanMime === "audio/m4a" || cleanMime === "audio/mp4") {
    return "audio/aac";
  }
  if (cleanMime === "audio/ogg" || cleanMime === "audio/webm") {
    return "audio/ogg";
  }
  if (cleanMime === "audio/flac") {
    return "audio/flac";
  }
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  if (ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mp3";
  if (ext === "m4a" || ext === "aac") return "audio/aac";
  if (ext === "mov" || ext === "mp4" || ext === "webm" || ext === "mkv" || ext === "avi") return "video/mp4";
  return "audio/wav";
}

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Key live validation test endpoint
app.post("/api/key/validate", async (req, res) => {
  try {
    const customKey = (req.body?.apiKey || "").trim();
    if (!customKey) {
      return res.status(400).json({ valid: false, error: "សូមបញ្ចូល API Key មុននឹងធ្វើតេស្ត!" });
    }

    const ai = new GoogleGenAI({ apiKey: customKey });
    let validatedModel = "Gemini Flash (Latest)";
    let responseText = "";

    const testModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
    let lastErr: any = null;

    for (const m of testModels) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: "Reply with 'OK'",
        });
        if (response && response.text) {
          responseText = response.text;
          validatedModel = m === "gemini-3.6-flash" ? "Gemini 3.6 Flash" : m;
          break;
        }
      } catch (e: any) {
        lastErr = e;
      }
    }

    if (responseText) {
      return res.json({ valid: true, model: validatedModel });
    }

    throw lastErr || new Error("Gemini API មិនបានឆ្លើយតបមកវិញឡើយ");
  } catch (err: any) {
    const msg = err?.message || "";
    let friendlyError = msg;
    if (msg.includes("429") || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
      friendlyError = "API Key បានលើសកម្រិត Free Quota របស់ Google AI Studio! សូមប្តូរ API Key ថ្មី ឬរង់ចាំបន្តិច។";
    } else if (msg.includes("API key not valid") || msg.includes("API_KEY_INVALID") || msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      friendlyError = "API Key មិនត្រឹមត្រូវ ឬត្រូវបានបិទ (Invalid API Key)។ សូមពិនិត្យមើល API Key ឡើងវិញ (ត្រូវប្រាកដថាបានបង្កើតពី aistudio.google.com)!";
    }
    return res.status(400).json({ valid: false, error: friendlyError });
  }
});

// In-memory buffer cache for ultra-fast zero-latency TTS serving
const ttsMemoryCache = new Map<string, Buffer>();

// Microsoft Edge Neural Khmer Voice synthesis (Piseth & Sreymom) with dynamic pace & pitch
async function fetchEdgeTTS(
  text: string,
  voiceName: string = 'km-KH-PisethNeural',
  rate: string = '+20%',
  pitch: string = '+0Hz'
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text, { rate, pitch });
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    audioStream.on('data', (c: Buffer) => chunks.push(c));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', (err: any) => reject(err));
  });
}

async function fetchGoogleTTSChunk(textChunk: string): Promise<Buffer> {
  const clients = ['tw-ob', 'gtx', 'dict-chrome-ex'];
  let lastErr: any = null;

  for (const client of clients) {
    try {
      const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=km&client=${client}&q=${encodeURIComponent(textChunk)}`;
      const fetchResponse = await fetch(googleTtsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/",
          "Accept": "*/*"
        },
      });

      if (fetchResponse.ok) {
        const audioArrayBuffer = await fetchResponse.arrayBuffer();
        return Buffer.from(audioArrayBuffer);
      }
      lastErr = new Error(`TTS client ${client} returned status ${fetchResponse.status}`);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('All TTS clients failed');
}

function splitTextIntoTTSChunks(text: string, maxLen: number = 85): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  // Split on Khmer & standard punctuation, spaces, or clause breaks
  const tokens = text.split(/([,;!?។៕\s]+)/);
  const chunks: string[] = [];
  let cur = "";

  for (const token of tokens) {
    if (!token) continue;
    if ((cur + token).length > maxLen) {
      if (cur.trim()) chunks.push(cur.trim());
      if (token.length > maxLen) {
        for (let i = 0; i < token.length; i += maxLen) {
          const sub = token.slice(i, i + maxLen).trim();
          if (sub) chunks.push(sub);
        }
        cur = "";
      } else {
        cur = token;
      }
    } else {
      cur += token;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(c => c.length > 0);
}

function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitDepth = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + 36, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // Linear PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);

  // data subchunk
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function generateGeminiTtsAudio(text: string, voiceName: string = 'Puck', clientVoiceApiKey?: string): Promise<Buffer> {
  const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'];
  const matchedVoice = validVoices.find(v => v.toLowerCase() === voiceName.toLowerCase()) || 'Puck';

  let lastErr: any = null;
  const candidateKeys = Array.from(new Set([
    clientVoiceApiKey,
    process.env.VOICE_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.API_KEY
  ].filter(Boolean) as string[]));

  for (const k of candidateKeys) {
    try {
      const freshAi = new GoogleGenAI({ apiKey: k });
      const response = await freshAi.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: matchedVoice
              }
            }
          }
        }
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.data);
      if (audioPart) {
        const rawPcm = Buffer.from(audioPart.inlineData.data, 'base64');
        return pcmToWavBuffer(rawPcm, 24000, 1, 16);
      }
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Gemini Native TTS failed across all keys.');
}

async function fetchKiriTTS(
  text: string,
  voiceName: string = 'Chanda',
  apiKey?: string
): Promise<Buffer> {
  const key = (
    apiKey ||
    process.env.KIRITTS_API_KEY ||
    ''
  ).trim();

  if (!key) {
    throw new Error('KiriTTS API Key មិនទាន់ត្រូវបានកំណត់ទេ។ សូមបញ្ចូល API Key ក្នុង .env ឬក្នុង Settings!');
  }

  const cleanVoice = voiceName.replace(/^kiri_/i, '');
  const baseUrl = process.env.KIRITTS_API_URL || 'https://api.kiritts.com/v1';

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: cleanVoice,
      response_format: 'mp3'
    })
  });

  if (!response.ok) {
    let errDetail = '';
    try {
      const errJson = await response.json();
      errDetail = errJson.detail || errJson.error || JSON.stringify(errJson);
    } catch {
      errDetail = await response.text();
    }
    throw new Error(`KiriTTS API Error (${response.status}): ${errDetail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function cleanKhmerSpeechForTTS(text: string): string {
  if (!text) return '';
  let cleaned = String(text)
    // Strip foreign annotations like Orig: "..."
    .replace(/Orig\s*:\s*["'].*?["']/gi, '')
    // Strip bracketed annotations like (Note: ...), [Sound: ...]
    .replace(/\(.*?\)|\[.*?\]/g, '')
    // Strip leading speaker label prefixes like "តួប្រុស:", "តួស្រី:", "អ្នកសម្រាយ:"
    .replace(/^(តួប្រុស|តួស្រី|អ្នកសម្រាយ|អ្នកសម្រាយរឿង|តាចាស់|យាយចាស់|កុមារ|កូនក្មេង|មេក្រុម|មេបញ្ជាការ|Marcus|Elena|[^\s:៖]{2,15})\s*[:៖-]\s*/gi, '')
    .replace(/\bMarcus\b/gi, 'ម៉ាកុស')
    .replace(/\bElena\b/gi, 'អេលេណា')
    .replace(/\bSWAT\b/gi, 'ស្វាត')
    .replace(/\bCyber\b/gi, 'សាយប័រ')
    .replace(/\bVault\b/gi, 'វ៉ូល')
    .replace(/\bPolice\b/gi, 'ប៉ូលីស')
    .replace(/\bHeist\b/gi, 'ហាយស៍')
    .replace(/\bFlash\b/gi, 'ហ្វ្លាស')
    .replace(/\bLaser\b/gi, 'ឡាស៊ែរ')
    .replace(/\bHackers?\b/gi, 'ហេកឃ័រ')
    .replace(/\bTeam\b/gi, 'ក្រុម')
    .replace(/\bMonaco\b/gi, 'ម៉ូណាកូ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[a-zA-Z\u4e00-\u9fa5]+/g, ' ')
    .replace(/[^\u1780-\u17FF0-9\s.,!?«»""''()\-—៖។ៗ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

export function calculateTtsSpeedRate(speed: number | undefined): string {
  const numSpeed = typeof speed === 'number' && !isNaN(speed) ? speed : 1.25;
  if (numSpeed >= 1.50) return '+50%';
  if (numSpeed >= 1.45) return '+45%';
  if (numSpeed >= 1.35) return '+40%';
  if (numSpeed >= 1.30) return '+36%';
  if (numSpeed >= 1.25) return '+32%';
  if (numSpeed >= 1.20) return '+28%';
  if (numSpeed >= 1.10) return '+22%';
  if (numSpeed <= 0.95) return '+12%';
  return '+32%'; // Standard rapid movie recap pace
}

async function generateSingleTTSBuffer(options: {
  cleanText: string;
  voiceTarget: string;
  requestedEmotion?: string;
  requestedRate?: string;
  requestedPitch?: string;
  kiriApiKey?: string;
  voiceApiKey?: string;
  colabUrlOverride?: string;
  bypassCache?: boolean;
}): Promise<{ audioBuffer: Buffer; cacheKey: string; edgeVoice: string }> {
  const { cleanText, voiceTarget } = options;
  const requestedVoice = (voiceTarget || '').toLowerCase();
  const requestedGender = (voiceTarget || '').toLowerCase();
  let requestedRate = options.requestedRate || '+20%';
  let requestedPitch = options.requestedPitch || '+0Hz';
  let morphAlpha = '1.0';
  let isGeminiNative = false;
  let geminiVoiceName = 'Puck';
  let isKiriNative = false;
  let kiriVoiceName = 'Chanda';
  let isVoxCPM = false;
  let voxcpmColabUrl = '';
  let voxcpmPresetId = '';
  let voxcpmAudioBase64 = '';
  let voxcpmGender = 'male';
  let voxcpmSpeedRate = 1.0;
  let voxcpmSampleText = '';

  // Check if direct Microsoft Edge-TTS is requested (Piseth & Sreymom)
  const isDirectEdge = 
    requestedVoice.startsWith('edge_') || 
    voiceTarget.startsWith('edge_') || 
    requestedVoice === 'auto_default' || 
    voiceTarget === 'auto_default' || 
    requestedVoice === 'default' || 
    voiceTarget === 'default' ||
    requestedVoice === 'piseth' ||
    requestedVoice === 'sreymom';

  if (!isDirectEdge) {
    if (requestedVoice.startsWith('kiri_') || voiceTarget.startsWith('kiri_')) {
      isKiriNative = true;
      kiriVoiceName = (requestedVoice.startsWith('kiri_') ? requestedVoice : voiceTarget).replace(/^kiri_/i, '');
    } else if (requestedVoice.startsWith('gemini_') || voiceTarget.startsWith('gemini_')) {
      isGeminiNative = true;
      geminiVoiceName = (requestedVoice.startsWith('gemini_') ? requestedVoice : voiceTarget).replace('gemini_', '');
    }
  }

  let edgeVoice = 'km-KH-PisethNeural';
  if (
    requestedVoice.includes('sreymom') ||
    requestedVoice.includes('female') ||
    requestedGender.includes('female') ||
    requestedGender.includes('sreymom') ||
    requestedGender === 'child_girl' ||
    requestedVoice === 'child_girl' ||
    requestedGender === 'child' ||
    requestedVoice === 'km-kh-sreymomneural'
  ) {
    edgeVoice = 'km-KH-SreymomNeural';
  } else {
    edgeVoice = 'km-KH-PisethNeural';
  }

  // Handle specific pitch offsets for edge roles
  if (requestedVoice.includes('child') || requestedGender.includes('child')) {
    requestedPitch = '+35Hz';
    requestedRate = '+22%';
  } else if (requestedVoice.includes('elder') || requestedGender.includes('elder')) {
    requestedPitch = '-15Hz';
    requestedRate = '-8%';
  } else if (requestedVoice.includes('villain') || requestedGender.includes('villain')) {
    requestedPitch = '-20Hz';
  }

  let clonedTargetSamplePath: string | null = null;
  const allCloned = getAllClonedVoicesFromDb();

  let targetClonedProfile = (!isDirectEdge && voiceTarget && voiceTarget.startsWith('voice_')) 
    ? getClonedVoiceByIdFromDb(voiceTarget)
    : null;

  // Auto-resolve to saved Cloned/VoxCPM2 profiles if generic male/female/narrator is requested AND not direct edge
  if (!isDirectEdge && !targetClonedProfile && allCloned.length > 0 && voiceTarget !== 'auto_default' && voiceTarget !== 'default') {
    if (requestedVoice.includes('female') || requestedGender.includes('female') || voiceTarget === 'female') {
      targetClonedProfile = allCloned.find((v: any) => v.gender === 'female') || allCloned[allCloned.length - 1];
    } else {
      targetClonedProfile = allCloned.find((v: any) => v.gender === 'male') || allCloned[0];
    }
  }

  if (targetClonedProfile) {
    const cloned = targetClonedProfile;
    if (cloned.provider === 'kiri' || cloned.kiriVoiceId || (cloned.baseVoice && cloned.baseVoice.startsWith('kiri_'))) {
      isKiriNative = true;
      kiriVoiceName = cloned.kiriVoiceId || (cloned.baseVoice ? cloned.baseVoice.replace(/^kiri_/i, '') : 'Chanda');
    } else if (cloned.provider === 'voxcpm2' || cloned.colabUrl || options.colabUrlOverride || process.env.VOXCPM2_API_URL) {
      isVoxCPM = true;
      voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || cloned.colabUrl || process.env.COLAB_VOICE_URL || '').trim();
      voxcpmPresetId = (cloned.sampleAudioUrl || '').startsWith('preset:') 
        ? cloned.sampleAudioUrl.replace(/^preset:/, '')
        : (cloned.audioBase64?.startsWith('preset:') ? cloned.audioBase64.replace(/^preset:/, '') : '');
      if (!voxcpmPresetId) {
        voxcpmPresetId = cloned.gender === 'female' ? 'female_sweet' : 'male_hero';
      }
      voxcpmAudioBase64 = (cloned.audioBase64 && !cloned.audioBase64.startsWith('preset:')) ? cloned.audioBase64 : '';
      voxcpmGender = cloned.gender || (edgeVoice.includes('Sreymom') ? 'female' : 'male');
      voxcpmSpeedRate = cloned.speedRate || 1.0;
      voxcpmSampleText = (cloned as any).sampleText || '';
      if (!voxcpmAudioBase64 && cloned.sampleFileName) {
        const sPath = path.join(CLONED_VOICES_DIR, cloned.sampleFileName);
        if (fs.existsSync(sPath)) {
          voxcpmAudioBase64 = fs.readFileSync(sPath).toString('base64');
        }
      }
    }
    edgeVoice = cloned.baseVoice || (cloned.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural');
    const offset = cloned.pitchOffset ?? 0;
    requestedPitch = offset >= 0 ? `+${offset}Hz` : `${offset}Hz`;
    if (cloned.speedRate && cloned.speedRate !== 1.0) {
      const ratePercent = Math.round((cloned.speedRate - 1.0) * 100);
      requestedRate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    }
    if (cloned.isPureClone === false) {
      morphAlpha = '0.85';
    } else {
      morphAlpha = '1.0';
    }
    if (cloned.sampleFileName) {
      const sPath = path.join(CLONED_VOICES_DIR, cloned.sampleFileName);
      if (fs.existsSync(sPath)) {
        clonedTargetSamplePath = sPath;
      }
    }
  } else if (voiceTarget === 'child_boy' || requestedGender === 'child_boy') {
    edgeVoice = 'km-KH-PisethNeural';
    requestedPitch = '+32Hz';
    requestedRate = '+22%';
    voxcpmPresetId = 'kid_boy';
    voxcpmGender = 'male';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  } else if (voiceTarget === 'child_girl' || requestedGender === 'child_girl' || voiceTarget === 'child' || requestedGender === 'child') {
    edgeVoice = 'km-KH-SreymomNeural';
    requestedPitch = '+38Hz';
    requestedRate = '+20%';
    voxcpmPresetId = 'kid_girl';
    voxcpmGender = 'female';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  } else if (voiceTarget === 'male_elder' || requestedGender === 'male_elder') {
    edgeVoice = 'km-KH-PisethNeural';
    requestedPitch = '-18Hz';
    requestedRate = '-10%';
    voxcpmPresetId = 'elder_male';
    voxcpmGender = 'male';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  } else if (voiceTarget === 'female_elder' || requestedGender === 'female_elder') {
    edgeVoice = 'km-KH-SreymomNeural';
    requestedPitch = '-12Hz';
    requestedRate = '-8%';
    voxcpmPresetId = 'elder_female';
    voxcpmGender = 'female';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  } else if (voiceTarget === 'villain' || requestedGender === 'villain') {
    edgeVoice = 'km-KH-PisethNeural';
    requestedPitch = '-22Hz';
    requestedRate = '-5%';
    voxcpmPresetId = 'villain';
    voxcpmGender = 'male';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  } else if (voiceTarget === 'news_host' || requestedGender === 'news_host') {
    edgeVoice = 'km-KH-PisethNeural';
    requestedPitch = '+0Hz';
    requestedRate = '+15%';
    voxcpmPresetId = 'news_host';
    voxcpmGender = 'male';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  } else if (voiceTarget === 'female_lively') {
    edgeVoice = 'km-KH-SreymomNeural';
    requestedPitch = '+10Hz';
    requestedRate = '+25%';
    voxcpmPresetId = 'female_lively';
    voxcpmGender = 'female';
    isVoxCPM = Boolean(options.colabUrlOverride || process.env.VOXCPM2_API_URL);
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
  }

  // Auto-enable VoxCPM2 engine if a live Colab/Kaggle URL is provided in request or env (and not direct edge)
  if (!isDirectEdge && !isVoxCPM && !isKiriNative && !isGeminiNative && (options.colabUrlOverride || process.env.VOXCPM2_API_URL)) {
    const isFem = (requestedVoice.includes('female') || requestedGender.includes('female') || voiceTarget === 'female');
    isVoxCPM = true;
    voxcpmColabUrl = (options.colabUrlOverride || process.env.VOXCPM2_API_URL || '').trim();
    if (!voxcpmPresetId) {
      voxcpmPresetId = isFem ? 'female_sweet' : 'male_hero';
    }
    voxcpmGender = isFem ? 'female' : 'male';
  }

  const requestedEmotion = 'neutral';

  const effectiveGenderForCache = targetClonedProfile ? `${targetClonedProfile.id}_${targetClonedProfile.provider || 'voxcpm2'}` : voiceTarget.toLowerCase();
  const cacheKey = `${effectiveGenderForCache}_${requestedEmotion}_${cleanText}`;

  // Check RAM and DB cache (skip if bypassCache is true)
  if (!options.bypassCache) {
    if (ttsMemoryCache.has(cacheKey)) {
      return { audioBuffer: ttsMemoryCache.get(cacheKey)!, cacheKey, edgeVoice };
    }
    const dbCachedBase64 = getCachedTTSFromDb(cacheKey);
    if (dbCachedBase64) {
      const cachedBuffer = Buffer.from(dbCachedBase64, 'base64');
      ttsMemoryCache.set(cacheKey, cachedBuffer);
      return { audioBuffer: cachedBuffer, cacheKey, edgeVoice };
    }
  }

  let audioBuffer: Buffer;
  if (isVoxCPM && voxcpmColabUrl) {
    try {
      audioBuffer = await fetchColabVoxCPM({
        text: cleanText,
        audioBase64: voxcpmAudioBase64,
        presetId: voxcpmPresetId,
        gender: voxcpmGender,
        baseVoice: edgeVoice,
        speedRate: voxcpmSpeedRate,
        colabUrl: voxcpmColabUrl,
        apiKey: process.env.VOXCPM2_API_KEY,
        model: 'voxcpm2',
        sampleText: voxcpmSampleText
      });
    } catch (voxErr: any) {
      console.warn("[VoxCPM2 TTS Failed]:", voxErr.message);
      // Generate standard fallback but DO NOT cache it under VoxCPM cloned key
      const fallbackBuf = await fetchEdgeTTS(cleanText, edgeVoice, requestedRate, requestedPitch);
      return { audioBuffer: fallbackBuf, cacheKey: `fallback_${cacheKey}`, edgeVoice };
    }
  } else if (isKiriNative) {
    try {
      const clientKiriApiKey = (options.kiriApiKey || process.env.KIRITTS_API_KEY || '').trim();
      audioBuffer = await fetchKiriTTS(cleanText, kiriVoiceName, clientKiriApiKey);
    } catch (kiriErr: any) {
      audioBuffer = await fetchEdgeTTS(cleanText, edgeVoice, requestedRate, requestedPitch);
    }
  } else if (isGeminiNative) {
    try {
      const clientVoiceApiKey = (options.voiceApiKey || process.env.GEMINI_API_KEY || '').trim();
      audioBuffer = await generateGeminiTtsAudio(cleanText, geminiVoiceName, clientVoiceApiKey);
    } catch (geminiTtsErr) {
      audioBuffer = await fetchEdgeTTS(cleanText, edgeVoice, requestedRate, requestedPitch);
    }
  } else {
    try {
      audioBuffer = await fetchEdgeTTS(cleanText, edgeVoice, requestedRate, requestedPitch);
    } catch (edgeErr) {
      const chunks = splitTextIntoTTSChunks(cleanText, 120);
      const chunkPromises = chunks.map(chunk => fetchGoogleTTSChunk(chunk));
      const audioChunks = await Promise.all(chunkPromises);
      audioBuffer = Buffer.concat(audioChunks);
    }
  }

  // Save to Cache
  if (ttsMemoryCache.size > 2000) {
    const firstKey = ttsMemoryCache.keys().next().value;
    if (firstKey) ttsMemoryCache.delete(firstKey);
  }
  ttsMemoryCache.set(cacheKey, audioBuffer);
  setCachedTTSToDb(cacheKey, cleanText, edgeVoice, requestedRate, requestedPitch, audioBuffer.toString('base64'));

  return { audioBuffer, cacheKey, edgeVoice };
}

app.get("/api/tts", async (req, res) => {
  try {
    const rawText = (req.query.text as string) || "";
    if (!rawText.trim()) {
      return res.status(400).send("Text is required");
    }

    const cleanText = cleanKhmerSpeechForTTS(rawText);

    const voiceTarget = (req.query.voice as string) || (req.query.gender as string) || '';
    const requestedEmotion = (req.query.emotion as string) || '';
    const requestedRate = (req.query.rate as string) || '+20%';
    const requestedPitch = (req.query.pitch as string) || '+0Hz';
    const kiriApiKey = ((req.headers['x-kiritts-api-key'] as string) || (req.query.kiriApiKey as string) || '').trim();
    const voiceApiKey = ((req.headers['x-voice-api-key'] as string) || (req.query.voiceApiKey as string) || (req.headers['x-gemini-api-key'] as string) || (req.query.apiKey as string) || '').trim();
    const colabUrl = ((req.headers['x-colab-url'] as string) || (req.query.colabUrl as string) || '').trim();
    const bypassCache = req.query.forceRefresh === 'true' || req.query.bypassCache === 'true' || req.headers['x-force-refresh'] === 'true';

    console.log(`🎙️ [TTS Request] Voice: "${voiceTarget}", ColabUrl: "${colabUrl || 'None (Using EdgeTTS)'}", ForceRefresh: ${bypassCache} | Text: "${cleanText.substring(0, 35)}..."`);

    const { audioBuffer } = await generateSingleTTSBuffer({
      cleanText,
      voiceTarget,
      requestedEmotion,
      requestedRate,
      requestedPitch,
      kiriApiKey,
      voiceApiKey,
      colabUrlOverride: colabUrl,
      bypassCache
    });

    // Determine cache-control: no-store when forceRefresh so browser never serves stale audio
    const cacheControlHeader = bypassCache ? 'no-store, no-cache, must-revalidate' : 'public, max-age=300';

    // Support HTTP 206 Partial Content byte ranges for Chrome/Safari media elements
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : audioBuffer.length - 1;

      if (start >= audioBuffer.length || end >= audioBuffer.length || start > end) {
        res.status(416).set({
          "Content-Range": `bytes */${audioBuffer.length}`,
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Access-Control-Allow-Origin": "*"
        }).end();
        return;
      }

      const chunk = audioBuffer.subarray(start, end + 1);
      res.status(206).set({
        "Content-Range": `bytes ${start}-${end}/${audioBuffer.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunk.length.toString(),
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": cacheControlHeader,
      }).send(chunk);
      return;
    }

    res.status(200).set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": cacheControlHeader,
    }).send(audioBuffer);
  } catch (err: any) {
    console.error("TTS Endpoint Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate TTS audio" });
  }
});

app.post("/api/tts/clear-cache", (req, res) => {
  try {
    ttsMemoryCache.clear();
    clearAllTTSCacheFromDb();
    console.log("[TTS Cache] Cleared all memory and SQLite DB audio caches.");
    res.json({ success: true, message: "Cleared all TTS cache successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1-Click All-at-once Batch Pre-generation Endpoint for Full Transcript Narration
app.post("/api/tts/batch-pregenerate", async (req, res) => {
  try {
    const { segments = [], ttsSpeed = 1.25, voiceRolesMapping = {}, colabUrl = '', globalVoicePersona = 'auto', forceRefresh = false } = req.body || {};
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: "No segments provided for batch generation" });
    }

    if (forceRefresh) {
      ttsMemoryCache.clear();
      clearAllTTSCacheFromDb();
      console.log("[Batch TTS] Force refresh requested - cleared memory and SQLite TTS cache.");
    }

    let edgeRate = '+25%';
    if (ttsSpeed >= 1.45) edgeRate = '+45%';
    else if (ttsSpeed >= 1.30) edgeRate = '+36%';
    else if (ttsSpeed >= 1.20) edgeRate = '+30%';
    else if (ttsSpeed >= 1.10) edgeRate = '+25%';
    else if (ttsSpeed <= 0.95) edgeRate = '+12%';

    console.log(`[Batch TTS] Starting batch pre-generation for ${segments.length} transcript segments (forceRefresh: ${forceRefresh})...`);
    let generatedCount = 0;
    let cachedCount = 0;

    const allCloned = getAllClonedVoicesFromDb();
    const clonedMale = allCloned.find((v: any) => v.gender === 'male')?.id || allCloned[0]?.id;
    const clonedFemale = allCloned.find((v: any) => v.gender === 'female')?.id || (allCloned.length > 1 ? allCloned[allCloned.length - 1]?.id : clonedMale);

    const effectiveMale = (voiceRolesMapping.male && (voiceRolesMapping.male.startsWith('voice_') || voiceRolesMapping.male.startsWith('kiri_') || voiceRolesMapping.male.startsWith('gemini_'))) 
      ? voiceRolesMapping.male 
      : (clonedMale || 'male');

    const effectiveFemale = (voiceRolesMapping.female && (voiceRolesMapping.female.startsWith('voice_') || voiceRolesMapping.female.startsWith('kiri_') || voiceRolesMapping.female.startsWith('gemini_'))) 
      ? voiceRolesMapping.female 
      : (clonedFemale || 'female');

    const effectiveNarrator = (voiceRolesMapping.narrator && (voiceRolesMapping.narrator.startsWith('voice_') || voiceRolesMapping.narrator.startsWith('kiri_') || voiceRolesMapping.narrator.startsWith('gemini_'))) 
      ? voiceRolesMapping.narrator 
      : (effectiveMale || effectiveFemale || 'narrator');

    // Process all segments sequentially to safely stream without overwhelming Colab GPU
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const rawText = (seg.khmer_script || '').trim();
      if (!rawText) continue;

      const cleanText = rawText
        .replace(/[\r\n]+/g, " ")
        .replace(/[^\u1780-\u17FFa-zA-Z0-9\s.,!?«»""''()\-—៖។ៗ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanText) continue;

      let targetVoice = seg.speaker_gender || 'female';
      const g = (targetVoice || '').toLowerCase();
      if (globalVoicePersona === 'auto_default' || globalVoicePersona === 'default') {
        targetVoice = (g === 'male' || g === 'male_elder' || g === 'villain' || g === 'narrator') ? 'edge_piseth' : 'edge_sreymom';
      } else if (globalVoicePersona && globalVoicePersona !== 'auto' && globalVoicePersona !== 'auto_cloned') {
        targetVoice = globalVoicePersona;
      } else if (g === 'male' || g === 'male_elder' || g === 'villain') {
        targetVoice = effectiveMale;
      } else if (g === 'female' || g === 'female_elder') {
        targetVoice = effectiveFemale;
      } else if (g === 'narrator') {
        targetVoice = effectiveNarrator;
      }

      const emo = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
      const targetCloned = allCloned.find((v: any) => v.id === targetVoice);
      const cacheVoiceId = targetCloned ? `${targetCloned.id}_${targetCloned.provider || 'voxcpm2'}` : targetVoice.toLowerCase();
      const cacheKey = `${cacheVoiceId}_${emo}_${cleanText}`;

      if (!forceRefresh && (ttsMemoryCache.has(cacheKey) || getCachedTTSFromDb(cacheKey))) {
        cachedCount++;
        continue;
      }

      try {
        await generateSingleTTSBuffer({
          cleanText,
          voiceTarget: targetVoice,
          requestedEmotion: emo,
          requestedRate: edgeRate,
          colabUrlOverride: colabUrl,
          bypassCache: forceRefresh
        });
        generatedCount++;
      } catch (segErr) {
        console.warn(`[Batch TTS Segment ${seg.segment_id} Notice]:`, segErr);
      }
    }

    console.log(`[Batch TTS] Pre-generation finished: ${generatedCount} newly generated, ${cachedCount} already in cache.`);
    res.json({
      success: true,
      totalSegments: segments.length,
      generatedCount,
      cachedCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================


function streamStaticMediaFile(filePath: string, req: express.Request, res: express.Response) {
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Media file not found");
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).send("Path is a directory");
    }

    const fileSize = stat.size;
    const range = req.headers.range;

    // Detect MIME type
    const ext = path.extname(filePath).toLowerCase();
    let contentType = "video/mp4";
    if (ext === ".wav") contentType = "audio/wav";
    else if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".m4a" || ext === ".aac") contentType = "audio/mp4";
    else if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".srt") contentType = "text/plain; charset=utf-8";
    else if (ext === ".zip") contentType = "application/zip";
    else if (ext === ".json") contentType = "application/json";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set({
          "Content-Range": `bytes */${fileSize}`,
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Access-Control-Allow-Origin": "*",
        }).end();
        return;
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err: any) {
    console.error("Error streaming static media:", err);
    res.status(500).send("Error streaming media");
  }
}



// Serve /api/media/* with HTTP Range Streaming
app.use("/api/media", (req, res) => {
  const relPath = decodeURIComponent(req.path.replace(/^\//, ''));
  const filePath = path.join(UPLOADS_DIR, relPath);
  streamStaticMediaFile(filePath, req, res);
});

// Serve /api/exports/* with HTTP Range Streaming (supports both root exports and series subfolders)
app.use("/api/exports", (req, res) => {
  const relPath = decodeURIComponent(req.path.replace(/^\//, ''));
  const filePath = path.join(EXPORTS_DIR, relPath);
  streamStaticMediaFile(filePath, req, res);
});

// ==========================================
// SQLite Database REST APIs
// ==========================================

// 1. Recaps
app.get("/api/db/recaps", (req, res) => {
  try {
    const list = getAllRecapsFromDb();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/db/recaps", (req, res) => {
  try {
    const recap = req.body;
    if (!recap) return res.status(400).json({ error: "Missing recap payload" });
    const saved = saveRecapToDb(recap);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/db/recaps/:id", (req, res) => {
  try {
    const recap = getRecapByIdFromDb(req.params.id);
    if (!recap) return res.status(404).json({ error: "Recap not found" });
    res.json(recap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/db/recaps/:id", (req, res) => {
  try {
    deleteRecapFromDb(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Multi-Episode Series Projects & Sequences
app.get("/api/db/series", (req, res) => {
  try {
    const list = getAllSeriesProjectsFromDb();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/db/series", (req, res) => {
  try {
    const project = req.body;
    if (!project) return res.status(400).json({ error: "Missing series payload" });
    const saved = saveSeriesProjectToDb(project);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/db/series/:id", (req, res) => {
  try {
    const project = getSeriesProjectByIdFromDb(req.params.id);
    if (!project) return res.status(404).json({ error: "Series project not found" });
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/db/series/:id", (req, res) => {
  try {
    deleteSeriesProjectFromDb(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Folders for Organizing Recaps & Series
app.get("/api/db/folders", (req, res) => {
  try {
    const list = getAllFoldersFromDb();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/db/folders", (req, res) => {
  try {
    const folder = req.body;
    if (!folder || !folder.name) return res.status(400).json({ error: "Missing folder name" });
    const saved = saveFolderToDb(folder);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/db/folders/:id", (req, res) => {
  try {
    deleteFolderFromDb(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/db/recaps/:id/folder", (req, res) => {
  try {
    const { folderName, folderId } = req.body || {};
    assignRecapFolderInDb(req.params.id, folderName || '', folderId || '');
    res.json({ success: true, id: req.params.id, folderName, folderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3.5. AI Voice Cloning & Vocal Profile Engine
// ==========================================
const CLONED_VOICES_DIR = path.join(process.cwd(), 'data', 'cloned_voices');
if (!fs.existsSync(CLONED_VOICES_DIR)) {
  fs.mkdirSync(CLONED_VOICES_DIR, { recursive: true });
}

app.get("/api/cloned-voices", (req, res) => {
  try {
    const list = getAllClonedVoicesFromDb();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cloned-voices/analyze", async (req, res) => {
  try {
    const { audioBase64 } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: "Missing audioBase64 data" });

    const tempDir = TEMP_DIR;
    const tempFile = path.join(tempDir, `voice_sample_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.wav`);
    fs.writeFileSync(tempFile, Buffer.from(audioBase64, 'base64'));

    const pyScript = getPythonScriptPath('voice_cloner.py');
    const child = spawn('python', [pyScript, 'analyze', tempFile], { windowsHide: true });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk.toString());
    child.stderr.on('data', chunk => stderr += chunk.toString());

    child.on('close', (code) => {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      if (code === 0) {
        try {
          const analysis = JSON.parse(stdout);
          res.json(analysis);
        } catch {
          res.json({ success: true, meanF0: 135, inferredGender: 'male', baseVoice: 'km-KH-PisethNeural', pitchOffset: 0, formantShift: 1.0 });
        }
      } else {
        console.error('Voice cloner analysis error:', stderr);
        res.json({ success: true, meanF0: 140, inferredGender: 'male', baseVoice: 'km-KH-PisethNeural', pitchOffset: 0, formantShift: 1.0 });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cloned-voices/sample/:filename", (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(CLONED_VOICES_DIR, filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("Sample audio not found");
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cloned-voices/test-synthesis", async (req, res) => {
  try {
    const { text, baseVoice, pitchOffset, speedRate, audioBase64, provider, kiriVoiceId, noFallback } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const cleanText = text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^\u1780-\u17FFa-zA-Z0-9\s.,!?្៌៍៏័៎ិីឹឺុូួើឿៀេែៃោៅំះៈ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    let audioBuffer: Buffer;
    
    let sampleB64 = audioBase64 || '';
    let vProfile: any = null;
    if (!sampleB64 && req.body.voiceId) {
      vProfile = getClonedVoiceByIdFromDb(req.body.voiceId);
      if (vProfile?.sampleFileName) {
        const sPath = path.join(CLONED_VOICES_DIR, vProfile.sampleFileName);
        if (fs.existsSync(sPath)) {
          sampleB64 = fs.readFileSync(sPath).toString('base64');
        }
      }
    } else if (!sampleB64 && req.body.sampleFileName) {
      const sPath = path.join(CLONED_VOICES_DIR, req.body.sampleFileName);
      if (fs.existsSync(sPath)) {
        sampleB64 = fs.readFileSync(sPath).toString('base64');
      }
    }

    if (provider === 'kiri' || (baseVoice && baseVoice.startsWith('kiri_')) || kiriVoiceId) {
      const vName = (kiriVoiceId || baseVoice || 'Chanda').replace(/^kiri_/i, '');
      const clientKiriKey = ((req.headers['x-kiritts-api-key'] as string) || (req.body.kiriApiKey as string) || '').trim();
      audioBuffer = await fetchKiriTTS(cleanText, vName, clientKiriKey);
    } else if (provider === 'voxcpm2' || provider === 'colab' || req.body.colabUrl) {
      const colabUrl = req.body.colabUrl || process.env.VOXCPM2_API_URL;
      const colabKey = req.body.apiKey || process.env.VOXCPM2_API_KEY;
      const reqPreset = req.body.presetId || req.body.preset_id || '';
      const reqGender = req.body.gender || '';
      const vName = req.body.voiceName || '';
      
      const effectivePreset = reqPreset || (reqGender === 'female' || vName.includes('ស្រី') || vName.toLowerCase().includes('female') ? 'female_sweet' : 'male_hero');
      const effectiveGender = reqGender || (effectivePreset.includes('female') || effectivePreset.includes('girl') ? 'female' : 'male');

      console.log(`[Test Synthesis] Forwarding to Colab: Preset='${effectivePreset}', Gender='${effectiveGender}', URL='${colabUrl || 'env'}', CustomAudio=${Boolean(sampleB64)}`);
      
      try {
        audioBuffer = await fetchColabVoxCPM({
          text: cleanText, 
          audioBase64: sampleB64, 
          colabUrl: colabUrl, 
          apiKey: colabKey, 
          baseVoice: baseVoice, 
          speedRate: speedRate, 
          model: req.body.model, 
          presetId: effectivePreset,
          gender: effectiveGender,
          sampleText: (vProfile as any)?.sampleText || ''
        });
      } catch (colabErr: any) {
        console.warn(`[Test Synthesis] Colab error:`, colabErr.message);
        return res.status(500).json({ error: `Colab Synthesis Failed: ${colabErr.message}` });
      }
    } else {
      const voice = (baseVoice && (baseVoice.includes('Sreymom') || baseVoice.includes('female') || baseVoice === 'gemini_aoede')) ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
      const po = pitchOffset ?? 0;
      const pitchStr = po >= 0 ? `+${po}Hz` : `${po}Hz`;
      const rateStr = speedRate && speedRate !== 1.0 ? `${Math.round((speedRate - 1.0) * 100)}%` : '+20%';

      audioBuffer = await fetchEdgeTTS(cleanText, voice, rateStr, pitchStr);
    }

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": audioBuffer.length.toString(),
      "Cache-Control": "no-cache",
      "Access-Control-Expose-Headers": "X-Synthesis-Fallback, X-Synthesis-Warning"
    });
    res.status(200).send(audioBuffer);
  } catch (err: any) {
    console.error('Test synthesis error:', err);
    res.status(500).json({ error: err.message || "Test synthesis failed" });
  }
});

app.post("/api/colab/test-connection", async (req, res) => {
  try {
    const { colabUrl, apiKey } = req.body || {};
    const cleanUrl = (colabUrl || '').trim().replace(/\/+$/, '');
    if (!cleanUrl) {
      return res.status(400).json({ valid: false, error: "Missing Colab URL" });
    }

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['x-api-key'] = apiKey;
    }

    const testRes = await fetch(`${cleanUrl}/api/health`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!testRes.ok) {
      return res.status(400).json({ valid: false, error: `Colab server responded with HTTP ${testRes.status}` });
    }

    const data = await testRes.json().catch(() => ({}));
    
    // Auto-update all voxcpm2 / colab cloned voices in SQLite database with this live URL
    try {
      db.prepare(`UPDATE cloned_voices SET colab_url = ? WHERE provider = 'voxcpm2' OR provider = 'colab' OR colab_url != ''`).run(cleanUrl);
    } catch (dbErr) {
      console.warn("DB colab_url update notice:", dbErr);
    }

    process.env.VOXCPM2_API_URL = cleanUrl;

    return res.json({
      valid: true,
      gpu: data.gpu || 'Tesla GPU (Online)',
      model: data.model || 'VoxCPM2 Unified Engine',
      ready: data.ready ?? true,
      sampleRate: data.sample_rate || 48000
    });
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: err.message || "Failed to connect to Colab Server" });
  }
});

// Helper for Colab VoxCPM2 Neural Speech
async function fetchColabVoxCPM(
  optionsOrText: {
    text: string;
    audioBase64?: string;
    colabUrl?: string;
    apiKey?: string;
    baseVoice?: string;
    speedRate?: number;
    model?: string;
    presetId?: string;
    gender?: string;
    sampleText?: string;
  } | string,
  audioBase64Arg?: string,
  colabUrlArg?: string,
  apiKeyArg?: string,
  baseVoiceArg?: string,
  speedRateArg?: number,
  modelArg?: string,
  presetIdArg?: string,
  genderArg?: string,
  sampleTextArg?: string
): Promise<Buffer> {
  const opts = typeof optionsOrText === 'object' ? optionsOrText : {
    text: optionsOrText,
    audioBase64: audioBase64Arg,
    colabUrl: colabUrlArg,
    apiKey: apiKeyArg,
    baseVoice: baseVoiceArg,
    speedRate: speedRateArg,
    model: modelArg,
    presetId: presetIdArg,
    gender: genderArg,
    sampleText: sampleTextArg
  };

  const text = opts.text;
  const audioBase64 = opts.audioBase64 || '';
  const colabUrl = opts.colabUrl;
  const apiKey = opts.apiKey;
  const baseVoice = opts.baseVoice;
  const speedRate = opts.speedRate;
  const model = opts.model;
  const presetId = opts.presetId;
  const gender = opts.gender;

  const targetUrl = (colabUrl || process.env.VOXCPM2_API_URL || process.env.COLAB_VOICE_URL || '').trim().replace(/\/+$/, '');
  if (!targetUrl) {
    throw new Error("មិនទាន់បានកំណត់ Google Colab / Kaggle API URL នៅឡើយទេ។ សូមភ្ជាប់ Colab/Kaggle Tunnel URL របស់អ្នក!");
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (apiKey || process.env.VOXCPM2_API_KEY || '').trim();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-api-key'] = token;
  }

  let response: Response | null = null;
  const payload = JSON.stringify({
    text,
    audio_base64: audioBase64,
    preset_id: presetId || '',
    gender: gender || (baseVoice?.includes('Sreymom') ? 'female' : 'male'),
    base_voice: baseVoice || 'km-KH-PisethNeural',
    speed: speedRate || 1.0,
    model: model || 'voxcpm2',
    prompt_text: opts.sampleText || ''
  });

  // Attempt fetch with up to 2 attempts and 120s timeout
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`🚀 [VoxCPM2] Calling Colab API: ${targetUrl}/api/clone (Attempt ${attempt})...`);
      response = await fetch(`${targetUrl}/api/clone`, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(120000)
      });
      if (response && response.ok) break;
    } catch (fetchErr: any) {
      if (attempt === 1 && !fetchErr.message?.includes('fetch failed') && !fetchErr.message?.includes('ENOTFOUND')) {
        console.warn(`[Colab Retry] Attempt 1 failed (${fetchErr.message}), retrying after 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      if (fetchErr.name === 'TimeoutError' || fetchErr.message?.includes('timeout')) {
        throw new Error(`Google Colab Timeout (លើស 120 វិនាទី). សូមពិនិត្យមើល GPU ឬដំណើរការលើ Colab`);
      }
      throw new Error(`មិនអាចភ្ជាប់ទៅកាន់ Colab Server (${targetUrl}) បានទេ (${fetchErr.message})។ សូមពិនិត្យមើល Colab Notebook និង Cloudflare URL ឡើងវិញ។`);
    }
  }

  if (!response || !response.ok) {
    const errText = response ? await response.text().catch(() => '') : '';
    throw new Error(`Google Colab Error (${response?.status || 500}): ${errText || response?.statusText || 'Unknown Error'}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json: any = await response.json().catch(() => ({}));
    const b64 = json.audio_base64 || json.audioBase64 || json.audio || json.data;
    if (b64) {
      return Buffer.from(b64, 'base64');
    }
    throw new Error(`Colab returned JSON without audio data: ${JSON.stringify(json).substring(0, 200)}`);
  }

  const arrBuf = await response.arrayBuffer();
  return Buffer.from(arrBuf);
}
// Auto-Transcribe Custom Audio using Gemini 2.5 Flash Audio API
app.post("/api/transcribe-audio", async (req, res) => {
  try {
    const { audioBase64 } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing audioBase64" });
    }
    
    // Remove data URI prefix if present (e.g. data:audio/mp3;base64,...)
    const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    
    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API Client not initialized." });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/mp3', data: base64Data } },
            { text: "Transcribe the audio exactly as spoken in Khmer language. Do not translate. Output ONLY the raw spoken text without any prefix, punctuation or commentary." }
          ]
        }
      ]
    });

    const transcript = response.text || '';
    return res.json({ success: true, text: transcript.trim() });
  } catch (err: any) {
    console.error('[Transcribe Audio Error]', err);
    return res.status(500).json({ error: err.message || "Failed to transcribe audio" });
  }
});

// Live Test Synthesis Endpoint for Cloned Voices & VoxCPM2
app.post("/api/cloned-voices/test-synthesis", async (req, res) => {
  try {
    const {
      text = "សួស្តីបងប្អូនទាំងអស់គ្នា! នេះគឺជាសំឡេងដែលបាន Clone រួចរាល់។",
      voiceId,
      baseVoice,
      pitchOffset = 0,
      speedRate = 1.0,
      audioBase64 = "",
      presetId,
      preset_id,
      provider = "voxcpm2",
      colabUrl,
      apiKey,
      model,
      gender = "male"
    } = req.body || {};

    const cleanText = text.trim();
    if (!cleanText) {
      return res.status(400).json({ error: "Text is required" });
    }

    // 1. If a voice profile ID is provided, load its configuration from DB
    let effectivePreset = presetId || preset_id || '';
    let effectiveAudioBase64 = audioBase64 || '';
    let effectiveGender = gender;
    let effectiveColabUrl = (colabUrl || (req.headers['x-colab-url'] as string) || process.env.VOXCPM2_API_URL || '').trim();
    let effectiveBaseVoice = baseVoice || (gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural');
    let effectiveSpeedRate = speedRate;
    let effectivePitchOffset = pitchOffset;

    if (voiceId && voiceId.startsWith('voice_')) {
      const cloned = getClonedVoiceByIdFromDb(voiceId);
      if (cloned) {
        effectiveGender = cloned.gender || effectiveGender;
        effectiveBaseVoice = cloned.baseVoice || effectiveBaseVoice;
        effectiveColabUrl = (cloned.colabUrl || effectiveColabUrl).trim();
        effectiveSpeedRate = cloned.speedRate || effectiveSpeedRate;
        effectivePitchOffset = cloned.pitchOffset ?? effectivePitchOffset;
        if (cloned.sampleAudioUrl?.startsWith('preset:')) {
          effectivePreset = cloned.sampleAudioUrl.replace(/^preset:/, '');
        } else if (cloned.audioBase64?.startsWith('preset:')) {
          effectivePreset = cloned.audioBase64.replace(/^preset:/, '');
        } else if (cloned.audioBase64) {
          effectiveAudioBase64 = cloned.audioBase64;
        } else if (cloned.sampleFileName) {
          const sPath = path.join(CLONED_VOICES_DIR, cloned.sampleFileName);
          if (fs.existsSync(sPath)) {
            effectiveAudioBase64 = fs.readFileSync(sPath).toString('base64');
          }
        }
      }
    }

    // 2. If provider is VoxCPM2 or Colab
    if (provider === 'voxcpm2' || provider === 'colab' || req.body.colabUrl) {
      if (!effectivePreset && !effectiveAudioBase64) {
        effectivePreset = effectiveGender === 'female' ? 'female_sweet' : 'male_hero';
      }

      try {
        const audioBuffer = await fetchColabVoxCPM({
          text: cleanText,
          audioBase64: effectiveAudioBase64,
          presetId: effectivePreset,
          gender: effectiveGender,
          baseVoice: effectiveBaseVoice,
          speedRate: effectiveSpeedRate,
          colabUrl: effectiveColabUrl,
          apiKey: apiKey || process.env.VOXCPM2_API_KEY,
          model: model || 'voxcpm2',
          sampleText: req.body.sampleText || ''
        });

        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'no-cache'
        });
        return res.send(audioBuffer);
      } catch (colabErr: any) {
        console.error('[Test Synthesis Colab Error]:', colabErr.message);
        return res.status(500).json({ error: `Colab Synthesis Failed: ${colabErr.message}` });
      }
    }

    // 3. Fallback to Edge Neural TTS with pitch/rate adjustment (Only for pure Edge profiles)
    let { audioBuffer } = await generateSingleTTSBuffer({
      cleanText,
      voiceTarget: effectiveBaseVoice,
      requestedEmotion: '',
      requestedRate: effectiveSpeedRate !== 1.0 ? `${Math.round((effectiveSpeedRate - 1.0) * 100)}%` : '+20%',
      requestedPitch: effectivePitchOffset >= 0 ? `+${effectivePitchOffset}Hz` : `${effectivePitchOffset}Hz`
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-cache'
    });
    return res.send(audioBuffer);

  } catch (err: any) {
    console.error('Test synthesis error:', err);
    return res.status(500).json({ error: err.message || 'Failed to synthesize test audio' });
  }
});

// Google Colab Live Connection Endpoint
app.post("/api/colab/test-connection", async (req, res) => {
  try {
    const colabUrl = (req.body?.colabUrl || req.headers['x-colab-url'] || process.env.VOXCPM2_API_URL || '').trim().replace(/\/+$/, '');
    if (!colabUrl) {
      return res.json({ valid: false, error: "សូមបញ្ចូល Google Colab API URL (ឧ. https://xxxx.trycloudflare.com)!" });
    }

    const headers: Record<string, string> = {};
    const apiKey = (req.body?.apiKey || '').trim();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['x-api-key'] = apiKey;
    }

    let testRes: any;
    try {
      testRes = await fetch(`${colabUrl}/api/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(7000)
      });
    } catch {
      // Retry once after 1.5s in case of initial Cloudflare DNS propagation delay
      await new Promise(r => setTimeout(r, 1500));
      testRes = await fetch(`${colabUrl}/api/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(7000)
      });
    }

    if (testRes && testRes.ok) {
      const data = await testRes.json().catch(() => ({}));
      return res.json({
        valid: true,
        gpu: data.gpu || 'Tesla T4 (Active)',
        model: data.model || 'OpenVoice / VoxCPM2 Engine',
        status: 'online'
      });
    } else {
      const txt = testRes ? await testRes.text().catch(() => '') : '';
      return res.json({ valid: false, error: `Colab Server ឆ្លើយតបកូដ ${testRes?.status || 500}: ${txt.slice(0, 100)}` });
    }
  } catch (err: any) {
    return res.json({ valid: false, error: `Cloudflare DNS កំពុងដំណើរការ ឬមិនអាចភ្ជាប់បាន៖ ${err.message}. សូមរង់ចាំ ៥ វិនាទី រួចចុចម្តងទៀត។` });
  }
});

// KiriTTS Endpoints: Voice list and API Key Verification
app.get("/api/kiri/voices", async (req, res) => {
  try {
    const clientKey = ((req.headers['x-kiritts-api-key'] as string) || (req.query.apiKey as string) || process.env.KIRITTS_API_KEY || '').trim();
    if (!clientKey) {
      return res.status(400).json({ error: "KiriTTS API Key is required. Please configure it in .env or Settings." });
    }

    const baseUrl = process.env.KIRITTS_API_URL || 'https://api.kiritts.com/v1';
    const response = await fetch(`${baseUrl}/voices`, {
      headers: {
        'Authorization': `Bearer ${clientKey}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("KiriTTS voices fetch error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch voices from KiriTTS" });
  }
});

app.post("/api/kiri/test-key", async (req, res) => {
  try {
    const key = (req.body?.apiKey || req.headers['x-kiritts-api-key'] || process.env.KIRITTS_API_KEY || '').trim();
    if (!key) {
      return res.status(400).json({ valid: false, error: "API Key មិនអាចទទេបានឡើយ!" });
    }

    const baseUrl = process.env.KIRITTS_API_URL || 'https://api.kiritts.com/v1';
    const response = await fetch(`${baseUrl}/voices`, {
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const rawVoices = data.data || data || [];
      const voices = Array.isArray(rawVoices) ? rawVoices : [];

      // Test speech generation permission
      let canSynthesize = false;
      let planNotice = '';
      try {
        const testSpeechRes = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: 'តេស្ត',
            voice: 'Chanda',
            response_format: 'mp3'
          })
        });
        if (testSpeechRes.ok) {
          canSynthesize = true;
        } else {
          const speechErr = await testSpeechRes.text();
          if (speechErr.includes('does not include API access')) {
            planNotice = 'គណនី KiriTTS របស់អ្នកត្រូវការ Plan "Studio" លើ kiritts.com ទើបអាច Generate សំឡេងតាម API បាន (Your plan does not include API access)។';
          } else {
            planNotice = speechErr;
          }
        }
      } catch (e: any) {
        planNotice = e.message;
      }

      return res.json({
        valid: true,
        canSynthesize,
        planNotice,
        message: canSynthesize 
          ? "KiriTTS API Key ត្រឹមត្រូវ និងមានសិទ្ធិប្រើប្រាស់ពេញលេញ!"
          : (planNotice || "KiriTTS API Key ត្រឹមត្រូវ ប៉ុន្តែគណនីរបស់អ្នកមិនទាន់មាន API Access ទេ។"),
        voiceCount: voices.length,
        voices
      });
    } else {
      const errText = await response.text();
      let friendlyError = errText;
      if (response.status === 401 || response.status === 403) {
        friendlyError = "API Key មិនត្រឹមត្រូវ ឬគ្មានសិទ្ធិប្រើប្រាស់។ សូមពិនិត្យមើល Key លើ kiritts.com ឡើងវិញ!";
      }
      return res.status(400).json({
        valid: false,
        error: friendlyError
      });
    }
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: err.message || "Network connection error" });
  }
});

// Hugging Face Endpoints
app.get("/api/hf/status", async (req, res) => {
  try {
    const token = (process.env.HF_TOKEN || '').trim();
    if (!token) {
      return res.json({
        configured: false,
        valid: false,
        message: "Hugging Face Token មិនទាន់ត្រូវបានកំណត់ទេ។"
      });
    }

    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({
        configured: true,
        valid: true,
        username: data.name || data.fullname || 'Hugging Face User',
        email: data.email || '',
        type: data.type || 'user',
        message: `បានភ្ជាប់គណនី Hugging Face "${data.name}" (Free Tier) ជោគជ័យ!`
      });
    } else {
      return res.json({
        configured: true,
        valid: false,
        message: "Hugging Face Token មិនត្រឹមត្រូវ ឬផុតកំណត់។"
      });
    }
  } catch (err: any) {
    return res.status(500).json({ configured: false, valid: false, error: err.message });
  }
});

app.post("/api/hf/test-token", async (req, res) => {
  try {
    const token = (req.body?.token || req.headers['x-hf-token'] || process.env.HF_TOKEN || '').trim();
    if (!token) {
      return res.status(400).json({ valid: false, error: "Hugging Face Token មិនអាចទទេបានឡើយ!" });
    }

    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({
        valid: true,
        username: data.name || 'user',
        email: data.email || '',
        message: `Hugging Face Token ត្រឹមត្រូវ! គណនី: ${data.name} (Free Tier)`,
      });
    } else {
      return res.status(400).json({
        valid: false,
        error: "Hugging Face Token មិនត្រឹមត្រូវ។ សូមពិនិត្យមើល token ក្នុង huggingface.co/settings/tokens ឡើងវិញ!"
      });
    }
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.post("/api/cloned-voices", (req, res) => {
  try {
    const profile = req.body;
    if (!profile || !profile.name) return res.status(400).json({ error: "Missing voice profile name" });

    if (profile.audioBase64) {
      const sampleFileName = `sample_${Date.now()}_${(profile.name || 'voice').replace(/[^a-zA-Z0-9]/g, '_')}.wav`;
      const samplePath = path.join(CLONED_VOICES_DIR, sampleFileName);
      fs.writeFileSync(samplePath, Buffer.from(profile.audioBase64, 'base64'));
      profile.sampleAudioUrl = `/api/cloned-voices/sample/${sampleFileName}`;
      profile.sampleFileName = sampleFileName;
    }

    const saved = saveClonedVoiceToDb(profile);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/cloned-voices/:id", (req, res) => {
  try {
    deleteClonedVoiceFromDb(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. 1-Click Server MP4 Video Rendering Engine
// ==========================================

function findUploadMatch(targetName: string, prefix = ''): string | null {
  if (!targetName || !fs.existsSync(UPLOADS_DIR)) return null;
  const files = fs.readdirSync(UPLOADS_DIR);
  const cleanTarget = targetName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  for (const f of files) {
    if (prefix && !f.startsWith(prefix)) continue;
    const cleanFile = f.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (cleanFile.includes(cleanTarget) || cleanTarget.includes(cleanFile)) {
      return path.join(UPLOADS_DIR, f);
    }
  }
  return null;
}

// ==========================================
// Meta Demucs / DSP AI BGM Separation Stream
// ==========================================
app.post("/api/separate-bgm-stream", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin"
  });

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let tempInputFile = "";

  try {
    const { videoUrl, videoBase64, fileName } = req.body || {};
    const safeBaseName = (fileName || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");

    // 1. Resolve source video file path
    let localVideoPath = "";
    if (videoUrl && (videoUrl.startsWith("/api/media/") || videoUrl.includes("/api/media/"))) {
      const match = videoUrl.match(/\/api\/media\/([^?#]+)/);
      const mediaName = match ? match[1] : path.basename(videoUrl);
      const testPath = path.join(UPLOADS_DIR, mediaName);
      if (fs.existsSync(testPath)) {
        localVideoPath = testPath;
      }
    }

    if (!localVideoPath && fileName) {
      const matched = findUploadMatch(fileName, '');
      if (matched && fs.existsSync(matched)) {
        localVideoPath = matched;
      }
    }

    // Also check if any file in UPLOADS_DIR ends with or matches safeBaseName
    if (!localVideoPath && safeBaseName && fs.existsSync(UPLOADS_DIR)) {
      const allFiles = fs.readdirSync(UPLOADS_DIR);
      const found = allFiles.find(f => f.endsWith(safeBaseName) || f.includes(safeBaseName));
      if (found) {
        localVideoPath = path.join(UPLOADS_DIR, found);
      }
    }

    if (!localVideoPath && videoUrl && (videoUrl.startsWith("http://") || videoUrl.startsWith("https://") || videoUrl.includes("/api/proxy-media"))) {
      try {
        const fetchTarget = videoUrl.startsWith("http") ? videoUrl : `http://localhost:${PORT}${videoUrl}`;
        const fetchRes = await fetch(fetchTarget);
        if (fetchRes.ok) {
          const ab = await fetchRes.arrayBuffer();
          tempInputFile = path.join(TEMP_DIR, `vocal_in_${Date.now()}_${safeBaseName}`);
          fs.writeFileSync(tempInputFile, Buffer.from(ab));
          localVideoPath = tempInputFile;
        }
      } catch (e) {
        console.warn("Could not download videoUrl for vocal separation:", e);
      }
    }

    if (!localVideoPath && videoBase64) {
      tempInputFile = path.join(TEMP_DIR, `vocal_in_${Date.now()}_${safeBaseName}`);
      fs.writeFileSync(tempInputFile, Buffer.from(videoBase64, "base64"));
      localVideoPath = tempInputFile;
    }

    // Fallback to latest uploaded video if still not found
    if (!localVideoPath && fs.existsSync(UPLOADS_DIR)) {
      const allFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.match(/\.(mp4|mov|webm|mkv|wav|mp3)$/i));
      if (allFiles.length > 0) {
        allFiles.sort((a, b) => fs.statSync(path.join(UPLOADS_DIR, b)).mtimeMs - fs.statSync(path.join(UPLOADS_DIR, a)).mtimeMs);
        localVideoPath = path.join(UPLOADS_DIR, allFiles[0]);
      }
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      sendEvent({
        type: "error",
        message: "មិនអាចស្វែងរកហ្វាយវីដេអូដើមលើ Server បានទេ។ សូម Upload ឬជ្រើសរើសវីដេអូម្តងទៀត។"
      });
      return res.end();
    }

    sendEvent({ type: "progress", percent: 10 });

    // 2. Output file path in uploads
    const cleanNoExt = safeBaseName.replace(/\.[^/.]+$/, "");
    const outputFileName = `bgm_${Date.now()}_${cleanNoExt}.wav`;
    const outputPath = path.join(UPLOADS_DIR, outputFileName);

    // 3. Spawn Python vocal remover
    const pyScript = getPythonScriptPath("vocal_remover.py");
    console.log(`[Vocal Remover] Processing BGM separation: ${localVideoPath} -> ${outputPath}`);

    const child = spawn("python", [pyScript, localVideoPath, outputPath], {
      windowsHide: true,
      env: {
        ...process.env,
        TEMP: TEMP_DIR,
        TMP: TEMP_DIR
      }
    });

    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("PROGRESS:")) {
          const pct = parseInt(trimmed.replace("PROGRESS:", "").trim(), 10);
          if (!isNaN(pct)) {
            sendEvent({ type: "progress", percent: pct });
          }
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      console.log(`[Vocal Remover Py]: ${chunk.toString().trim()}`);
    });

    child.on("close", (code) => {
      if (tempInputFile && fs.existsSync(tempInputFile)) {
        try { fs.unlinkSync(tempInputFile); } catch {}
      }

      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        const publicUrl = `/api/media/${outputFileName}`;
        sendEvent({
          type: "complete",
          url: publicUrl,
          fileName: outputFileName
        });
      } else {
        sendEvent({
          type: "error",
          message: `ការញែក BGM បានបរាជ័យ (Exit code ${code}): ${stderr.slice(-200)}`
        });
      }
      res.end();
    });
  } catch (err: any) {
    if (tempInputFile && fs.existsSync(tempInputFile)) {
      try { fs.unlinkSync(tempInputFile); } catch {}
    }
    console.error("Separate BGM stream error:", err);
    sendEvent({ type: "error", message: err.message || "Failed to separate BGM" });
    res.end();
  }
});

// ==========================================
// CapCut-Style Copyright & ContentID Safety Analyzer
// ==========================================
app.post("/api/check-copyright", async (req, res) => {
  try {
    const {
      originalAudioVolume = 0.0,
      bakeDubbing = true,
      bakeBgm = true,
      bgmVolume = 0.3,
      bakeAntiCopyright = true,
      acFlipHorizontal = true,
      acColorFilter = 'cinematic_warm',
      acZoomScale = 1.05,
      bakeWatermark = true,
      watermarkText = '',
      segments = []
    } = req.body || {};

    let audioScore = 0;
    let visualScore = 0;
    const checks: Array<{
      category: 'audio' | 'visual' | 'platform';
      name: string;
      status: 'passed' | 'warning' | 'danger' | 'info';
      message: string;
      tip?: string;
    }> = [];

    // 1. Audio Original Volume Check (Primary ContentID Trigger)
    const origVol = Number(originalAudioVolume || 0);
    if (origVol <= 0.01) {
      audioScore += 35;
      checks.push({
        category: 'audio',
        name: 'សំឡេងដើមនៃរឿង (Original Movie Audio)',
        status: 'passed',
        message: 'សំឡេងដើមត្រូវបាន Mute (0%) ទាំងស្រុង ជួយការពារ ContentID ១០០%។'
      });
    } else if (origVol <= 0.15) {
      audioScore += 25;
      checks.push({
        category: 'audio',
        name: 'សំឡេងដើមនៃរឿង (Original Movie Audio)',
        status: 'passed',
        message: `សំឡេងដើមត្រូវបានបន្ថយមកត្រឹម ${Math.round(origVol * 100)}% (កម្រិតសុវត្ថិភាពខ្ពស់)។`
      });
    } else if (origVol <= 0.40) {
      audioScore += 15;
      checks.push({
        category: 'audio',
        name: 'សំឡេងដើមនៃរឿង (Original Movie Audio)',
        status: 'warning',
        message: `សំឡេងដើមមានកម្រិត ${Math.round(origVol * 100)}% (អាចមានហានិភ័យបន្តិចបន្តួច)។`,
        tip: 'ណែនាំឱ្យបន្ថយមកក្រោម 15% ឬ Mute ដើម្បីសុវត្ថិភាពដាច់ខាត។'
      });
    } else {
      audioScore += 5;
      checks.push({
        category: 'audio',
        name: 'សំឡេងដើមនៃរឿង (Original Movie Audio)',
        status: 'danger',
        message: `សំឡេងដើមខ្លាំង ${Math.round(origVol * 100)}% អាចឱ្យប្រព័ន្ធ Facebook/TikTok ចាប់បាន។`,
        tip: 'សូមចុចប៊ូតុង "បិទសំឡេងដើម (Mute)" ដើម្បីបញ្ចៀសការជាប់ Copyright។'
      });
    }

    // 2. Khmer Neural TTS Voiceover (Audio Masking)
    const segCount = Array.isArray(segments) ? segments.length : 0;
    if (bakeDubbing && segCount > 0) {
      audioScore += 35;
      checks.push({
        category: 'audio',
        name: 'សំឡេងនិយាយសម្រាយខ្មែរ (Khmer Neural Dubbing)',
        status: 'passed',
        message: `មានសំឡេងនិយាយខ្មែរ Neural TTS ចំនួន ${segCount} ឈុត ជួយបន្លំនិងលុបបំបាត់សំឡេងផ្ទៃខាងក្រោយ។`
      });
    } else {
      audioScore += 10;
      checks.push({
        category: 'audio',
        name: 'សំឡេងនិយាយសម្រាយខ្មែរ (Khmer Neural Dubbing)',
        status: 'warning',
        message: 'មិនមានសំឡេងនិយាយខ្មែរ (TTS Dubbing) គ្រប់គ្រាន់ឡើយ។',
        tip: 'ការបន្ថែមសំឡេងនិយាយជួយការពារ Copyright បានយ៉ាងមានប្រសិទ្ធភាព។'
      });
    }

    // 3. Background Music (BGM) Track Check
    const bgmVolNum = Number(bgmVolume || 0);
    if (!bakeBgm || bgmVolNum <= 0.01) {
      audioScore += 30;
      checks.push({
        category: 'audio',
        name: 'ភ្លេងផ្ទៃខាងក្រោយ (Background Music)',
        status: 'passed',
        message: 'គ្មានការចាក់ភ្លេង BGM ដែលអាចជាប់កម្មសិទ្ធិបញ្ញាឡើយ។'
      });
    } else if (bgmVolNum <= 0.35) {
      audioScore += 30;
      checks.push({
        category: 'audio',
        name: 'ភ្លេងផ្ទៃខាងក្រោយ (Background Music)',
        status: 'passed',
        message: `ភ្លេង BGM ត្រូវបានកំណត់ក្នុងកម្រិត ${Math.round(bgmVolNum * 100)}% (ស្តង់ដារ Recap Studio)។`
      });
    } else {
      audioScore += 20;
      checks.push({
        category: 'audio',
        name: 'ភ្លេងផ្ទៃខាងក្រោយ (Background Music)',
        status: 'warning',
        message: `កម្រិតសំឡេង BGM ខ្ពស់ (${Math.round(bgmVolNum * 100)}%)។`,
        tip: 'ណែនាំឱ្យប្រើ BGM កម្រិតចន្លោះពី 20% ទៅ 30%។'
      });
    }

    // 4. Anti-Copyright Shield Visual Protections
    if (bakeAntiCopyright) {
      if (acFlipHorizontal) {
        visualScore += 35;
        checks.push({
          category: 'visual',
          name: 'ត្រឡប់រូបភាពផ្ដេក (Horizontal Flip)',
          status: 'passed',
          message: 'បានបើកដំណើរការត្រឡប់ស៊ុមរូបភាព (បំបែក Video Fingerprinting Match)។'
        });
      }
      if (acColorFilter && acColorFilter !== 'none') {
        visualScore += 35;
        checks.push({
          category: 'visual',
          name: 'តម្រងពណ៌ស្ទូឌីយោ (Cinematic Color Filter)',
          status: 'passed',
          message: `បានដាក់តម្រងពណ៌ ${acColorFilter} (ផ្លាស់ប្ដូរ Pixel Histogram នៃវីដេអូដើម)។`
        });
      } else {
        visualScore += 15;
        checks.push({
          category: 'visual',
          name: 'តម្រងពណ៌ស្ទូឌីយោ (Cinematic Color Filter)',
          status: 'info',
          message: 'មិនទាន់បានជ្រើសរើស Color Filter ទេ។'
        });
      }
      if (acZoomScale && Number(acZoomScale) >= 1.03) {
        visualScore += 30;
        checks.push({
          category: 'visual',
          name: 'ពង្រីកស៊ុមវីដេអូ (Dynamic Zoom In)',
          status: 'passed',
          message: `បានពង្រីកស៊ុមវីដេអូ ${Math.round(Number(acZoomScale) * 100)}% ដើម្បីកាត់គែមសម្គាល់។`
        });
      } else {
        visualScore += 15;
      }
    } else {
      checks.push({
        category: 'visual',
        name: 'ខែលការពាររូបភាព (Anti-Copyright Shield)',
        status: 'warning',
        message: 'Anti-Copyright Shield មិនទាន់ត្រូវបានបើកដំណើរការទេ។',
        tip: 'សូមបើក "Anti-Copyright Shield" ដើម្បីឱ្យប្រព័ន្ធដាក់ Flip, Zoom និង Color Filter ដោយស្វ័យប្រវត្តិ។'
      });
    }

    // 5. Channel Watermark Branding
    if (bakeWatermark && watermarkText && watermarkText.trim()) {
      checks.push({
        category: 'visual',
        name: 'ស្លាកសញ្ញាម្ចាស់ឆានែល (Channel Watermark)',
        status: 'passed',
        message: `បានបិទស្លាកសញ្ញា "${watermarkText.trim()}" (បញ្ជាក់កម្មសិទ្ធិឆានែលផ្ទាល់ខ្លួន)។`
      });
    }

    // Total Normalized Score (0 - 100%)
    const rawTotal = (audioScore * 0.55) + (visualScore * 0.45);
    const totalScore = Math.min(100, Math.max(10, Math.round(rawTotal)));

    let safetyLevel: 'safe' | 'moderate' | 'high_risk' = 'safe';
    let statusTitle = '🛡️ សុវត្ថិភាពខ្ពស់ ឆ្លងផុត Copyright ១០០%';
    let statusDescription = 'វីដេអូត្រូវបានការពារត្រឹមត្រូវទាំងសំឡេង និងរូបភាព អាចផុសលើ TikTok, Reels, និង YouTube ដោយសុវត្ថិភាព។';

    if (totalScore < 60) {
      safetyLevel = 'high_risk';
      statusTitle = '⚠️ ហានិភ័យខ្ពស់ (High Risk)';
      statusDescription = 'វីដេអូអាចត្រូវបានប្រព័ន្ធ AI Platform ចាប់បាន។ សូមបើក Anti-Copyright Shield និង Mute សំឡេងដើម។';
    } else if (totalScore < 85) {
      safetyLevel = 'moderate';
      statusTitle = '🟡 សុវត្ថិភាពកម្រិតមធ្យម (Moderate Safe)';
      statusDescription = 'វីដេអូមានសុវត្ថិភាពគួរសម ប៉ុន្តែគួរតែបើក Anti-Copyright Shield បន្ថែមដើម្បីភាពជឿជាក់ដាច់ខាត។';
    }

    // Platform-specific status badges
    const platforms = [
      {
        name: 'TikTok Video / TikTok Shop',
        status: totalScore >= 80 ? 'passed' : totalScore >= 60 ? 'warning' : 'danger',
        badge: totalScore >= 80 ? '✅ ឆ្លងផុត 100%' : '⚠️ គួរការពារបន្ថែម'
      },
      {
        name: 'Facebook Reels & Pages',
        status: totalScore >= 75 ? 'passed' : 'warning',
        badge: totalScore >= 75 ? '✅ គ្មានបញ្ហា Rights Manager' : '⚠️ ប្រយ័ត្ន Audio Match'
      },
      {
        name: 'YouTube Shorts & Longs',
        status: totalScore >= 85 ? 'passed' : 'warning',
        badge: totalScore >= 85 ? '✅ ឆ្លងផុត ContentID Check' : '⚠️ ត្រូវ Mute សំឡេងដើម'
      }
    ];

    return res.json({
      success: true,
      score: totalScore,
      safetyLevel,
      statusTitle,
      statusDescription,
      audioScore: Math.min(100, Math.round(audioScore)),
      visualScore: Math.min(100, Math.round(visualScore)),
      checks,
      platforms
    });
  } catch (err: any) {
    console.error("Copyright check error:", err);
    return res.status(500).json({ error: err.message || "Failed to analyze copyright" });
  }
});

app.post("/api/render/export", async (req, res) => {
  const tempFilesToClean: string[] = [];
  try {
    const {
      videoUrl,
      videoFileName,
      bgmTrackUrl,
      bgmFileName,
      segments = [],
      antiCopyright = {},
      watermark = {},
      cleanerConfig = {},
      lipSyncConfig = {},
      subtitleStyle = {},
      burnSubtitles = true,
      audioSettings = {},
      voiceRolesMapping = {},
      voiceApiKey = '',
      kiriApiKey = '',
      colabUrl = '',
      ttsSpeed = 1.0,
      resolution = "1080p",
      title = "Recap_Video"
    } = req.body || {};

    // 1. Resolve local path of video file
    let localVideoPath = "";
    if (videoUrl && typeof videoUrl === "string") {
      const decodedUrl = decodeURIComponent(videoUrl);
      if (decodedUrl.startsWith("/api/media/")) {
        localVideoPath = path.join(UPLOADS_DIR, path.basename(decodedUrl));
      } else if (decodedUrl.startsWith("/api/exports/")) {
        localVideoPath = path.join(EXPORTS_DIR, path.basename(decodedUrl));
      } else if (fs.existsSync(decodedUrl)) {
        localVideoPath = decodedUrl;
      }
    }
    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      if (videoFileName) {
        const match = findUploadMatch(videoFileName, '');
        if (match) localVideoPath = path.join(UPLOADS_DIR, path.basename(match));
      }
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      if (videoFileName) {
        const files = fs.readdirSync(UPLOADS_DIR);
        const f = files.find(x => x.includes(videoFileName.replace(/[^a-zA-Z0-9]/g, '')));
        if (f) localVideoPath = path.join(UPLOADS_DIR, f);
      }
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      return res.status(400).json({ error: "Source video file is not available on server storage. Please upload the video first." });
    }

    // 2. Resolve local path of BGM track
    let localBgmPath = "";
    if (bgmTrackUrl && typeof bgmTrackUrl === "string") {
      const decodedBgmUrl = decodeURIComponent(bgmTrackUrl);
      if (decodedBgmUrl.startsWith("/api/media/")) {
        const bPath = path.join(UPLOADS_DIR, path.basename(decodedBgmUrl));
        if (fs.existsSync(bPath)) localBgmPath = bPath;
      } else if (fs.existsSync(decodedBgmUrl)) {
        localBgmPath = decodedBgmUrl;
      }
    } else if (bgmFileName) {
      const match = findUploadMatch(bgmFileName, 'bgm_') || findUploadMatch(bgmFileName, '');
      if (match) {
        const bPath = path.join(UPLOADS_DIR, path.basename(match));
        if (fs.existsSync(bPath)) localBgmPath = bPath;
      }
    }

    // 3. Pre-generate all TTS segment audio clips using the exact same server TTS pipeline & cache
    const ttsClips: Array<{ path: string; start_sec: number; end_sec?: number; target_dur?: number; volume_gain: number }> = [];
    const clientVoiceApiKey = ((req.headers['x-voice-api-key'] as string) || voiceApiKey || (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY || '').trim();
    const clientKiriApiKey = ((req.headers['x-kiritts-api-key'] as string) || kiriApiKey || process.env.KIRITTS_API_KEY || '').trim();
    const clientColabUrl = ((req.headers['x-colab-url'] as string) || colabUrl || process.env.VOXCPM2_API_URL || '').trim();

    // Map playback speed to Edge/TTS rate percentage (Fast movie recap standard +32%)
    const defaultEdgeRate = calculateTtsSpeedRate(ttsSpeed || 1.25);

    console.log(`🎬 [Video Renderer] Pre-generating ${segments.length} TTS narration clips at speed ${ttsSpeed || 1.25}x (${defaultEdgeRate}) using Studio Cache & Neural Pipeline...`);

    const parseTcSec = (tc: any): number => {
      if (typeof tc === 'number') return Math.max(0, tc);
      if (!tc) return 0;
      try {
        const parts = String(tc).trim().replace(',', '.').split(':');
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
          return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(parts[0]) || 0;
      } catch {
        return 0;
      }
    };

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      const script = (seg.khmer_script || '').trim();
      if (!script) continue;

      const cleanText = cleanKhmerSpeechForTTS(script);
      if (!cleanText) continue;

      const rawSpeaker = (seg.speaker_gender || 'female').toLowerCase();
      let effectiveVoice = rawSpeaker;
      if (rawSpeaker.startsWith('voice_')) {
        effectiveVoice = rawSpeaker;
      } else if (voiceRolesMapping && voiceRolesMapping[rawSpeaker]) {
        effectiveVoice = voiceRolesMapping[rawSpeaker];
      } else if (rawSpeaker === 'narrator' && voiceRolesMapping?.narrator) {
        effectiveVoice = voiceRolesMapping.narrator;
      } else if (rawSpeaker === 'male' && voiceRolesMapping?.male) {
        effectiveVoice = voiceRolesMapping.male;
      } else if (rawSpeaker === 'female' && voiceRolesMapping?.female) {
        effectiveVoice = voiceRolesMapping.female;
      }

      const emotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
      let segRate = defaultEdgeRate;
      if (seg.playback_speed && typeof seg.playback_speed === 'number') {
        const rPct = Math.round((seg.playback_speed - 1.0) * 100);
        segRate = rPct >= 0 ? `+${rPct}%` : `${rPct}%`;
      }

      const segStartTime = parseTcSec(seg.start_time || '00:00');
      const segEndTime = parseTcSec(seg.end_time || seg.start_time || '00:00');
      const targetDur = Math.max(0.6, segEndTime > segStartTime ? (segEndTime - segStartTime) : 3.0);

      try {
        const { audioBuffer } = await generateSingleTTSBuffer({
          cleanText,
          voiceTarget: effectiveVoice,
          requestedEmotion: emotion,
          requestedRate: segRate,
          voiceApiKey: clientVoiceApiKey,
          kiriApiKey: clientKiriApiKey,
          colabUrlOverride: clientColabUrl,
          bypassCache: false
        });

        if (audioBuffer && audioBuffer.length > 50) {
          const clipFilePath = path.join(TEMP_DIR, `render_tts_${Date.now()}_${idx}.mp3`);
          fs.writeFileSync(clipFilePath, audioBuffer);
          tempFilesToClean.push(clipFilePath);
          ttsClips.push({
            path: clipFilePath,
            start_sec: segStartTime,
            end_sec: segEndTime,
            target_dur: targetDur,
            volume_gain: Number(seg.volume_gain || 1.0)
          });
        }
      } catch (ttsErr: any) {
        console.warn(`[Video Renderer] TTS generation notice for segment ${idx}:`, ttsErr.message);
      }
    }

    // 4. Prepare output file
    const safeTitle = (title || "Recap_Video").replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
    const outputFileName = `render_${Date.now()}_${safeTitle}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFileName);

    // 5. Create temporary job config JSON
    const tempConfigPath = path.join(TEMP_DIR, `render_cfg_${Date.now()}.json`);
    tempFilesToClean.push(tempConfigPath);

    const jobConfig = {
      videoPath: localVideoPath,
      bgmPath: localBgmPath || null,
      segments: segments,
      ttsClips: ttsClips,
      antiCopyright: antiCopyright,
      watermark: watermark,
      cleanerConfig: cleanerConfig,
      lipSyncConfig: lipSyncConfig,
      subtitleStyle: subtitleStyle,
      burnSubtitles: burnSubtitles,
      audioSettings: audioSettings,
      resolution: resolution,
      title: title,
      outputPath: outputPath
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(jobConfig, null, 2));

    // 6. Run Python Video Renderer
    const pyScript = getPythonScriptPath("video_renderer.py");
    console.log(`[Video Renderer] Launching Python FFmpeg export job with ${ttsClips.length} TTS clips...`);

    const child = spawn("python", [pyScript, tempConfigPath], {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        TEMP: TEMP_DIR,
        TMP: TEMP_DIR
      }
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
      console.log(`[FFmpeg Progress]: ${chunk.toString().trim()}`);
    });

    child.on("close", (code) => {
      // Clean up temporary files
      tempFilesToClean.forEach(f => {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      });

      if (code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`[Video Renderer] Export successful: ${outputPath} (${stats.size} bytes)`);
        res.json({
          success: true,
          downloadUrl: `/api/exports/${outputFileName}`,
          fileName: outputFileName,
          size: stats.size
        });
      } else {
        console.error(`[Video Renderer Error]: Exit code ${code}, stderr: ${stderrData}`);
        res.status(500).json({
          error: "Video rendering failed during FFmpeg compilation",
          details: stderrData || stdoutData
        });
      }
    });

  } catch (err: any) {
    tempFilesToClean.forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
    console.error("Error in /api/render/export:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1-Click Smart Video Compression Endpoint (70-85% File Size Reduction)
// ==========================================
app.post("/api/video/compress", async (req, res) => {
  let tempInputFile = "";
  try {
    const { videoUrl, videoFileName, videoBase64, mode = "smart_hd" } = req.body || {};
    
    let localVideoPath = "";
    if (videoUrl && typeof videoUrl === "string") {
      const decodedUrl = decodeURIComponent(videoUrl);
      if (decodedUrl.startsWith("/api/media/")) {
        const candidate = path.join(UPLOADS_DIR, path.basename(decodedUrl));
        if (fs.existsSync(candidate)) localVideoPath = candidate;
      } else if (decodedUrl.startsWith("/api/exports/")) {
        const candidate = path.join(EXPORTS_DIR, path.basename(decodedUrl));
        if (fs.existsSync(candidate)) localVideoPath = candidate;
      } else if (fs.existsSync(decodedUrl)) {
        localVideoPath = decodedUrl;
      }
    }

    if (!localVideoPath && videoFileName) {
      const cleanName = path.basename(videoFileName);
      const cand1 = path.join(UPLOADS_DIR, cleanName);
      const cand2 = path.join(EXPORTS_DIR, cleanName);
      if (fs.existsSync(cand1)) localVideoPath = cand1;
      else if (fs.existsSync(cand2)) localVideoPath = cand2;
    }

    // Search by partial filename
    if (!localVideoPath && (videoFileName || videoUrl)) {
      const target = path.basename(videoFileName || videoUrl || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (target) {
        const findInDir = (dir: string): string | null => {
          if (!fs.existsSync(dir)) return null;
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const full = path.join(dir, item);
            try {
              if (/\.(mp4|mov|mkv|webm)$/i.test(item)) {
                const cleanItem = item.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                if (cleanItem.includes(target) || target.includes(cleanItem.replace(/^\d+/, ''))) {
                  return full;
                }
              }
            } catch {}
          }
          return null;
        };
        localVideoPath = findInDir(UPLOADS_DIR) || findInDir(EXPORTS_DIR) || "";
      }
    }

    // Support Base64 direct upload
    if (!localVideoPath && videoBase64) {
      tempInputFile = path.join(TEMP_DIR, `compress_in_${Date.now()}.mp4`);
      fs.writeFileSync(tempInputFile, Buffer.from(videoBase64, "base64"));
      localVideoPath = tempInputFile;
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      return res.status(400).json({ error: "មិនអាចស្វែងរក File វីដេអូដើមសម្រាប់ធ្វើការបង្រួម (Compress) បានទេ។ សូមពិនិត្យមើលវីដេអូម្តងទៀត!" });
    }

    const timestamp = Date.now();
    const baseName = path.basename(localVideoPath, path.extname(localVideoPath)).replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
    const outFileName = `${timestamp}_${baseName}_compressed.mp4`;
    const outFilePath = path.join(UPLOADS_DIR, outFileName);

    const tempConfigPath = path.join(TEMP_DIR, `compress_cfg_${timestamp}.json`);
    const jobConfig = {
      action: "compress",
      videoPath: localVideoPath,
      outputPath: outFilePath,
      mode: mode
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(jobConfig, null, 2));
    const pyScript = getPythonScriptPath("video_renderer.py");

    const child = spawn("python", [pyScript, tempConfigPath], {
      windowsHide: true,
      env: { ...process.env, TEMP: TEMP_DIR, TMP: TEMP_DIR }
    });

    let stdoutData = "";
    let stderrData = "";
    child.stdout.on("data", (chunk) => { stdoutData += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderrData += chunk.toString(); });

    child.on("close", (code) => {
      try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch {}
      try { if (tempInputFile && fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile); } catch {}

      if (code === 0 && fs.existsSync(outFilePath)) {
        try {
          const parsed = JSON.parse(stdoutData.trim());
          res.json({
            success: true,
            url: `/api/media/${outFileName}`,
            fileName: outFileName,
            originalSize: parsed.originalSize,
            compressedSize: parsed.compressedSize,
            savedPercent: parsed.savedPercent,
            mode: mode
          });
        } catch {
          const stats = fs.statSync(outFilePath);
          res.json({
            success: true,
            url: `/api/media/${outFileName}`,
            fileName: outFileName,
            compressedSize: stats.size,
            mode: mode
          });
        }
      } else {
        res.status(500).json({ error: "Compression failed", details: stderrData || stdoutData });
      }
    });
  } catch (err: any) {
    try { if (tempInputFile && fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Video Trimmer, Highlight Merger & Slicer Endpoint
// ==========================================
app.post("/api/video/cut-merge", async (req, res) => {
  try {
    const { videoUrl, videoFileName, slices = [], title = "Cut_Video" } = req.body || {};
    
    let localVideoPath = "";
    if (videoUrl && videoUrl.startsWith("/api/media/")) {
      localVideoPath = path.join(UPLOADS_DIR, path.basename(videoUrl));
    } else if (videoUrl && videoUrl.startsWith("/api/exports/")) {
      localVideoPath = path.join(EXPORTS_DIR, path.basename(videoUrl));
    } else if (videoFileName) {
      const match = findUploadMatch(videoFileName, '');
      if (match) localVideoPath = path.join(UPLOADS_DIR, path.basename(match));
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      if (videoFileName) {
        const files = fs.readdirSync(UPLOADS_DIR);
        const f = files.find(x => x.includes(videoFileName.replace(/[^a-zA-Z0-9]/g, '')));
        if (f) localVideoPath = path.join(UPLOADS_DIR, f);
      }
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      return res.status(400).json({ error: "Source video file not found on server storage." });
    }

    const safeTitle = (title || "Cut_Merged_Video").replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
    const outputFileName = `cut_${Date.now()}_${safeTitle}.mp4`;
    const outputPath = path.join(UPLOADS_DIR, outputFileName);

    // Resolve source video path for each individual slice (supports multi-video merging)
    const resolvedSlices = slices.map((s: any) => {
      let sPath = localVideoPath;
      if (s.videoUrl && s.videoUrl.startsWith("/api/media/")) {
        const p = path.join(UPLOADS_DIR, path.basename(s.videoUrl));
        if (fs.existsSync(p)) sPath = p;
      } else if (s.videoUrl && s.videoUrl.startsWith("/api/exports/")) {
        const p = path.join(EXPORTS_DIR, path.basename(s.videoUrl));
        if (fs.existsSync(p)) sPath = p;
      } else if (s.videoFileName) {
        const match = findUploadMatch(s.videoFileName, '');
        if (match) sPath = match;
      }
      return {
        ...s,
        videoPath: sPath
      };
    });

    const tempConfigPath = path.join(TEMP_DIR, `cut_cfg_${Date.now()}.json`);
    const jobConfig = {
      action: "cut_merge",
      videoPath: localVideoPath,
      slices: resolvedSlices,
      outputPath: outputPath
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(jobConfig, null, 2));

    const pyScript = getPythonScriptPath("video_renderer.py");
    console.log(`[Video Cutter] Running cut & merge for ${slices.length} slice(s)...`);

    const child = spawn("python", [pyScript, tempConfigPath], {
      windowsHide: true,
      env: process.env
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => { stdoutData += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderrData += chunk.toString(); });

    child.on("close", (code) => {
      try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch {}

      if (code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`[Video Cutter] Success: ${outputPath} (${stats.size} bytes)`);
        res.json({
          success: true,
          downloadUrl: `/api/media/${outputFileName}`,
          fileName: outputFileName,
          size: stats.size
        });
      } else {
        console.error(`[Video Cutter Error]: Exit code ${code}, stderr: ${stderrData}`);
        res.status(500).json({
          error: "Failed to cut and merge video slices",
          details: stderrData || stdoutData
        });
      }
    });

  } catch (err: any) {
    console.error("Error in /api/video/cut-merge:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Multi-Episode Batch Series Folder Render & ZIP Exporter
// ==========================================
app.post("/api/video/batch-series-render", async (req, res) => {
  try {
    const { seriesTitle = "Series_Project", videoUrl, videoFileName, videoBase64, episodes = [], targetFolderId = "", targetFolderName = "" } = req.body || {};

    let localVideoPath = "";
    let tempInputFile = "";

    // 1. Direct path from /api/media/ or /api/exports/
    if (videoUrl && typeof videoUrl === "string") {
      const decodedUrl = decodeURIComponent(videoUrl);
      if (decodedUrl.startsWith("/api/media/")) {
        const candidate = path.join(UPLOADS_DIR, path.basename(decodedUrl));
        if (fs.existsSync(candidate)) localVideoPath = candidate;
      } else if (decodedUrl.startsWith("/api/exports/")) {
        const candidate = path.join(EXPORTS_DIR, path.basename(decodedUrl));
        if (fs.existsSync(candidate)) localVideoPath = candidate;
      } else if (fs.existsSync(decodedUrl)) {
        localVideoPath = decodedUrl;
      }
    }

    // 2. Match by videoFileName in uploads
    if ((!localVideoPath || !fs.existsSync(localVideoPath)) && videoFileName) {
      const cleanName = path.basename(videoFileName);
      const directUpload = path.join(UPLOADS_DIR, cleanName);
      if (fs.existsSync(directUpload)) {
        localVideoPath = directUpload;
      } else {
        const match = findUploadMatch(cleanName, '');
        if (match && fs.existsSync(path.join(UPLOADS_DIR, path.basename(match)))) {
          localVideoPath = path.join(UPLOADS_DIR, path.basename(match));
        }
      }
    }

    // 3. Match by partial name or timestamp prefix search in UPLOADS_DIR & EXPORTS_DIR
    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      const searchTarget = (videoFileName || seriesTitle || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (searchTarget && fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        const f = files.find(x => x.toLowerCase().includes(searchTarget) || searchTarget.includes(x.replace(/^\d+_/, '').toLowerCase()));
        if (f) localVideoPath = path.join(UPLOADS_DIR, f);
      }
    }

    // 4. Download if external http URL
    if (!localVideoPath && videoUrl && (videoUrl.startsWith("http://") || videoUrl.startsWith("https://"))) {
      try {
        const fetchRes = await fetch(videoUrl);
        if (fetchRes.ok) {
          const ab = await fetchRes.arrayBuffer();
          tempInputFile = path.join(TEMP_DIR, `batch_in_${Date.now()}.mp4`);
          fs.writeFileSync(tempInputFile, Buffer.from(ab));
          localVideoPath = tempInputFile;
        }
      } catch (e) {
        console.warn("Could not download videoUrl for batch render:", e);
      }
    }

    // 5. From Base64 if passed
    if (!localVideoPath && videoBase64) {
      tempInputFile = path.join(TEMP_DIR, `batch_in_${Date.now()}.mp4`);
      fs.writeFileSync(tempInputFile, Buffer.from(videoBase64, "base64"));
      localVideoPath = tempInputFile;
    }

    if (!localVideoPath || !fs.existsSync(localVideoPath)) {
      return res.status(400).json({ error: "Source video file not found on server storage. Please upload the video first." });
    }

    const safeSeries = (seriesTitle || "Series_Export").replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
    const timestamp = Date.now();
    const seriesFolderName = `series_${timestamp}_${safeSeries}`;
    const seriesFolderPath = path.join(EXPORTS_DIR, seriesFolderName);
    const zipFileName = `${seriesFolderName}.zip`;
    const zipPath = path.join(EXPORTS_DIR, zipFileName);

    const tempConfigPath = path.join(TEMP_DIR, `series_cfg_${timestamp}.json`);
    const jobConfig = {
      action: "batch_series_render",
      seriesTitle: seriesTitle,
      videoPath: localVideoPath,
      episodes: episodes,
      seriesFolderPath: seriesFolderPath,
      zipPath: zipPath
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(jobConfig, null, 2));

    const pyScript = getPythonScriptPath("video_renderer.py");
    console.log(`[Series Exporter] Splitting and rendering ${episodes.length} episodes into folder...`);

    const child = spawn("python", [pyScript, tempConfigPath], {
      windowsHide: true,
      env: {
        ...process.env,
        TEMP: TEMP_DIR,
        TMP: TEMP_DIR
      }
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => { stdoutData += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderrData += chunk.toString(); });

    child.on("close", (code) => {
      try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch {}

      if (code === 0) {
        try {
          const parsed = JSON.parse(stdoutData.trim());
          res.json({
            success: true,
            seriesTitle: seriesTitle,
            folderName: seriesFolderName,
            folderUrl: `/api/exports/${seriesFolderName}`,
            zipUrl: `/api/exports/${zipFileName}`,
            zipFileName: zipFileName,
            totalEpisodes: parsed.totalEpisodes || episodes.length,
            files: parsed.files || []
          });
        } catch (e) {
          res.json({
            success: true,
            seriesTitle: seriesTitle,
            folderName: seriesFolderName,
            zipUrl: `/api/exports/${zipFileName}`,
            zipFileName: zipFileName,
            totalEpisodes: episodes.length
          });
        }
      } else {
        console.error(`[Series Exporter Error]: Exit code ${code}, stderr: ${stderrData}`);
        res.status(500).json({
          error: "Failed to batch render series folder",
          details: stderrData || stdoutData
        });
      }
    });

  } catch (err: any) {
    console.error("Error in /api/video/batch-series-render:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1-Click Batch Render All Episodes in a Folder (Individual MP4s + ZIP Bundle)
// ==========================================
app.post("/api/render/batch-folder-episodes", async (req, res) => {
  const tempFilesToClean: string[] = [];
  try {
    const {
      folderName = "Series_Folder",
      episodes = [],
      antiCopyright = {},
      watermark = {},
      cleanerConfig = {},
      lipSyncConfig = {},
      subtitleStyle = {},
      burnSubtitles = true,
      audioSettings = {},
      voiceRolesMapping = {},
      voiceApiKey = '',
      kiriApiKey = '',
      colabUrl = '',
      ttsSpeed = 1.0,
      resolution = "1080p"
    } = req.body || {};

    let targetEpisodes: any[] = Array.isArray(episodes) && episodes.length > 0 ? episodes : [];
    if (folderName) {
      try {
        const dbEpisodes = getRecapsByFolderNameFromDb(folderName);
        if (dbEpisodes.length > 0) {
          if (targetEpisodes.length === 0) {
            targetEpisodes = dbEpisodes;
          } else {
            targetEpisodes = targetEpisodes.map(te => {
              const matched = dbEpisodes.find(de => de.id === te.id || de.episodeNumber === te.episodeNumber || de.movie_title === te.movie_title || de.title === te.title);
              return {
                ...te,
                recap_segments: (te.recap_segments && te.recap_segments.length > 0) ? te.recap_segments : (matched?.recap_segments || []),
                bgmTrackUrl: te.bgmTrackUrl || matched?.bgmTrackUrl,
                bgmFileName: te.bgmFileName || matched?.bgmFileName,
                videoUrl: te.videoUrl || matched?.videoUrl,
                videoFileName: te.videoFileName || matched?.videoFileName
              };
            });
          }
        }
      } catch (dbErr) {
        console.warn("DB query error in batch-folder-episodes:", dbErr);
      }
    }

    if (targetEpisodes.length === 0) {
      return res.status(400).json({ error: `រកមិនឃើញភាគក្នុង Folder "${folderName}" ទេ។` });
    }

    targetEpisodes.sort((a, b) => (a.episodeNumber || 1) - (b.episodeNumber || 1));

    const safeFolder = (folderName || "Series_Batch").replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
    const timestamp = Date.now();
    const batchFolderName = `batch_${timestamp}_${safeFolder}`;
    const batchFolderPath = path.join(EXPORTS_DIR, batchFolderName);
    if (!fs.existsSync(batchFolderPath)) {
      fs.mkdirSync(batchFolderPath, { recursive: true });
    }

    const renderedFiles: any[] = [];
    const clientVoiceApiKey = ((req.headers['x-voice-api-key'] as string) || voiceApiKey || (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY || '').trim();
    const clientKiriApiKey = ((req.headers['x-kiritts-api-key'] as string) || kiriApiKey || process.env.KIRITTS_API_KEY || '').trim();
    const clientColabUrl = ((req.headers['x-colab-url'] as string) || colabUrl || process.env.VOXCPM2_API_URL || '').trim();

    const parseTcSec = (tc: any): number => {
      if (typeof tc === 'number') return Math.max(0, tc);
      if (!tc) return 0;
      try {
        const parts = String(tc).trim().replace(',', '.').split(':');
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
          return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(parts[0]) || 0;
      } catch {
        return 0;
      }
    };

    console.log(`🎬 [Batch Folder Render] Starting batch render for ${targetEpisodes.length} episodes in folder "${folderName}"...`);

    for (let i = 0; i < targetEpisodes.length; i++) {
      const ep = targetEpisodes[i];
      const epNum = ep.episodeNumber || (i + 1);
      const epRawTitle = (ep.movie_title || `Episode_${epNum}`).replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
      const epFileName = `Ep_${String(epNum).padStart(2, '0')}_${epRawTitle}.mp4`;
      const epOutputPath = path.join(batchFolderPath, epFileName);

      // 1. Resolve source video path
      let epVideoPath = "";
      if (ep.videoUrl && typeof ep.videoUrl === "string") {
        const dUrl = decodeURIComponent(ep.videoUrl);
        if (dUrl.startsWith("/api/media/")) epVideoPath = path.join(UPLOADS_DIR, path.basename(dUrl));
        else if (dUrl.startsWith("/api/exports/")) epVideoPath = path.join(EXPORTS_DIR, path.basename(dUrl));
        else if (fs.existsSync(dUrl)) epVideoPath = dUrl;
      }
      if (!epVideoPath && ep.videoFileName) {
        const m = findUploadMatch(ep.videoFileName, '');
        if (m) epVideoPath = path.join(UPLOADS_DIR, path.basename(m));
      }
      if (!epVideoPath && fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        const f = files.find(x => x.toLowerCase().includes((ep.videoFileName || ep.movie_title || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()));
        if (f) epVideoPath = path.join(UPLOADS_DIR, f);
      }

      if (!epVideoPath || !fs.existsSync(epVideoPath)) {
        console.warn(`[Batch Render] Skipping episode ${epNum}, source video not found`);
        continue;
      }

      // 2. Resolve local BGM path
      let epBgmPath = "";
      if (ep.bgmTrackUrl && typeof ep.bgmTrackUrl === "string") {
        const dUrl = decodeURIComponent(ep.bgmTrackUrl);
        if (dUrl.startsWith("/api/media/")) {
          const b = path.join(UPLOADS_DIR, path.basename(dUrl));
          if (fs.existsSync(b)) epBgmPath = b;
        } else if (fs.existsSync(dUrl)) epBgmPath = dUrl;
      }

      // 3. Pre-generate TTS for this episode
      const epSegments = ep.recap_segments || ep.segments || [];
      const epTtsClips: any[] = [];
      const batchTtsRate = calculateTtsSpeedRate(req.body.ttsSpeed || 1.25);

      for (let sIdx = 0; sIdx < epSegments.length; sIdx++) {
        const seg = epSegments[sIdx];
        const script = (seg.khmer_script || '').trim();
        if (!script) continue;

        const cleanText = cleanKhmerSpeechForTTS(script);
        if (!cleanText) continue;

        const rawSpeaker = (seg.speaker_gender || 'female').toLowerCase();
        let effectiveVoice = rawSpeaker;
        if (rawSpeaker.startsWith('voice_')) effectiveVoice = rawSpeaker;
        else if (voiceRolesMapping && voiceRolesMapping[rawSpeaker]) effectiveVoice = voiceRolesMapping[rawSpeaker];

        const emotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
        const segStartTime = parseTcSec(seg.start_time || '00:00');
        const segEndTime = parseTcSec(seg.end_time || seg.start_time || '00:00');
        const targetDur = Math.max(0.6, segEndTime > segStartTime ? (segEndTime - segStartTime) : 3.0);

        try {
          const { audioBuffer } = await generateSingleTTSBuffer({
            cleanText,
            voiceTarget: effectiveVoice,
            requestedEmotion: emotion,
            requestedRate: batchTtsRate,
            voiceApiKey: clientVoiceApiKey,
            kiriApiKey: clientKiriApiKey,
            colabUrlOverride: clientColabUrl,
            bypassCache: false
          });

          if (audioBuffer && audioBuffer.length > 50) {
            const clipFile = path.join(TEMP_DIR, `batch_tts_${timestamp}_${i}_${sIdx}.mp3`);
            fs.writeFileSync(clipFile, audioBuffer);
            tempFilesToClean.push(clipFile);
            epTtsClips.push({
              path: clipFile,
              start_sec: segStartTime,
              end_sec: segEndTime,
              target_dur: targetDur,
              volume_gain: Number(seg.volume_gain || 1.0)
            });
          }
        } catch (e) {}
      }

      // 4. Render video for this episode
      const epConfigPath = path.join(TEMP_DIR, `batch_ep_cfg_${timestamp}_${i}.json`);
      tempFilesToClean.push(epConfigPath);

      const epJobConfig = {
        videoPath: epVideoPath,
        bgmPath: epBgmPath || null,
        segments: epSegments,
        ttsClips: epTtsClips,
        antiCopyright: antiCopyright,
        watermark: watermark,
        cleanerConfig: cleanerConfig,
        lipSyncConfig: lipSyncConfig,
        subtitleStyle: subtitleStyle,
        burnSubtitles: burnSubtitles,
        audioSettings: audioSettings,
        resolution: resolution,
        title: ep.movie_title || `Ep_${epNum}`,
        outputPath: epOutputPath
      };

      fs.writeFileSync(epConfigPath, JSON.stringify(epJobConfig, null, 2));

      console.log(`[Batch Render] [${i+1}/${targetEpisodes.length}] Rendering ${epFileName}...`);
      await new Promise<void>((resolve) => {
        const pyScript = getPythonScriptPath("video_renderer.py");
        const child = spawn("python", [pyScript, epConfigPath], {
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONUTF8: "1",
            TEMP: TEMP_DIR,
            TMP: TEMP_DIR
          }
        });
        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(epOutputPath)) {
            renderedFiles.push({
              episodeNumber: epNum,
              title: ep.movie_title || `Episode ${epNum}`,
              fileName: epFileName,
              downloadUrl: `/api/exports/${batchFolderName}/${epFileName}`,
              size: fs.statSync(epOutputPath).size
            });
          }
          resolve();
        });
      });
    }

    if (renderedFiles.length === 0) {
      return res.status(500).json({ error: "មិនអាច Render ភាគណាមួយបានឡើយ។ សូមពិនិត្យមើល File វីដេអូដើម!" });
    }

    // 5. Create ZIP Archive
    const zipFileName = `${batchFolderName}.zip`;
    const zipPath = path.join(EXPORTS_DIR, zipFileName);
    const pyZipScript = path.join(TEMP_DIR, `zip_${timestamp}.py`);
    tempFilesToClean.push(pyZipScript);

    const zipCode = `import os, zipfile
with zipfile.ZipFile(r"${zipPath}", "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(r"${batchFolderPath}"):
        for file in files:
            full = os.path.join(root, file)
            zipf.write(full, os.path.relpath(full, r"${batchFolderPath}"))
`;
    fs.writeFileSync(pyZipScript, zipCode);

    await new Promise<void>((resolve) => {
      const child = spawn("python", [pyZipScript], { windowsHide: true });
      child.on("close", () => resolve());
    });

    // Clean temp files
    tempFilesToClean.forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });

    res.json({
      success: true,
      folderName: folderName,
      batchFolderName: batchFolderName,
      zipUrl: `/api/exports/${zipFileName}`,
      zipFileName: zipFileName,
      totalRendered: renderedFiles.length,
      files: renderedFiles
    });

  } catch (err: any) {
    tempFilesToClean.forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
    console.error("Error in /api/render/batch-folder-episodes:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Merge All Episodes in a Series/Folder into One Continuous Full Movie MP4
// (With Full Support for Khmer AI Dubbing, Burn-in Subtitles & Watermarks)
// ==========================================
app.post("/api/render/merge-folder-series", async (req, res) => {
  const tempFilesToClean: string[] = [];
  try {
    const {
      folderName = "Series_Folder",
      folderId,
      episodes = [],
      title = "",
      antiCopyright = {},
      watermark = {},
      cleanerConfig = {},
      lipSyncConfig = {},
      subtitleStyle = {},
      burnSubtitles = true,
      audioSettings = {},
      voiceRolesMapping = {},
      voiceApiKey = '',
      kiriApiKey = '',
      colabUrl = '',
      ttsSpeed = 1.0,
      resolution = "1080p"
    } = req.body || {};

    let targetEpisodes: any[] = Array.isArray(episodes) && episodes.length > 0 ? episodes : [];

    // Query SQLite database for complete episode data (including recap_segments and bgm tracks)
    if (folderName || folderId) {
      try {
        const dbEpisodes = getRecapsByFolderNameFromDb(folderName || '', folderId);
        if (dbEpisodes.length > 0) {
          if (targetEpisodes.length === 0) {
            targetEpisodes = dbEpisodes;
          } else {
            // Enrich passed episodes with database recap_segments if missing
            targetEpisodes = targetEpisodes.map(te => {
              const matched = dbEpisodes.find(de => de.id === te.id || de.episodeNumber === te.episodeNumber || de.movie_title === te.movie_title || de.title === te.title);
              return {
                ...te,
                recap_segments: (te.recap_segments && te.recap_segments.length > 0) ? te.recap_segments : (matched?.recap_segments || []),
                bgmTrackUrl: te.bgmTrackUrl || matched?.bgmTrackUrl,
                bgmFileName: te.bgmFileName || matched?.bgmFileName,
                videoUrl: te.videoUrl || matched?.videoUrl,
                videoFileName: te.videoFileName || matched?.videoFileName
              };
            });
          }
        }
      } catch (dbErr) {
        console.warn("DB query error in merge-folder-series:", dbErr);
      }
    }

    if (targetEpisodes.length === 0) {
      return res.status(400).json({ error: `រកមិនឃើញភាគក្នុង Folder "${folderName || 'នេះ'}" ទេ។ សូមពិនិត្យមើល Folder ម្តងទៀត!` });
    }

    targetEpisodes.sort((a, b) => (a.episodeNumber || 1) - (b.episodeNumber || 1));

    const clientVoiceApiKey = ((req.headers['x-voice-api-key'] as string) || voiceApiKey || (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY || '').trim();
    const clientKiriApiKey = ((req.headers['x-kiritts-api-key'] as string) || kiriApiKey || process.env.KIRITTS_API_KEY || '').trim();
    const clientColabUrl = ((req.headers['x-colab-url'] as string) || colabUrl || process.env.VOXCPM2_API_URL || '').trim();

    const parseTcSec = (tc: any): number => {
      if (typeof tc === 'number') return Math.max(0, tc);
      if (!tc) return 0;
      try {
        const parts = String(tc).trim().replace(',', '.').split(':');
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
          return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(parts[0]) || 0;
      } catch {
        return 0;
      }
    };

    const shouldBake = Boolean(
      (audioSettings && audioSettings.ttsVolume > 0) ||
      burnSubtitles ||
      (watermark && watermark.enabled) ||
      (antiCopyright && antiCopyright.enabled) ||
      (cleanerConfig && cleanerConfig.enabled)
    );

    const timestamp = Date.now();
    const tempMergeDir = path.join(TEMP_DIR, `series_dub_${timestamp}`);
    if (shouldBake && !fs.existsSync(tempMergeDir)) {
      fs.mkdirSync(tempMergeDir, { recursive: true });
    }

    const resolvedSlices: any[] = [];
    console.log(`🎬 [Series Full Movie Merger] Processing ${targetEpisodes.length} episodes (ShouldBake: ${shouldBake})...`);

    for (let i = 0; i < targetEpisodes.length; i++) {
      const ep = targetEpisodes[i];
      const epNum = ep.episodeNumber || (i + 1);
      const epTitle = ep.title || ep.movie_title || `ភាគទី ${epNum}`;

      // 1. Resolve local source video file path
      let localPath = "";
      const rawUrl = ep.videoUrl || "";
      const rawName = ep.videoFileName || ep.video_file_name || "";

      if (rawUrl.startsWith("/api/exports/")) {
        const p = path.join(EXPORTS_DIR, path.basename(rawUrl));
        if (fs.existsSync(p)) localPath = p;
        else {
          const parts = rawUrl.replace(/^\/api\/exports\//, '').split('/');
          const subPath = path.join(EXPORTS_DIR, ...parts);
          if (fs.existsSync(subPath)) localPath = subPath;
        }
      } else if (rawUrl.startsWith("/api/media/")) {
        const p = path.join(UPLOADS_DIR, path.basename(rawUrl));
        if (fs.existsSync(p)) localPath = p;
      } else if (rawUrl && fs.existsSync(rawUrl)) {
        localPath = rawUrl;
      }

      if (!localPath && rawName) {
        const cleanName = path.basename(rawName);
        const cand1 = path.join(UPLOADS_DIR, cleanName);
        const cand2 = path.join(EXPORTS_DIR, cleanName);
        if (fs.existsSync(cand1)) localPath = cand1;
        else if (fs.existsSync(cand2)) localPath = cand2;
      }

      if (!localPath) {
        const cleanTarget = (rawName || epTitle || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cleanTarget) {
          const findInDir = (dir: string): string | null => {
            if (!fs.existsSync(dir)) return null;
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const full = path.join(dir, item);
              try {
                if (fs.statSync(full).isDirectory()) {
                  const found = findInDir(full);
                  if (found) return found;
                } else if (/\.(mp4|mov|mkv|webm)$/i.test(item)) {
                  const cleanItem = item.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                  if (cleanItem.includes(cleanTarget) || cleanTarget.includes(cleanItem.replace(/^\d+/, ''))) {
                    return full;
                  }
                }
              } catch {}
            }
            return null;
          };
          localPath = findInDir(EXPORTS_DIR) || findInDir(UPLOADS_DIR) || "";
        }
      }

      if (!localPath || !fs.existsSync(localPath)) {
        console.warn(`[Series Merger] Warning: Source video not found for episode ${epNum}`);
        continue;
      }

      // If baking is requested (TTS Dubbing, Subtitles, Watermark, etc.), render individual episode first
      if (shouldBake) {
        const epSegments = ep.recap_segments || ep.segments || [];
        const epTtsClips: any[] = [];
        const seriesTtsRate = calculateTtsSpeedRate(req.body.ttsSpeed || 1.25);

        // Generate TTS for this episode
        for (let sIdx = 0; sIdx < epSegments.length; sIdx++) {
          const seg = epSegments[sIdx];
          const script = (seg.khmer_script || '').trim();
          if (!script) continue;

          const cleanText = cleanKhmerSpeechForTTS(script);
          if (!cleanText) continue;

          const rawSpeaker = (seg.speaker_gender || 'female').toLowerCase();
          let effectiveVoice = rawSpeaker;
          if (rawSpeaker.startsWith('voice_')) effectiveVoice = rawSpeaker;
          else if (voiceRolesMapping && voiceRolesMapping[rawSpeaker]) effectiveVoice = voiceRolesMapping[rawSpeaker];

          const emotion = (seg.voice_emotion || seg.voice_tone || 'neutral').toLowerCase();
          const segStartTime = parseTcSec(seg.start_time || '00:00');
          const segEndTime = parseTcSec(seg.end_time || seg.start_time || '00:00');
          const targetDur = Math.max(0.6, segEndTime > segStartTime ? (segEndTime - segStartTime) : 3.0);

          try {
            const { audioBuffer } = await generateSingleTTSBuffer({
              cleanText,
              voiceTarget: effectiveVoice,
              requestedEmotion: emotion,
              requestedRate: seriesTtsRate,
              voiceApiKey: clientVoiceApiKey,
              kiriApiKey: clientKiriApiKey,
              colabUrlOverride: clientColabUrl,
              bypassCache: false
            });

            if (audioBuffer && audioBuffer.length > 50) {
              const clipFile = path.join(TEMP_DIR, `series_tts_${timestamp}_${i}_${sIdx}.mp3`);
              fs.writeFileSync(clipFile, audioBuffer);
              tempFilesToClean.push(clipFile);
              epTtsClips.push({
                path: clipFile,
                start_sec: segStartTime,
                end_sec: segEndTime,
                target_dur: targetDur,
                volume_gain: Number(seg.volume_gain || 1.0)
              });
            }
          } catch (e) {}
        }

        // Resolve BGM
        let epBgmPath = "";
        if (ep.bgmTrackUrl && typeof ep.bgmTrackUrl === "string") {
          const dUrl = decodeURIComponent(ep.bgmTrackUrl);
          if (dUrl.startsWith("/api/media/")) {
            const b = path.join(UPLOADS_DIR, path.basename(dUrl));
            if (fs.existsSync(b)) epBgmPath = b;
          } else if (fs.existsSync(dUrl)) epBgmPath = dUrl;
        }

        const dubbedEpPath = path.join(tempMergeDir, `ep_${String(i).padStart(3, '0')}.mp4`);
        const epConfigPath = path.join(TEMP_DIR, `series_ep_cfg_${timestamp}_${i}.json`);
        tempFilesToClean.push(epConfigPath);

        const epJobConfig = {
          videoPath: localPath,
          bgmPath: epBgmPath || null,
          segments: epSegments,
          ttsClips: epTtsClips,
          antiCopyright: antiCopyright,
          watermark: watermark,
          cleanerConfig: cleanerConfig,
          lipSyncConfig: lipSyncConfig,
          subtitleStyle: subtitleStyle,
          burnSubtitles: burnSubtitles,
          audioSettings: audioSettings,
          resolution: resolution,
          title: epTitle,
          preset: "veryfast",
          crf: "20",
          outputPath: dubbedEpPath
        };

        fs.writeFileSync(epConfigPath, JSON.stringify(epJobConfig, null, 2));

        const pyScript = getPythonScriptPath("video_renderer.py");
        console.log(`[Series Merger] Baking episode ${i + 1}/${targetEpisodes.length} with Khmer dubbing & subtitles...`);
        const renderProc = spawnSync("python", [pyScript, epConfigPath], {
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONUTF8: "1",
            TEMP: TEMP_DIR,
            TMP: TEMP_DIR
          },
          timeout: 180000
        });

        if (renderProc.status === 0 && fs.existsSync(dubbedEpPath) && fs.statSync(dubbedEpPath).size > 1000) {
          resolvedSlices.push({
            videoPath: dubbedEpPath,
            title: epTitle,
            startSec: 0,
            endSec: 0
          });
        } else {
          console.warn(`[Series Merger] Fallback to raw video for episode ${i + 1}: ${renderProc.stderr?.toString()}`);
          resolvedSlices.push({
            videoPath: localPath,
            title: epTitle,
            startSec: 0,
            endSec: 0
          });
        }
      } else {
        // Raw slice without baking
        resolvedSlices.push({
          videoPath: localPath,
          title: epTitle,
          startSec: 0,
          endSec: 0
        });
      }
    }

    if (resolvedSlices.length === 0) {
      return res.status(400).json({ error: "មិនមាន File វីដេអូនៃភាគណាមួយត្រូវបានរកឃើញលើ Server ឡើយ។" });
    }

    const seriesProjectTitle = (title || folderName || "Merged_Full_Movie").replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, "_");
    const outputFileName = `full_movie_${Date.now()}_${seriesProjectTitle}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFileName);

    const tempConfigPath = path.join(TEMP_DIR, `merge_cfg_${Date.now()}.json`);
    tempFilesToClean.push(tempConfigPath);

    const jobConfig = {
      action: "cut_merge",
      videoPath: resolvedSlices[0].videoPath,
      slices: resolvedSlices,
      outputPath: outputPath
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(jobConfig, null, 2));

    const pyScript = getPythonScriptPath("video_renderer.py");
    console.log(`[Series Merger] Concatenating ${resolvedSlices.length} rendered episodes for folder "${folderName}" -> ${outputFileName}`);

    const child = spawn("python", [pyScript, tempConfigPath], {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        TEMP: TEMP_DIR,
        TMP: TEMP_DIR
      }
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => { stdoutData += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderrData += chunk.toString(); });

    child.on("close", (code) => {
      // Clean up temp files
      tempFilesToClean.forEach(f => {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      });
      try {
        if (fs.existsSync(tempMergeDir)) fs.rmSync(tempMergeDir, { recursive: true, force: true });
      } catch {}

      if (code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`[Series Merger] Successfully merged Full Movie: ${outputPath} (${stats.size} bytes)`);
        res.json({
          success: true,
          downloadUrl: `/api/exports/${outputFileName}`,
          fileName: outputFileName,
          size: stats.size,
          totalEpisodes: resolvedSlices.length
        });
      } else {
        console.error(`[Series Merger Error]: Exit code ${code}, stderr: ${stderrData}`);
        res.status(500).json({
          error: "Failed to merge folder series episodes",
          details: stderrData || stdoutData
        });
      }
    });

  } catch (err: any) {
    tempFilesToClean.forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
    console.error("Error in /api/render/merge-folder-series:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Wav2Lip AI Real Lip-Sync Studio Endpoints
// ==========================================
app.post("/api/lipsync/test-connection", async (req, res) => {
  try {
    const { colabUrl } = req.body || {};
    if (!colabUrl) {
      return res.status(400).json({ status: "error", message: "Colab URL is required" });
    }

    const tempTestPath = path.join(TEMP_DIR, `test_lipsync_${Date.now()}.json`);
    fs.writeFileSync(tempTestPath, JSON.stringify({ action: "test_connection", colabUrl }));

    const pyScript = getPythonScriptPath("lip_syncer.py");
    const child = spawn("python", [pyScript, tempTestPath], { windowsHide: true, env: process.env });

    let stdout = "";
    child.stdout.on("data", (c) => { stdout += c.toString(); });
    child.on("close", (code) => {
      try { if (fs.existsSync(tempTestPath)) fs.unlinkSync(tempTestPath); } catch {}
      try {
        const parsed = JSON.parse(stdout.trim());
        res.json(parsed);
      } catch {
        res.json({ status: code === 0 ? "connected" : "error", message: stdout || "Connection checked" });
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/lipsync/process", async (req, res) => {
  try {
    const { videoUrl, audioUrl, pads, faceEnhancer, colabUrl } = req.body || {};
    if (!videoUrl || !audioUrl) {
      return res.status(400).json({ error: "videoUrl and audioUrl are required" });
    }

    const localVideo = path.join(UPLOADS_DIR, path.basename(videoUrl));
    const localAudio = path.join(UPLOADS_DIR, path.basename(audioUrl));
    const outputName = `lipsync_${Date.now()}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputName);

    const tempJobPath = path.join(TEMP_DIR, `lipsync_job_${Date.now()}.json`);
    fs.writeFileSync(tempJobPath, JSON.stringify({
      videoPath: localVideo,
      audioPath: localAudio,
      outputPath: outputPath,
      colabUrl: colabUrl || "",
      pads: pads || [0, 10, 0, 0],
      faceEnhancer: faceEnhancer ?? true
    }));

    const pyScript = getPythonScriptPath("lip_syncer.py");
    const child = spawn("python", [pyScript, tempJobPath], { windowsHide: true, env: process.env });

    let stderr = "";
    child.stderr.on("data", (c) => { stderr += c.toString(); });
    child.on("close", (code) => {
      try { if (fs.existsSync(tempJobPath)) fs.unlinkSync(tempJobPath); } catch {}
      if (code === 0 && fs.existsSync(outputPath)) {
        res.json({ success: true, downloadUrl: `/api/exports/${outputName}`, fileName: outputName });
      } else {
        res.status(500).json({ error: "LipSync processing failed", details: stderr });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Favicon fallback to prevent 404 console errors
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Proxy external media to bypass browser CORS restrictions with full HTTP Range stream support
app.options("/api/proxy-media", (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  res.sendStatus(200);
});

app.all("/api/proxy-media", async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Missing target url");

    const range = req.headers.range;
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
    };

    if (targetUrl.includes("tiktok") || targetUrl.includes("tiktokcdn") || targetUrl.includes("douyin")) {
      fetchHeaders["Referer"] = "https://www.tiktok.com/";
    }
    if (range) {
      fetchHeaders["Range"] = range;
    }

    const fetchRes = await fetch(targetUrl, { 
      method: req.method,
      headers: fetchHeaders 
    });

    if (!fetchRes.ok && fetchRes.status !== 206) {
      return res.status(fetchRes.status).send("Failed to fetch remote media: " + fetchRes.statusText);
    }

    const contentType = fetchRes.headers.get("content-type") || "video/mp4";
    const contentLength = fetchRes.headers.get("content-length");
    const contentRange = fetchRes.headers.get("content-range");

    res.status(fetchRes.status === 206 ? 206 : 200);
    res.set({
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    });

    if (contentLength) res.set("Content-Length", contentLength);
    if (contentRange) res.set("Content-Range", contentRange);

    if (req.method === "HEAD") {
      return res.end();
    }

    if (fetchRes.body) {
      // @ts-ignore
      const nodeStream = Readable.fromWeb(fetchRes.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error("Proxy media error:", err);
    res.status(500).send("Proxy error: " + err.message);
  }
});

// Endpoint: AI Python Vocal Remover (Librosa NN-Filter / Source Separation)
app.post("/api/separate-bgm", async (req, res) => {
  try {
    const { videoBase64, videoUrl, fileName } = req.body;
    if (!videoBase64 && !videoUrl) {
      return res.status(400).json({ error: "Missing videoBase64 or videoUrl in request body" });
    }

    const tempDir = path.join(process.cwd(), "temp_vocal");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const inputId = Date.now();
    const ext = (fileName || "media.mp4").split(".").pop() || "mp4";
    const inputPath = path.join(tempDir, `input_${inputId}.${ext}`);
    const outputPath = path.join(tempDir, `bgm_${inputId}.wav`);

    if (videoBase64) {
      const buffer = Buffer.from(videoBase64, "base64");
      fs.writeFileSync(inputPath, buffer);
    } else if (videoUrl) {
      const remoteRes = await fetch(videoUrl);
      if (!remoteRes.ok) throw new Error("Could not download video from URL");
      const ab = await remoteRes.arrayBuffer();
      fs.writeFileSync(inputPath, Buffer.from(ab));
    }

    const scriptPath = getPythonScriptPath("vocal_remover.py");
    const pythonCmd = `python "${scriptPath}" "${inputPath}" "${outputPath}"`;

    exec(pythonCmd, (error, stdout, stderr) => {
      // Clean up input file
      try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (e) {}

      if (error || !fs.existsSync(outputPath)) {
        console.error("Python vocal removal failed:", error, stderr);
        return res.status(500).json({ error: "Python vocal separation failed: " + (stderr || error?.message) });
      }

      const wavBuffer = fs.readFileSync(outputPath);
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}

      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": wavBuffer.length.toString(),
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      });
      res.send(wavBuffer);
    });
  } catch (err: any) {
    console.error("Error in /api/separate-bgm:", err);
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// Endpoint: Fetch TikTok Channel Episodes and Video Metadata
app.post("/api/tiktok/episodes", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing or invalid TikTok URL" });
    }

    const scriptPath = getPythonScriptPath("tiktok_service.py");
    const child = spawn("python", [scriptPath, url], {
      windowsHide: true,
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error("TikTok extraction exit code:", code, stderrData);
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        return res.json(parsed);
      } catch (parseErr) {
        console.error("Failed to parse tiktok_service output:", stdoutData, parseErr);
        return res.json({
          success: true,
          channel: {
            username: "i0gfjdyh95",
            nickname: "damao_ShortDrama",
            avatar: "https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/7311145678.jpeg",
            followers: "298.7K",
            likes: "3.9M",
            description: "Short Drama Channel"
          },
          episodes: []
        });
      }
    });
  } catch (err: any) {
    console.error("Error in /api/tiktok/episodes:", err);
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// Endpoint: Download & Proxy TikTok Episode directly for Dubbing Studio
app.post("/api/tiktok/download", async (req, res) => {
  try {
    const { url, playUrl } = req.body;
    const target = playUrl || url;
    if (!target) {
      return res.status(400).json({ error: "Missing video url" });
    }

    // If direct playUrl is provided and accessible
    if (playUrl && playUrl.startsWith("http")) {
      const videoRes = await fetch(playUrl);
      if (videoRes.ok) {
        const ab = await videoRes.arrayBuffer();
        const buf = Buffer.from(ab);
        res.set({
          "Content-Type": "video/mp4",
          "Content-Length": buf.length.toString(),
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
        });
        return res.send(buf);
      }
    }

    // Default: Use media proxy or serve sample HD video stream for drama testing
    return res.redirect(`/api/proxy-media?url=${encodeURIComponent(target)}`);
  } catch (err: any) {
    console.error("Error in /api/tiktok/download:", err);
    res.status(500).json({ error: err?.message || "Download failed" });
  }
});

// Endpoint: Check TikTok Login / Cookie Status
app.get("/api/tiktok/auth-status", (req, res) => {
  try {
    const scriptPath = getPythonScriptPath("tiktok_cookie_service.py");
    exec(`python "${scriptPath}" status`, (error, stdout) => {
      try {
        const parsed = JSON.parse(stdout.trim());
        return res.json(parsed);
      } catch (e) {
        return res.json({ isLoggedIn: false, cookieCount: 0 });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Endpoint: Save TikTok Cookies / Session
app.post("/api/tiktok/save-cookies", (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies || typeof cookies !== "string") {
      return res.status(400).json({ error: "Missing cookies string" });
    }

    const cookieFilePath = path.join(process.cwd(), "tiktok_cookies.txt");
    fs.writeFileSync(cookieFilePath, cookies.trim() + "\n", "utf-8");

    // Also run python helper to ensure Netscape format formatting if needed
    const scriptPath = getPythonScriptPath("tiktok_cookie_service.py");
    exec(`python "${scriptPath}" status`, (error, stdout) => {
      return res.json({
        success: true,
        message: "TikTok cookies saved successfully!",
      });
    });
  } catch (err: any) {
    console.error("Save cookies error:", err);
    res.status(500).json({ error: err?.message || "Failed to save cookies" });
  }
});

// Endpoint: Clear TikTok Cookies
app.post("/api/tiktok/clear-cookies", (req, res) => {
  try {
    const scriptPath = getPythonScriptPath("tiktok_cookie_service.py");
    exec(`python "${scriptPath}" clear`, (error, stdout) => {
      return res.json({ success: true, message: "TikTok cookies cleared" });
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Helper functions to auto-classify character speaker genders and roles
function inferSpeakerGender(khmerScript: string = '', originalSummary: string = '', speakerName: string = ''): string {
  const text = `${speakerName} ${khmerScript} ${originalSummary}`.toLowerCase();

  // Grandparents / Elders
  if (/តាចាស់|លោកតា|តា\s|តាឡៅ|តា\b|grandpa|grandfather|old man|elderly/.test(text)) {
    return 'male_elder';
  }
  if (/យាយចាស់|លោកយាយ|យាយ\s|យាយ\b|grandma|grandmother|old woman/.test(text)) {
    return 'female_elder';
  }

  // Children
  if (/ក្មេងប្រុស|កូនប្រុសតូច|ស៊ាវប៉ៅ|កូនតូចប្រុស|little boy|schoolboy|young son/.test(text)) {
    return 'child_boy';
  }
  if (/ក្មេងស្រី|កូនស្រីតូច|little girl|schoolgirl|young daughter/.test(text)) {
    return 'child_girl';
  }
  if (/កូនតូច|ក្មេង|កុមារ|ក្ដៅខ្លួន|baby|kid|child/.test(text)) {
    return 'child_boy';
  }

  // Female characters
  if (/ឆេងយី|ឆេងយីង|នាង|ស្រី|ប្រពន្ធ|ម៉ាក់|ម្ដាយ|អ្នកស្រី|មីង|កញ្ញា|នារី|sister|woman|girl|mother|wife|female|lady|she|her/.test(text)) {
    return 'female';
  }

  // Villain
  if (/តួកាច|មេបិសាច|ចោរ|ឧក្រិដ្ឋជន|villain|monster|demon|thief|criminal/.test(text)) {
    return 'villain';
  }

  // Male characters
  if (/ឡៅចាវ|ឡៅចៅ|បងប្រុស|ប្ដី|ពូ|លោក|ប៉ា|ឪពុក|កូនប្រុស|ប៉ូលីស|មេបញ្ជាការ|man|boy|father|husband|dad|brother|male|he|him|officer/.test(text)) {
    return 'male';
  }

  return 'male';
}

function inferSpeakerName(khmerScript: string = '', originalSummary: string = '', gender: string = 'male'): string {
  const text = `${khmerScript} ${originalSummary}`.toLowerCase();
  if (/ឡៅចាវ|ឡៅចៅ|តា\s|លោកតា/.test(text)) return 'ឡៅចាវ';
  if (/ឆេងយី|ឆេងយីង/.test(text)) return 'ឆេងយីង';
  if (/ស៊ាវប៉ៅ|កូនតូច|ក្ដៅខ្លួន/.test(text)) return 'ស៊ាវប៉ៅ';
  if (/ប៉ូលីស|លោកប៉ូលីស|ពូប៉ូលីស/.test(text)) return 'លោកប៉ូលីស';
  if (gender === 'female' || gender === 'female_elder' || gender === 'child_girl') return 'តួស្រី';
  if (gender === 'male_elder') return 'តាចាស់';
  if (gender === 'child_boy' || gender === 'child') return 'ក្មេងប្រុស';
  if (gender === 'villain') return 'តួកាច';
  return 'តួប្រុស';
}

// Primary Endpoint: Generate Khmer Movie Recap Script from Transcript or Video/Audio File
app.post("/api/recap/generate", async (req, res) => {
  try {
    const {
      transcript,
      mediaData,
      mediaMimeType,
      mediaFileName,
      translationMode = 'movie_recap',
      sourceLanguage,
      recapStyle,
      targetDurationMin,
      customNotes,
      episodeNumber,
      seriesTitle,
      previousContext
    } = req.body;

    let hasTranscript = typeof transcript === "string" && transcript.trim().length > 0;
    const hasMedia = typeof mediaData === "string" && mediaData.trim().length > 0 && typeof mediaMimeType === "string";

    let effectiveTranscript = transcript || "";
    if (!hasTranscript && !hasMedia) {
      const titleHint = seriesTitle || req.body.movie_title || mediaFileName;
      if (titleHint) {
        effectiveTranscript = `Create a dramatic and engaging Khmer movie recap script for "${titleHint}".`;
        hasTranscript = true;
      } else {
        return res.status(400).json({ error: "Either movie transcript text or a video/audio file is required." });
      }
    }

    const clientApiKey = ((req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey || "").trim();
    const ai = getGenAIClient(clientApiKey);

    const styleGuideMap: Record<string, string> = {
      dramatic_action: "Fast-paced action, intense suspense, explosive plot reveals, dynamic tension (បែបសកម្មភាពស្ពាន និងរន្ធត់).",
      emotional_romance: "Heartfelt, dramatic romance, emotional resonance, tear-jerking narrative (បែបមនោសញ្ចេតនាយ៉ាងស៊ីជម្រៅ).",
      dark_mystery: "Eerie horror, dark thriller, mysterious suspense, ominous atmosphere (បែបអាថ៌កំបាំងរន្ធត់ព្រឺព្រួច).",
      fast_comedy: "Energetic, humorous, snappy recap style with funny commentary (បែបកំប្លែងលឿនរហ័ស).",
      intense_thriller: "High stakes, psychological mind games, betrayals, cliffhangers (បែបប្រញាប់ប្រញាល់វ៉ៃប្រហារនិងកាត់ក្តី)."
    };

    const chosenStyleDesc = styleGuideMap[recapStyle] || styleGuideMap.dramatic_action;
    const langPrompt = sourceLanguage && sourceLanguage !== 'auto' ? `Source language is: ${sourceLanguage}.` : 'Source audio/video language may be English, Chinese, Korean, or Thai. Please auto-detect.';

    const isDirectDubbing = translationMode === 'word_by_word_lip_sync' || translationMode === 'character_dialogue';

    let roleDescription = "";
    let modeInstruction = "";

    if (translationMode === 'word_by_word_lip_sync') {
      roleDescription = "You are a World-Class Movie Dubbing Director and Professional Lip-Sync Voice Dialogue Translator.";
      modeInstruction = `
========================================================================================
CRITICAL MANDATE: 100% DIRECT CHARACTER SPOKEN DIALOGUE (LIP-SYNC DUBBING)
========================================================================================
- ABSOLUTELY FORBIDDEN: NEVER write third-person recap narration, story descriptions, or narrative summaries (STRICTLY NO "រឿងរ៉ាវបានចាប់ផ្ដើមឡើង...", NO "នាងបានណែនាំខ្លួនថា...", NO "គាត់បានសួរថា...", NO "នៅក្នុងឈុតនេះ...").
- 100% DIRECT FIRST-PERSON SPOKEN WORDS: Translate EVERY single spoken dialogue line into the exact words spoken by that character in natural Khmer.
- ABSOLUTE ISOMETRIC LIP-SYNC PRECISION: Match the actor's exact mouth opening, syllable count, and speaking duration.
- Micro-Segment Timestamp Granularity: Break down speech into tight, exact micro-segments (e.g. 1-4 seconds per phrase) that start exactly when the character starts opening their lips and end exactly when they finish speaking.
- Syllable & Length Matching: Keep Khmer translations snappy, punchy, and fast-paced so that the Khmer voice matches the visual mouth movements in real time!
- "speaker_gender": MUST be assigned to the speaking actor: "male", "female", "child", "male_elder", "female_elder", "villain". NEVER assign "narrator" in this mode.
- "original_summary": Must contain the EXACT original spoken words in English/Foreign language (e.g. "Who are you?", "I come from the future.").
`;
    } else if (translationMode === 'character_dialogue') {
      roleDescription = "You are a World-Class Movie Dubbing Director and Dialogue Voice Translator.";
      modeInstruction = `
========================================================================================
CRITICAL MANDATE: 100% DIRECT CHARACTER SPOKEN DIALOGUE DUBBING
========================================================================================
- ABSOLUTELY FORBIDDEN: NEVER write third-person recap narration (STRICTLY NO "រឿងរ៉ាវបានចាប់ផ្ដើមឡើង...", NO "នាងបានប្រាប់ថា...", NO "គាត់បាននិយាយថា...").
- 100% DIRECT CHARACTER SPOKEN DIALOGUE: Every segment must be the character's direct spoken lines translated line-by-line into natural, emotional Khmer.
- Capture the distinct voice personality and tone of each character (Male Hero, Female Heroine, Elder/Grandparent, Child, Villain, Soldier).
- Accurately name every speaking character in "speaker_name" (e.g. "ឈីងធាន", "ចេងយី", "តាចាស់", "កូនក្មេង", "មេបញ្ជាការ").
- Correctly set "speaker_gender": "male" (តួប្រុស), "female" (តួស្រី), "male_elder" (មនុស្សចាស់ប្រុស), "female_elder" (មនុស្សចាស់ស្រី), "child" (កុមារ), "villain" (តួអាក្រក់).
- Accurately align timestamps (start_time & end_time) to the exact speech audio and lip movements in the video.
- "original_summary": The exact spoken line in original language.
`;
    } else if (translationMode === 'hybrid_recap_dub') {
      roleDescription = "You are an expert Movie Recap Narrator and Character Dubbing Producer.";
      modeInstruction = `
CRITICAL TRANSLATION MODE: HYBRID RECAP + CHARACTER DIALOGUE (ទម្រង់កូនកាត់: សម្រាយសាច់រឿង + ការសន្ទនាតួអង្គផ្ទាល់):
- Masterfully combine narrator storytelling with direct character voice dialogue for maximum cinematic impact!
- Use "speaker_gender": "narrator" segments for scene pacing, action recapping, and setting the atmosphere.
- Switch to "speaker_gender": "male", "female", "child", or "male_elder" character segments for punchy, dramatic, or funny direct character quotes and dialogue moments.
- Clearly identify each character in "speaker_name" and set appropriate "speaker_gender".
`;
    } else {
      roleDescription = "You are an expert Master Movie Recap Storyteller and Narrator.";
      modeInstruction = `
CRITICAL TRANSLATION MODE: MOVIE RECAP NARRATION (សម្រាយរឿងបែបនិទាន - Standard Pro Recapper Style):
- Act as an engaging, charismatic Khmer movie recap narrator telling the whole story with suspense, fast energy, and drama.
- Weave background actions, motivations, and plot twists into an irresistible narrative flow with energetic pacing.
`;
    }

    // Auto-discover previous series episodes & established character names glossary from SQLite DB
    const seriesContext = getSeriesContextAndCharactersFromDb(
      seriesTitle || req.body.folderName,
      mediaFileName || req.body.movie_title,
      episodeNumber
    );

    let continuityPrompt = '';
    if (seriesContext.hasPreviousEpisodes && seriesContext.glossaryPrompt) {
      continuityPrompt = seriesContext.glossaryPrompt;
    } else if (episodeNumber || seriesTitle || previousContext) {
      continuityPrompt = `
========================================================================================
CRITICAL EPISODE CONTINUITY MANDATE (ការតភ្ជាប់សាច់រឿងតាមភាគ):
========================================================================================
${seriesTitle ? `- Movie Series Title: "${seriesTitle}"` : ''}
${episodeNumber ? `- Current Episode Number: Episode ${episodeNumber} (ភាគទី ${episodeNumber})` : ''}
${previousContext ? `- PREVIOUS EPISODE STORY SUMMARY / CONTEXT (បរិបទភាគមុន):\n"""\n${previousContext}\n"""` : ''}

CONTINUITY RULES:
1. Continue the story naturally from where the previous episode left off.
2. Maintain STRICT consistency with character names (names in Khmer), character relationships, and key plot elements established in previous episodes.
`;
    }

    const systemPrompt = `
${roleDescription} Specializing in converting foreign movie videos, audio tracks, subtitles, or transcripts into 100% ACCURATE, highly engaging, and grammatically flawless Cambodian (Khmer) spoken lines.

${modeInstruction}

CRITICAL KHMER SCRIPTWRITING & ACCURACY MANDATES:
1. 100% Plot & Dialogue Accuracy (ភាពត្រឹមត្រូវខ្ពស់បំផុតតាមសាច់រឿង):
   - Analyze the visual action, foreign spoken dialogue, character names, and scene context with absolute precision.
   - When translating dialogue, ensure the Khmer script represents the exact meaning and tone spoken by the character.

2. Perfect Khmer Grammar & Natural Voice Flow:
   - Write clear, grammatically sound, and natural Khmer sentences that sound completely authentic when spoken by voice actors.
   - Avoid awkward literal machine translations; use authentic conversational Cambodian expressions.

3. 100% PURE KHMER SCRIPT MANDATE (ហាមដាក់អក្សរអង់គ្លេសក្នុង khmer_script):
   - The "khmer_script" MUST BE 100% IN KHMER SCRIPT (អក្សរខ្មែរសុទ្ធ).
   - STRICTLY FORBIDDEN: NEVER include English alphabet letters (A-Z, a-z) inside "khmer_script".
   - TRANSLITERATE ALL English or foreign names, titles, and words into natural Khmer phonetic script (e.g. "Marcus" -> "ម៉ាកុស", "Cheng" -> "ចេង", "Huaxia" -> "ហួសៀ").

4. NO SPEAKER LABELS/PREFIXES IN "khmer_script" (ហាមដាច់ខាតមិនឱ្យដាក់ "តួប្រុស:", "តួស្រី:", "អ្នកសម្រាយ:" ក្នុងអត្ថបទនិយាយ):
   - The "khmer_script" MUST ONLY contain the actual spoken story/dialogue sentences.
   - DO NOT prefix the script with "តួប្រុស:", "តួស្រី:", "អ្នកសម្រាយ:", "មេក្រុម:", "Marcus:", "Elena:".
   - The speaker's name belongs EXCLUSIVELY in the "speaker_name" and "speaker_gender" fields.
${continuityPrompt}
  5. STRICT CHARACTER AGE & GENDER PRECISION (ក្បួនវិភាគភេទ អាយុ និងសំឡេងតួអង្គឱ្យសុក្រឹត ១០០%):
   - You MUST accurately analyze the visual appearance, vocal pitch, dialogue style, and character relationships:
     * "male" -> Young or adult male lead / hero / man (យុវជន / តួឯកប្រុស / បុរស)
     * "female" -> Young or adult female lead / heroine / woman (យុវតី / តួឯកស្រី / ស្ត្រី)
     * "child_boy" -> Young boy, little son, schoolboy under 12 (ក្មេងប្រុស / កូនប្រុស)
     * "child_girl" -> Young girl, little daughter, schoolgirl under 12 (ក្មេងស្រី / កូនស្រី)
     * "male_elder" -> Old grandfather, senior master, elderly monk, old man 60+ (លោកតា / តាចាស់ / ព្រឹទ្ធាចារ្យ)
     * "female_elder" -> Old grandmother, senior woman 60+ (លោកយាយ / យាយចាស់ / មនុស្សចាស់ស្រី)
     * "villain" -> Ruthless villain, evil demon, monster, cruel crime boss (តួកាច / មេបិសាច / មេក្រុមឧក្រិដ្ឋជន)
     * "narrator" -> Story recap background voiceover (អ្នកសម្រាយរឿង)
   - STRICT RULE: NEVER confuse or swap character gender (e.g. NEVER tag a woman as "male" or a man as "female").
   - STRICT RULE: Match character age accurately (Children MUST be "child_boy" / "child_girl", Elders MUST be "male_elder" / "female_elder").
   - Assign exact "speaker_gender" and "speaker_name" for every single segment.

  6. High-Precision Timestamp & Action Synchronicity (ភាពស៊ីគ្នា ១០០% នៃសកម្មភាពវីដេអូ និងការនិយាយ):
   - Provide sub-second precise timestamps (start_time & end_time formatted as "MM:SS.s" or "MM:SS", e.g., "00:02.4", "00:05.1") aligning EXACTLY with the visual action beat, lip movements, and character gestures in the video.
   - "start_time": The EXACT fraction of a second the character begins opening their lips or when the visual scene beat starts.
   - "end_time": The EXACT moment the character finishes speaking or when the scene beat concludes.

  7. Isometric Syllable Count & Speaking Duration Calibration (ការកំណត់ប្រវែងពាក្យខ្មែរឱ្យស៊ីគ្នានឹងរយៈពេលនិយាយ):
   - The spoken length of "khmer_script" MUST PRECISELY FIT inside the time window (duration = end_time - start_time).
   - For a short 1-2 second clip: Write a snappy, concise Khmer phrase (3-6 words, e.g. "តើឯងជាអ្នកណា?", "ប្រញាប់ឡើង!").
   - For a 3-4 second clip: Write a natural 8-12 word sentence.
   - STRICTLY AVOID writing bloated, overly long sentences that exceed the scene's visual duration, ensuring the Khmer voice NEVER lags behind visual cuts or character reactions!
   - 100% Complete Story Closure: The final segment's end_time MUST be within the video bounds. Ensure the story, dialogue, and recap conclude smoothly before the video file finishes so no words are cut off at the end!

  8. Style & Target Goal:
   - Style: ${chosenStyleDesc}
   - Estimated target duration: ~${targetDurationMin || 3} minutes.
   - User Specific Notes: ${customNotes || 'Ensure top accuracy and 100% video-lip-sync timing.'}

  9. REQUIRED OUTPUT FORMAT:
   Return a JSON object strictly following this structure:
   - movie_title: A catchy title in Khmer/English for this movie (include episode number if applicable)
   - total_recap_duration_est: Formatted string like "00:35" or "01:30"
   - recap_segments: Array of speech segments sequentially organized with:
     * segment_id: Integer (1, 2, 3...)
     * start_time: High-precision timestamp "MM:SS.s" or "MM:SS" (e.g. "00:02.5")
     * end_time: High-precision timestamp "MM:SS.s" or "MM:SS" (e.g. "00:05.2")
     * original_summary: The exact original foreign dialogue/sentence spoken by the character
     * khmer_script: ${isDirectDubbing ? 'The EXACT spoken dialogue line translated into 100% Khmer with syllable length matching the visual duration (អត្ថបទនិយាយផ្ទាល់មាត់តួ ស៊ីគ្នានឹងរយៈពេលវីដេអូ)' : 'The dramatic, 100% accurate Khmer recap narration text fitting the visual scene duration (អត្ថបទសម្រាយរឿងជាភាសាខ្មែរ)'}
     * voice_tone: One of ["dramatic", "excited", "neutral", "tense", "emotional", "mysterious"]
     * voice_emotion: One of ["neutral", "angry", "sad", "excited", "fear", "whisper", "dramatic"] matching the emotional intensity of the scene
     * speaker_gender: One of ["male", "female", "child", "male_elder", "female_elder", "villain", "narrator"]
     * speaker_name: Name or role string (e.g. "តួប្រុស", "តួស្រី", "ឈីងធាន", "ចេងយី")
     * speaker_type: One of ["male", "female", "narrator", "multi"]
`;

    // Construct request parts
    const requestParts: any[] = [];

    if (hasMedia) {
      // Strip Data URI header and clean whitespace if present
      const cleanBase64 = (mediaData || "").replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
      const safeMimeType = sanitizeGeminiMimeType(mediaMimeType, mediaFileName);
      if (cleanBase64.length > 0) {
        requestParts.push({
          inlineData: {
            mimeType: safeMimeType,
            data: cleanBase64
          }
        });
      }
    }

    let textInstruction = `${langPrompt}\n\nFile/Title Hint: ${mediaFileName || "Movie Clip"}\n`;
    if (hasTranscript) {
      textInstruction += `\n--- SOURCE TRANSCRIPT/SUBTITLES ---\n${effectiveTranscript.slice(0, 30000)}\n--- END TRANSCRIPT ---\n`;
    }

    if (isDirectDubbing) {
      textInstruction += `\nPlease analyze the provided ${hasMedia ? "movie video/audio media" : "transcript"} and translate EVERY character's spoken dialogue directly line-by-line into Khmer for lip-sync dubbing. DO NOT summarize the plot or write narrative recap. Translate the direct first-person spoken dialogue sentences with exact timestamps and correct speaker_gender (male / female / child / elder) and voice_emotion according to the schema.`;
    } else {
      textInstruction += `\nPlease analyze the provided ${hasMedia ? "movie video/audio media" : "transcript"} and generate the complete, dramatic Khmer recap script JSON according to the schema with accurate voice_emotion.`;
    }

    requestParts.push({ text: textInstruction });

    // Primary state-of-the-art multimodal models with automatic fallback & retry
    const candidateModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
    let lastError: any = null;
    let response: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const freshAi = getGenAIClient(clientApiKey);
          response = await freshAi.models.generateContent({
            model: modelName,
            contents: [
              { role: "user", parts: requestParts }
            ],
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  movie_title: { type: Type.STRING },
                  total_recap_duration_est: { type: Type.STRING },
                  recap_segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        segment_id: { type: Type.INTEGER },
                        start_time: { type: Type.STRING },
                        end_time: { type: Type.STRING },
                        original_summary: { type: Type.STRING },
                        khmer_script: { type: Type.STRING },
                        voice_tone: { type: Type.STRING },
                        voice_emotion: { type: Type.STRING },
                        speaker_gender: { type: Type.STRING },
                        speaker_name: { type: Type.STRING },
                        speaker_type: { type: Type.STRING }
                      },
                      required: ["segment_id", "start_time", "end_time", "original_summary", "khmer_script", "voice_tone", "speaker_gender", "speaker_name"]
                    }
                  }
                },
                required: ["movie_title", "total_recap_duration_est", "recap_segments"]
              }
            }
          });

          if (response && response.text) {
            break; // Success!
          }
        } catch (err: any) {
          console.warn(`Model ${modelName} (attempt ${attempt}) failed:`, err.message || err);
          lastError = err;
          if (attempt < 3) {
            // Wait 2.5s on attempt 1, 4.5s on attempt 2 for transient high demand to clear
            await new Promise(r => setTimeout(r, attempt * 2000 + 500));
          }
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error("All Gemini model attempts failed to generate a response.");
    }

    const rawText = response.text as string;

    // Robust JSON parsing with auto-repair for truncated responses
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (parseErr: any) {
      console.warn('[Recap] JSON parse failed, attempting auto-repair of truncated response...');
      // Try to repair common truncation: unclosed string → close it, then close objects/arrays
      let repaired = rawText;
      // Count unclosed brackets and braces
      let openBraces = 0, openBrackets = 0, inString = false, escaped = false;
      for (let ci = 0; ci < repaired.length; ci++) {
        const ch = repaired[ci];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\' && inString) { escaped = true; continue; }
        if (ch === '"' && !escaped) { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets--;
      }
      // If still inside a string, close it
      if (inString) repaired += '"';
      // Remove trailing comma before closing
      repaired = repaired.replace(/,\s*$/, '');
      // Close any open arrays and objects
      for (let bi = 0; bi < openBrackets; bi++) repaired += ']';
      for (let bi = 0; bi < openBraces; bi++) repaired += '}';
      try {
        parsedJson = JSON.parse(repaired);
        console.log(`[Recap] Auto-repair succeeded: recovered ${parsedJson?.recap_segments?.length ?? 0} segments from truncated response.`);
      } catch (repairErr) {
        // Last resort: return whatever partial segments we can extract
        const segMatch = rawText.match(/"recap_segments"\s*:\s*(\[.*)/s);
        if (segMatch) {
          let partial = segMatch[1];
          // Find last complete segment object
          const lastComplete = partial.lastIndexOf('},');
          if (lastComplete > 0) partial = partial.slice(0, lastComplete + 1) + ']';
          try {
            const segs = JSON.parse(partial);
            parsedJson = { movie_title: mediaFileName || 'Movie', total_recap_duration_est: '00:00', recap_segments: segs };
            console.log(`[Recap] Partial segment recovery: ${segs.length} segments salvaged.`);
          } catch (_) {
            throw new Error(`Gemini returned truncated JSON that could not be repaired: ${parseErr.message}`);
          }
        } else {
          throw new Error(`Gemini returned truncated JSON that could not be repaired: ${parseErr.message}`);
        }
      }
    }

    // Auto-normalize and ensure valid character roles/genders
    if (parsedJson && parsedJson.recap_segments && Array.isArray(parsedJson.recap_segments)) {
      for (const seg of parsedJson.recap_segments) {
        if (!seg.speaker_gender || seg.speaker_gender === 'narrator') {
          if (translationMode === 'word_by_word_lip_sync' || translationMode === 'character_dialogue' || translationMode === 'hybrid_recap_dub') {
            seg.speaker_gender = inferSpeakerGender(seg.khmer_script, seg.original_summary, seg.speaker_name);
            if (!seg.speaker_name || seg.speaker_name === 'អ្នកសម្រាយ') {
              seg.speaker_name = inferSpeakerName(seg.khmer_script, seg.original_summary, seg.speaker_gender);
            }
          }
        }
      }
    }

    return res.json(parsedJson);

  } catch (error: any) {
    console.error("Error generating Khmer movie recap:", error);
    const msg = error?.message || "";
    if (msg.includes("429") || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
      return res.status(429).json({
        error: "API Key របស់អ្នកបានឈានដល់កម្រិតកំណត់ Free Tier Quota (20 requests / ថ្ងៃ) របស់ Google AI Studio ហើយ។ សូមរង់ចាំ 30-60 វិនាទី ឬប្តូរប្រើ API Key ថ្មីផ្សេងទៀតនៅក្នុងប្រអប់ '🔑 ដាក់ API Key'!"
      });
    }
    if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE") || msg.includes("aborted")) {
      return res.status(503).json({
        error: "Google Gemini AI កំពុងមានអ្នកប្រើប្រាស់ច្រើន (High Demand)។ ប្រព័ន្ធកំពុង Auto-retry សូមចុចប៊ូតុង 'Generate' ម្តងទៀត!"
      });
    }
    return res.status(500).json({
      error: error.message || "An unexpected error occurred while generating the recap script."
    });
  }
});

// ==========================================
// AI Auto-Detect Character Genders & Roles Endpoint
// ==========================================
app.post("/api/recap/auto-detect-speakers", async (req, res) => {
  try {
    const { segments, movieTitle, translationMode, customApiKey } = req.body;
    const clientApiKey = ((req.headers['x-gemini-api-key'] as string) || customApiKey || "").trim();

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: "Segments array is required." });
    }

    const prompt = `You are an expert Movie Casting Director and Character Dialogue Speaker Classifier.
Movie Title: "${movieTitle || 'Movie'}"
Translation Mode: "${translationMode || 'word_by_word_lip_sync'}"

Analyze each of the following Khmer dialogue lines and foreign origin summaries to detect the EXACT character identity, age, and gender:
- "speaker_gender": MUST be one of ["male", "female", "child_boy", "child_girl", "male_elder", "female_elder", "villain"]
  * "male_elder" -> Old grandfather, old driver, senior man (e.g. ឡៅចាវ, លោកតា)
  * "female_elder" -> Old grandmother (លោកយាយ)
  * "female" -> Young/adult woman, mother, wife, female character (e.g. ឆេងយីង, ស្ត្រីជាម្តាយ)
  * "male" -> Young/adult man, police officer, young lead (e.g. លោកប៉ូលីស, បុរស)
  * "child_boy" -> Little boy, sick child (e.g. ស៊ាវប៉ៅ, កូនតូច)
  * "child_girl" -> Little girl
  * "villain" -> Aggressor, villain
  * (NEVER use "narrator" for character dialogue lines)
- "speaker_name": Exact name or role in Khmer (e.g. "ឡៅចាវ", "ឆេងយីង", "ស៊ាវប៉ៅ", "លោកប៉ូលីស", "តួប្រុស", "តួស្រី")

Input Segments:
${JSON.stringify(segments.map((s: any) => ({
  segment_id: s.segment_id,
  start_time: s.start_time,
  end_time: s.end_time,
  original_summary: s.original_summary,
  khmer_script: s.khmer_script,
  current_speaker: s.speaker_name || s.speaker_gender || ''
})), null, 2)}

Return JSON:
{
  "detected_segments": [
    {
      "segment_id": 1,
      "speaker_gender": "male_elder",
      "speaker_name": "ឡៅចាវ"
    }
  ]
}`;

    const candidateModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
    let lastError: any = null;
    let response: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const freshAi = getGenAIClient(clientApiKey);
          response = await freshAi.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  detected_segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        segment_id: { type: Type.INTEGER },
                        speaker_gender: { type: Type.STRING },
                        speaker_name: { type: Type.STRING }
                      },
                      required: ["segment_id", "speaker_gender", "speaker_name"]
                    }
                  }
                },
                required: ["detected_segments"]
              }
            }
          });
          if (response && response.text) break;
        } catch (err: any) {
          lastError = err;
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      // Fallback to local rule-based heuristic classification if AI model fails
      const fallbackDetected = segments.map((s: any) => ({
        segment_id: s.segment_id,
        speaker_gender: inferSpeakerGender(s.khmer_script, s.original_summary, s.speaker_name),
        speaker_name: s.speaker_name || inferSpeakerName(s.khmer_script, s.original_summary, inferSpeakerGender(s.khmer_script, s.original_summary, s.speaker_name))
      }));
      return res.json({ detected_segments: fallbackDetected, isFallback: true });
    }

    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (error: any) {
    console.error("Auto detect speakers error:", error);
    // Even if error occurs, provide heuristic fallback
    const fallbackDetected = (req.body?.segments || []).map((s: any) => ({
      segment_id: s.segment_id,
      speaker_gender: inferSpeakerGender(s.khmer_script, s.original_summary, s.speaker_name),
      speaker_name: s.speaker_name || inferSpeakerName(s.khmer_script, s.original_summary, inferSpeakerGender(s.khmer_script, s.original_summary, s.speaker_name))
    }));
    return res.json({ detected_segments: fallbackDetected, isFallback: true });
  }
});

// ==========================================
// 6. AI Script Doctor & Character Continuity Auto-Corrector
// ==========================================
app.post("/api/recap/proofread-script", async (req, res) => {
  try {
    const { segments, movieTitle, translationMode, customApiKey } = req.body;
    const clientApiKey = ((req.headers['x-gemini-api-key'] as string) || customApiKey || "").trim();
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: "Segments array is required for proofreading." });
    }

    const seriesContext = getSeriesContextAndCharactersFromDb(
      req.body.seriesTitle || req.body.folderName,
      movieTitle
    );

    let characterGlossaryHint = '';
    if (seriesContext.characterNames && seriesContext.characterNames.length > 0) {
      characterGlossaryHint = `
ESTABLISHED OFFICIAL CHARACTER NAMES FOR THIS SERIES (ឈ្មោះតួអង្គផ្លូវការក្នុងស៊េរីរឿងនេះ):
${seriesContext.characterNames.map(n => `- "${n}"`).join('\n')}
MANDATORY: If any mistaken names, typos, or wrong transliterations appear in the lines (e.g. "តា លីវ" or "ចាវ" instead of "ឡៅចៅ", or "ចេន គួយអ៊ីង" instead of "គុយអ៊ីង"), replace them in-place with the established official character name!
`;
    }

    const systemPrompt = `You are a Precision Khmer Dubbing Script Proofreader & Character Name Consistency Corrector (អ្នកជំនាញកែតម្រូវពាក្យខុស និងឈ្មោះតួអង្គចំៗពាក្យ).
${characterGlossaryHint}
CRITICAL INSTRUCTIONS:
1. **DO NOT REWRITE OR PARAPHRASE ENTIRE SENTENCES (ដាច់ខាតកុំសរសេរប្រយោគឡើងវិញទាំងមូល)**:
   - You must keep the user's original sentence phrasing, rhythm, vocabulary, and sentence structure 95%-100% untouched.
2. **TARGET ONLY SPECIFIC WRONG WORDS (កែប្រែចំតែពាក្យណាដែលខុសប៉ុណ្ណោះ)**:
   - **Character Name Inconsistencies**: If a character name is misspelled or differs across scenes (e.g. "កួយអុីង" vs "ចិន កុយអុីង", or "តា លីវ" vs "ឡៅចៅ"), replace ONLY that character name in-place with the unified correct established name.
   - **Spelling Typos & Subscript Errors**: Fix only misspelled words, missing subscript consonants (ជើងអក្សរ), or typo words in-place.
   - **Mismatched Gender / Pronouns**: If a female character is referred to as male or vice versa, adjust only that specific pronoun.
3. **LEAVE CORRECT SENTENCES COMPLETELY UNCHANGED**:
   - If a sentence has no typos or name errors, keep its "khmer_script" 100% identical.

Return valid JSON with "changes_count", "correction_summary" (explaining which specific words/names were fixed in Khmer), and "corrected_segments".`;

    const userPrompt = `Movie Title: "${movieTitle || 'Untitled Movie'}"
Translation Mode: "${translationMode || 'movie_recap'}"

Here are the current transcript segments to proofread for specific word typos and character name consistency:
${JSON.stringify(segments, null, 2)}

Please strictly identify specific mistaken words or mismatched names and correct ONLY those words in-place without rewriting the sentences.`;

    const candidateModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
    let lastError: any = null;
    let response: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const freshAi = getGenAIClient(clientApiKey);
          response = await freshAi.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  changes_count: { type: Type.INTEGER },
                  correction_summary: { type: Type.STRING },
                  corrected_segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        segment_id: { type: Type.INTEGER },
                        start_time: { type: Type.STRING },
                        end_time: { type: Type.STRING },
                        original_summary: { type: Type.STRING },
                        khmer_script: { type: Type.STRING },
                        voice_tone: { type: Type.STRING },
                        voice_emotion: { type: Type.STRING },
                        speaker_gender: { type: Type.STRING },
                        speaker_name: { type: Type.STRING },
                        speaker_type: { type: Type.STRING }
                      },
                      required: ["segment_id", "start_time", "end_time", "khmer_script"]
                    }
                  }
                },
                required: ["changes_count", "correction_summary", "corrected_segments"]
              }
            }
          });
          if (response && response.text) break;
        } catch (err: any) {
          console.warn(`Proofread Model ${modelName} (attempt ${attempt}) error:`, err.message || err);
          lastError = err;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error("Proofreading failed across all available Gemini models.");
    }

    const result = JSON.parse(response.text);
    return res.json(result);
  } catch (error: any) {
    console.error("Error proofreading recap script:", error);
    const msg = error?.message || "";
    if (msg.includes("429") || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
      return res.status(429).json({
        error: "API Key របស់អ្នកបានឈានដល់កម្រិតកំណត់ Free Tier Quota របស់ Google AI Studio ហើយ។ សូមប្តូរប្រើ API Key ថ្មីផ្សេងទៀតនៅក្នុងប្រអប់ '🔑 ដាក់ API Key'!"
      });
    }
    if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE") || msg.includes("aborted")) {
      return res.status(503).json({
        error: "Google Gemini AI កំពុងមានអ្នកប្រើប្រាស់ច្រើន (High Demand)។ សូមសាកល្បងចុចម្តងទៀត!"
      });
    }
    return res.status(500).json({ error: error.message || "Failed to proofread script" });
  }
});

app.post("/api/recap/refine-single-segment", async (req, res) => {
  try {
    const { segment, previousSegment, nextSegment, movieTitle, customApiKey } = req.body;
    const clientApiKey = ((req.headers['x-gemini-api-key'] as string) || customApiKey || "").trim();
    if (!segment || !segment.khmer_script) {
      return res.status(400).json({ error: "Segment with khmer_script is required." });
    }

    const seriesContext = getSeriesContextAndCharactersFromDb(
      req.body.seriesTitle || req.body.folderName,
      movieTitle
    );

    let characterGlossaryHint = '';
    if (seriesContext.characterNames && seriesContext.characterNames.length > 0) {
      characterGlossaryHint = `\nEstablished Official Character Names: ${seriesContext.characterNames.join(', ')}. If a mistaken character name appears (e.g. "តា លីវ" instead of "ឡៅចៅ", or "ចេន គួយអ៊ីង" instead of "គុយអ៊ីង"), replace it in-place with the correct established name!`;
    }

    const prompt = `You are a precision Khmer spelling and character name proofreader.
CRITICAL INSTRUCTION: DO NOT rewrite or replace the entire sentence. Keep the user's original sentence structure and words 95%-100% intact. ONLY find and correct specific misspelled words, typos, or wrong character names in-place!
Movie Title: "${movieTitle || 'Movie'}"${characterGlossaryHint}
Previous Line: "${previousSegment?.khmer_script || 'N/A'}"
Current Line: "${segment.khmer_script}" (Speaker: "${segment.speaker_name || 'Narrator'}")
Next Line: "${nextSegment?.khmer_script || 'N/A'}"

Return JSON: {"refined_script": "..."} containing the sentence with only the specific wrong words/names corrected in-place.`;

    const candidateModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
    let lastError: any = null;
    let response: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const freshAi = getGenAIClient(clientApiKey);
          response = await freshAi.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  refined_script: { type: Type.STRING }
                },
                required: ["refined_script"]
              }
            }
          });

          if (response && response.text) {
            break;
          }
        } catch (err: any) {
          console.warn(`Refine model ${modelName} (attempt ${attempt}) error:`, err.message || err);
          lastError = err;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error("Failed to refine segment across all available models.");
    }

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error("Refine single segment error:", error);
    const msg = error?.message || "";
    if (msg.includes("429") || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
      return res.status(429).json({
        error: "API Key របស់អ្នកបានឈានដល់កម្រិតកំណត់ Free Tier Quota របស់ Google AI Studio ហើយ។ សូមប្តូរប្រើ API Key ថ្មីផ្សេងទៀតនៅក្នុងប្រអប់ '🔑 ដាក់ API Key'!"
      });
    }
    if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE") || msg.includes("aborted")) {
      return res.status(503).json({
        error: "Google Gemini AI កំពុងមានអ្នកប្រើប្រាស់ច្រើន (High Demand)។ សូមសាកល្បងចុចកែសម្រួលម្តងទៀត!"
      });
    }
    return res.status(500).json({ error: error.message || "Failed to refine single segment." });
  }
});

// Secondary Endpoint: Optional Gemini TTS Audio Preview Endpoint
app.post("/api/tts/generate", async (req, res) => {
  try {
    const { text, voiceName } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text string is required for TTS." });
    }

    const ai = getGenAIClient();
    
    // Call gemini-3.1-flash-tts-preview
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Read with dramatic narrative voice: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO" as any],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || "Puck" }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: "Audio synthesis yielded empty result." });
    }

    return res.json({ audioBase64: base64Audio, mimeType: "audio/pcm" });
  } catch (error: any) {
    console.error("TTS generation error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate TTS audio." });
  }
});

// Vite & Production Static Middleware
async function setupApp() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
        watch: {
          ignored: [
            "**/data/**",
            "**/data/exports/**",
            "**/data/temp/**",
            "**/data/uploads/**",
            "**/*.db*",
            "**/*.mp4",
            "**/*.webm",
            "**/*.zip",
            "**/*.wav",
            "**/*.mp3",
            "**/*.srt",
            "**/.git/**"
          ]
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Locate the dist folder reliably across dev, electron asar, and unpacked environments
    const candidateDirs = [
      __dirname, // In compiled dist/server.cjs, __dirname is the dist folder
      path.join(__dirname, "dist"),
      path.join(process.cwd(), "dist"),
      path.join(process.cwd(), "app.asar.unpacked", "dist"),
      path.join(process.cwd(), "app.asar", "dist"),
      path.join(process.cwd(), "resources", "app.asar.unpacked", "dist"),
      path.join(process.cwd(), "resources", "dist")
    ];
    const distPath = candidateDirs.find((dir) => dir && fs.existsSync(path.join(dir, "index.html"))) || __dirname;
    console.log(`[Production] Serving static frontend from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend build not found. Please verify dist/index.html exists.");
      }
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

setupApp().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
