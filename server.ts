import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "credentialless");
  next();
});

// Helper to instantiate GoogleGenAI lazily
function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In-memory buffer cache for ultra-fast zero-latency TTS serving
const ttsMemoryCache = new Map<string, Buffer>();

// Proxy Endpoint for Khmer Text-To-Speech (Google Translate Neural TTS)
app.get("/api/tts", async (req, res) => {
  try {
    const rawText = (req.query.text as string) || "";
    if (!rawText.trim()) {
      return res.status(400).send("Text is required");
    }

    // Clean text for ultra-clear Khmer TTS speech synthesis (remove emojis, non-speech symbols)
    const cleanText = rawText
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^\u1780-\u17FFa-zA-Z0-9\s.,!?្៌៍៏័៎ិីឹឺុូួើឿៀេែៃោៅំះៈ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    // Check RAM cache for 0ms instant response
    if (ttsMemoryCache.has(cleanText)) {
      const cachedBuffer = ttsMemoryCache.get(cleanText)!;
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": cachedBuffer.length.toString(),
        "Cache-Control": "public, max-age=86400, immutable",
      });
      return res.status(200).send(cachedBuffer);
    }

    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=km&client=tw-ob&q=${encodeURIComponent(cleanText)}`;

    const fetchResponse = await fetch(googleTtsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!fetchResponse.ok) {
      return res.status(fetchResponse.status).send("Failed to fetch TTS audio");
    }

    const audioArrayBuffer = await fetchResponse.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    // Save to RAM cache
    if (ttsMemoryCache.size > 2000) {
      // Evict oldest entries if cache grows very large
      const firstKey = ttsMemoryCache.keys().next().value;
      if (firstKey) ttsMemoryCache.delete(firstKey);
    }
    ttsMemoryCache.set(cleanText, audioBuffer);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
      "Cache-Control": "public, max-age=86400, immutable",
    });

    res.status(200).send(audioBuffer);
  } catch (err: any) {
    console.error("Error in /api/tts proxy:", err);
    res.status(500).send("Internal Server Error during TTS generation");
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

    const ai = getGenAIClient();

    const styleGuideMap: Record<string, string> = {
      dramatic_action: "Fast-paced action, intense suspense, explosive plot reveals, dynamic tension (បែបសកម្មភាពស្ពាន និងរន្ធត់).",
      emotional_romance: "Heartfelt, dramatic romance, emotional resonance, tear-jerking narrative (បែបមនោសញ្ចេតនាយ៉ាងស៊ីជម្រៅ).",
      dark_mystery: "Eerie horror, dark thriller, mysterious suspense, ominous atmosphere (បែបអាថ៌កំបាំងរន្ធត់ព្រឺព្រួច).",
      fast_comedy: "Energetic, humorous, snappy recap style with funny commentary (បែបកំប្លែងលឿនរហ័ស).",
      intense_thriller: "High stakes, psychological mind games, betrayals, cliffhangers (បែបប្រញាប់ប្រញាល់វ៉ៃប្រហារនិងកាត់ក្តី)."
    };

    const chosenStyleDesc = styleGuideMap[recapStyle] || styleGuideMap.dramatic_action;
    const langPrompt = sourceLanguage && sourceLanguage !== 'auto' ? `Source language is: ${sourceLanguage}.` : 'Source audio/video language may be English, Chinese, Korean, or Thai. Please auto-detect.';

    let modeInstruction = "";
    if (translationMode === 'character_dialogue') {
      modeInstruction = `
CRITICAL TRANSLATION MODE: CHARACTER-BY-CHARACTER DIALOGUE DUBBING (ការបកប្រែសន្ទនាតាមតួអង្គនិយាយផ្ទាល់ / Movie Dubbing):
- STRICTLY TRANSLATE each character's actual spoken dialogue line-by-line into natural, conversational, and emotional Khmer dialogue.
- Do NOT write general third-person narration. Instead, capture the exact words and emotions each character speaks in the scene.
- Accurately name every speaking character in "speaker_name" (e.g. "ឆេងអ៊ី (Chengyi)", "ស៊ាវម៉ី (Xiaomei)", "មេបញ្ជាការ", "ទាហាន", "ប៉ូលីស").
- Correctly set "speaker_gender" ("male" for male characters, "female" for female characters).
- Accurately align timestamps (start_time & end_time) to the exact speech audio and lip movements in the video.
- Ensure natural Cambodian voice-dubbing phrases with genuine human emotions (humor, anger, sadness, surprise).
`;
    } else if (translationMode === 'hybrid_recap_dub') {
      modeInstruction = `
CRITICAL TRANSLATION MODE: HYBRID RECAP + CHARACTER DIALOGUE (ទម្រង់កូនកាត់: សម្រាយសាច់រឿង + ការសន្ទនាតួអង្គផ្ទាល់):
- Masterfully combine narrator storytelling with direct character voice dialogue for maximum cinematic impact!
- Use "speaker_type": "narrator" segments for fast scene pacing, action recapping, and setting the atmosphere.
- Switch to "speaker_type": "male" or "female" character segments for punchy, dramatic, or funny direct character quotes and dialogue moments.
- Clearly identify each character in "speaker_name" and set appropriate "speaker_gender".
`;
    } else {
      modeInstruction = `
CRITICAL TRANSLATION MODE: MOVIE RECAP NARRATION (សម្រាយរឿងបែបនិទាន - Standard Pro Recapper Style):
- Act as an engaging, charismatic Khmer movie recap narrator telling the whole story with suspense and drama.
- Weave background actions, motivations, and plot twists into an irresistible narrative flow.
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
3. Open the recap with a smooth bridge phrase referencing previous events (e.g., "បន្តពីភាគមុន...", "បន្ទាប់ពីព្រឹត្តិការណ៍ភាគមុន...").
`;
    }

    const systemPrompt = `
You are an expert Master Movie Recap Scriptwriter, Dialogue Translator, and Dubbing Director specializing in converting foreign movie videos, audio tracks, subtitles, or transcripts into 100% ACCURATE, highly engaging, and grammatically flawless Cambodian (Khmer) scripts and dubbing lines.

${modeInstruction}

CRITICAL KHMER SCRIPTWRITING & ACCURACY MANDATES:
1. 100% Plot & Dialogue Accuracy (ភាពត្រឹមត្រូវខ្ពស់បំផុតតាមសាច់រឿង):
   - Analyze the visual action, foreign spoken dialogue, character names, and scene context with absolute precision.
   - Do NOT invent false plot points, make assumptions, or hallucinate unrelated storylines.
   - Ensure all character motivations, key plot twists, actions, and spoken dialogue match the true events in the movie clip.

2. Perfect Khmer Grammar & Natural Expression (ប្រយោគត្រឹមត្រូវ និងភាសាធម្មជាតិ):
   - Write clear, grammatically sound, and elegant Khmer sentences that sound completely natural when spoken by a human narrator.
   - Avoid awkward literal machine translations; use authentic Cambodian storytelling expressions and smooth transitional phrases (e.g. "រឿងរ៉ាវបានចាប់ផ្ដើមឡើងដោយ...", "ភ្លាមៗនោះ...", "ចំណែកឯ...", "មិននឹកស្មានថា...", "ចុងក្រោយប្រែជា...").
   - Structure sentences cleanly without run-ons or fragmented clauses so Text-to-Speech (TTS) voice engines pronounce them with high clarity and human-like flow.
${continuityPrompt}
3. Character Role & Voice Gender Detection (ស្រី / ប្រុស / អ្នកសម្រាយ):
   - Distinguish character voice dialogue from overall narrator commentary:
     * "narrator" (អ្នកសម្រាយរឿង) - Overall movie recap narration
     * "male" (តួប្រុស / Male Character) - Dialogue spoken by or representing male characters
     * "female" (តួស្រី / Female Character) - Dialogue spoken by or representing female characters
     * "multi" (តួប្រុស & តួស្រី) - Multi-character interaction scenes
   - Assign exact "speaker_gender" ("male" | "female" | "narrator" | "multi") and "speaker_name" for each scene segment.

4. Timestamp Precision & Scene Beats:
   - Provide precise timestamp scene segments (start_time & end_time in MM:SS format) aligning directly with key plot developments in the video.

5. Style & Target Goal:
   - Style: ${chosenStyleDesc}
   - Estimated target duration: ~${targetDurationMin || 3} minutes.
   - User Specific Notes: ${customNotes || 'Ensure top accuracy and smooth Khmer voice narration.'}

6. REQUIRED OUTPUT FORMAT:
   You MUST return a JSON object strictly following this structure:
   - movie_title: A catchy title in Khmer/English for this movie recap (include episode number if applicable)
   - total_recap_duration_est: Formatted string like "03:45" or "05:00"
   - recap_segments: Array of recap chunks sequentially organized with:
     * segment_id: Integer (1, 2, 3...)
     * start_time: Timestamp "MM:SS"
     * end_time: Timestamp "MM:SS"
     * original_summary: A concise 1-2 sentence English plot summary of what happens in this scene
     * khmer_script: The dramatic, 100% accurate Khmer recap narration text (អត្ថបទសម្រាយរឿងជាភាសាខ្មែរ)
     * voice_tone: One of ["dramatic", "excited", "neutral", "tense", "emotional", "mysterious"]
     * speaker_gender: One of ["male", "female", "narrator", "multi"]
     * speaker_name: Name or role string (e.g. "អ្នកសម្រាយរឿង", "តួប្រុស", "តួស្រី")
     * speaker_type: One of ["narrator", "male", "female", "multi"]
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

    textInstruction += `\nPlease analyze the provided ${hasMedia ? "movie video/audio media" : "transcript"} and generate the complete, dramatic Khmer recap script JSON according to the schema.`;

    requestParts.push({ text: textInstruction });

    // Try models in order of preference
    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError: any = null;
    let response: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
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
        console.warn(`Model ${modelName} failed, trying next candidate:`, err.message || err);
        lastError = err;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All Gemini model attempts failed to generate a response.");
    }

    const parsedJson = JSON.parse(response.text);
    return res.json(parsedJson);

  } catch (error: any) {
    console.error("Error generating Khmer movie recap:", error);
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
