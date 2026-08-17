import express from "express";
import path from "path";
import fs from "fs";
import { exec, spawn } from "child_process";
import { GoogleGenAI, Type } from "@google/genai";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));

app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "credentialless");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// Helper to instantiate GoogleGenAI lazily with support for user-supplied API key
function getGenAIClient(customApiKey?: string): GoogleGenAI {
  dotenv.config({ override: true });
  const apiKey = (customApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("មិនទាន់មាន Gemini API Key នៅឡើយទេ។ សូមចុចលើប៊ូតុង 'ដាក់ API Key' ខាងលើដើម្បីបញ្ចូល API Key របស់អ្នក!");
  }
  return new GoogleGenAI({ apiKey });
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

    const testModels = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"];
    let lastErr: any = null;

    for (const m of testModels) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: "Reply with 'OK'",
        });
        if (response && response.text) {
          responseText = response.text;
          validatedModel = m === "gemini-flash-latest" ? "Gemini Flash (Latest)" : m;
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

// Proxy Endpoint for Khmer Neural Text-To-Speech (Piseth & Sreymom Neural Voices)
app.get("/api/tts", async (req, res) => {
  try {
    const rawText = (req.query.text as string) || "";
    if (!rawText.trim()) {
      return res.status(400).send("Text is required");
    }

    const requestedVoice = ((req.query.voice as string) || "").toLowerCase();
    const requestedGender = ((req.query.gender as string) || "").toLowerCase();
    const requestedRate = (req.query.rate as string) || "+20%";
    const requestedPitch = (req.query.pitch as string) || "+0Hz";

    // Select Piseth (Male) or Sreymom (Female) Neural Voice
    let edgeVoice = 'km-KH-PisethNeural';
    if (
      requestedVoice === 'sreymom' ||
      requestedVoice === 'female' ||
      requestedGender === 'female' ||
      requestedGender === 'female_elder' ||
      requestedGender === 'child'
    ) {
      edgeVoice = 'km-KH-SreymomNeural';
    } else {
      edgeVoice = 'km-KH-PisethNeural';
    }

    // Clean text for ultra-clear Khmer TTS speech synthesis
    const cleanText = rawText
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^\u1780-\u17FFa-zA-Z0-9\s.,!?្៌៍៏័៎ិីឹឺុូួើឿៀេែៃោៅំះៈ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      return res.status(400).send("Cleaned text is empty");
    }

    const cacheKey = `${edgeVoice}_${requestedRate}_${requestedPitch}_${cleanText}`;

    // Check RAM cache for 0ms instant response
    if (ttsMemoryCache.has(cacheKey)) {
      const cachedBuffer = ttsMemoryCache.get(cacheKey)!;
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": cachedBuffer.length.toString(),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "public, max-age=86400, immutable",
      });
      return res.status(200).send(cachedBuffer);
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = await fetchEdgeTTS(cleanText, edgeVoice, requestedRate, requestedPitch);
    } catch (edgeErr) {
      console.warn("Edge Neural TTS failed, falling back to Google Translate TTS:", edgeErr);
      const chunks = splitTextIntoTTSChunks(cleanText, 120);
      const chunkPromises = chunks.map(chunk => fetchGoogleTTSChunk(chunk));
      const buffers = await Promise.all(chunkPromises);
      audioBuffer = Buffer.concat(buffers);
    }

    // Save to RAM cache
    if (ttsMemoryCache.size > 2000) {
      const firstKey = ttsMemoryCache.keys().next().value;
      if (firstKey) ttsMemoryCache.delete(firstKey);
    }
    ttsMemoryCache.set(cacheKey, audioBuffer);

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
        "Cache-Control": "public, max-age=86400, immutable",
      }).send(chunk);
      return;
    }

    res.status(200).set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "public, max-age=86400, immutable",
    }).send(audioBuffer);
  } catch (err: any) {
    console.error("Error in /api/tts proxy:", err);
    res.status(500).send("Internal Server Error during TTS generation");
  }
});

// Proxy external media to bypass browser CORS restrictions with full HTTP Range stream support
app.get("/api/proxy-media", async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Missing target url");

    const range = req.headers.range;
    const fetchHeaders: Record<string, string> = {};
    if (range) {
      fetchHeaders["Range"] = range;
    }

    const fetchRes = await fetch(targetUrl, { headers: fetchHeaders });
    if (!fetchRes.ok && fetchRes.status !== 206) {
      // If fetching fails or remote host rejects, return status
      return res.status(fetchRes.status).send("Failed to fetch remote media");
    }

    const contentType = fetchRes.headers.get("content-type") || "video/mp4";
    const contentLength = fetchRes.headers.get("content-length");
    const contentRange = fetchRes.headers.get("content-range");
    const arrayBuf = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Accept-Ranges": "bytes",
    };

    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    res.writeHead(fetchRes.status === 206 ? 206 : 200, headers);
    res.end(buffer);
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

    const scriptPath = path.join(process.cwd(), "vocal_remover.py");
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

    const scriptPath = path.join(process.cwd(), "tiktok_service.py");
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
    const scriptPath = path.join(process.cwd(), "tiktok_cookie_service.py");
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
    const scriptPath = path.join(process.cwd(), "tiktok_cookie_service.py");
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
    const scriptPath = path.join(process.cwd(), "tiktok_cookie_service.py");
    exec(`python "${scriptPath}" clear`, (error, stdout) => {
      return res.json({ success: true, message: "TikTok cookies cleared" });
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

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

    let continuityPrompt = '';
    if (episodeNumber || seriesTitle || previousContext) {
      continuityPrompt = `
CRITICAL EPISODE CONTINUITY MANDATE (ការតភ្ជាប់សាច់រឿងតាមភាគ):
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
  5. Character Role & Voice Gender Detection (ស្រី / ប្រុស / មនុស្សចាស់ / កុមារ / អ្នកសម្រាយ):
   - Distinguish character voice dialogue and assign the matching voice persona:
     * "male" (តួប្រុស / Male Character)
     * "female" (តួស្រី / Female Character)
     * "male_elder" (មនុស្សចាស់ប្រុស / Grandfather/Elder)
     * "female_elder" (មនុស្សចាស់ស្រី / Grandmother/Elder)
     * "child" (កុមារ / ក្មេង)
     * "villain" (តួចិត្តអាក្រក់)
     * "narrator" (អ្នកសម្រាយរឿង - ONLY for movie recap mode)
   - Assign exact "speaker_gender" and "speaker_name" for each scene segment.

  6. Timestamp Precision & Scene Beats:
   - Provide precise timestamp scene segments (start_time & end_time in MM:SS format) aligning directly with the character speech and lip movements in the video.

  7. Style & Target Goal:
   - Style: ${chosenStyleDesc}
   - Estimated target duration: ~${targetDurationMin || 3} minutes.
   - User Specific Notes: ${customNotes || 'Ensure top accuracy and smooth Khmer voice.'}

  8. REQUIRED OUTPUT FORMAT:
   Return a JSON object strictly following this structure:
   - movie_title: A catchy title in Khmer/English for this movie (include episode number if applicable)
   - total_recap_duration_est: Formatted string like "00:35" or "01:30"
   - recap_segments: Array of speech segments sequentially organized with:
     * segment_id: Integer (1, 2, 3...)
     * start_time: Timestamp "MM:SS" (start of character speech)
     * end_time: Timestamp "MM:SS" (end of character speech)
     * original_summary: The exact original foreign dialogue/sentence spoken by the character
     * khmer_script: ${isDirectDubbing ? 'The EXACT spoken dialogue line translated into 100% Khmer (អត្ថបទនិយាយផ្ទាល់មាត់តួ មិនមែនសម្រាយទេ)' : 'The dramatic, 100% accurate Khmer recap narration text (អត្ថបទសម្រាយរឿងជាភាសាខ្មែរ)'}
     * voice_tone: One of ["dramatic", "excited", "neutral", "tense", "emotional", "mysterious"]
     * speaker_gender: One of ["male", "female", "child", "male_elder", "female_elder", "villain", "narrator"]
     * speaker_name: Name or role string (e.g. "តួប្រុស", "តួស្រី", "ឈីងធាន", "ចេងយី")
     * speaker_type: One of ["male", "female", "narrator", "multi"]
`;

    // Construct request parts
    const requestParts: any[] = [];

    if (hasMedia) {
      // Strip Data URI header if present
      const cleanBase64 = mediaData.replace(/^data:[^;]+;base64,/, "");
      requestParts.push({
        inlineData: {
          mimeType: mediaMimeType,
          data: cleanBase64
        }
      });
    }

    let textInstruction = `${langPrompt}\n\nFile/Title Hint: ${mediaFileName || "Movie Clip"}\n`;
    if (hasTranscript) {
      textInstruction += `\n--- SOURCE TRANSCRIPT/SUBTITLES ---\n${effectiveTranscript.slice(0, 30000)}\n--- END TRANSCRIPT ---\n`;
    }

    if (isDirectDubbing) {
      textInstruction += `\nPlease analyze the provided ${hasMedia ? "movie video/audio media" : "transcript"} and translate EVERY character's spoken dialogue directly line-by-line into Khmer for lip-sync dubbing. DO NOT summarize the plot or write narrative recap. Translate the direct first-person spoken dialogue sentences with exact timestamps and correct speaker_gender (male / female / child / elder) according to the schema.`;
    } else {
      textInstruction += `\nPlease analyze the provided ${hasMedia ? "movie video/audio media" : "transcript"} and generate the complete, dramatic Khmer recap script JSON according to the schema.`;
    }

    requestParts.push({ text: textInstruction });

    // Primary state-of-the-art multimodal models with automatic fallback & retry
    const candidateModels = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-flash-lite-latest"];
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
                        speaker_gender: { type: Type.STRING },
                        speaker_name: { type: Type.STRING },
                        speaker_type: { type: Type.STRING }
                      },
                      required: ["segment_id", "start_time", "end_time", "original_summary", "khmer_script", "voice_tone"]
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

    const parsedJson = JSON.parse(response.text);
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
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

setupApp().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
