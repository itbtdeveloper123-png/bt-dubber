import os
import sys
import json
import asyncio
import tempfile
import traceback
import subprocess
import re
import shutil
import zipfile
from pathlib import Path

# Force UTF-8 encoding on Windows to prevent UnicodeEncodeError with Khmer text
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Configure local data and temp directories
DATA_DIR = os.environ.get("APP_DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DATA_TEMP_DIR = os.environ.get("TEMP") or os.path.join(DATA_DIR, "temp")
os.makedirs(DATA_TEMP_DIR, exist_ok=True)
tempfile.tempdir = DATA_TEMP_DIR

# Locate FFmpeg binary from imageio_ffmpeg
try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = "ffmpeg"

def parse_timecode_to_seconds(tc):
    if not tc:
        return 0.0
    try:
        parts = str(tc).strip().replace(',', '.').split(':')
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        return float(parts[0])
    except Exception:
        return 0.0

def fetch_kiritts_audio(text, voice_name, output_path):
    """Fetch audio directly from KiriTTS API for video segment rendering"""
    try:
        import urllib.request
        import json
        api_key = os.environ.get("KIRITTS_API_KEY", "").strip()
        if not api_key:
            return False
        clean_voice = voice_name.replace("kiri_", "")
        api_url = os.environ.get("KIRITTS_API_URL", "https://api.kiritts.com/v1").rstrip("/") + "/audio/speech"
        data = json.dumps({
            "model": "tts-1",
            "input": text,
            "voice": clean_voice,
            "response_format": "mp3"
        }).encode("utf-8")
        req = urllib.request.Request(
            api_url,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "BT-Dubber-Renderer/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                with open(output_path, "wb") as f:
                    f.write(response.read())
                return True
    except Exception as e:
        sys.stderr.write(f"KiriTTS video render error: {e}\n")
    return False

def fetch_voxcpm_audio(text, colab_url, preset_id, gender, sample_path, output_path):
    """Fetch audio directly from Colab VoxCPM2 API for video segment rendering"""
    try:
        import urllib.request
        import json
        import base64
        url = (colab_url or os.environ.get("VOXCPM2_API_URL", "")).strip().rstrip("/")
        if not url:
            return False
        
        audio_b64 = ""
        if sample_path and os.path.exists(sample_path):
            with open(sample_path, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode("utf-8")
                
        api_url = f"{url}/api/clone-voice"
        payload = {
            "text": text,
            "target_audio_base64": audio_b64,
            "preset_id": preset_id or ("female_sweet" if gender == "female" else "male_hero"),
            "gender": gender or "male",
            "model": "voxcpm2"
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            api_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "BT-Dubber-Renderer/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=45) as response:
            if response.status == 200:
                res_data = json.loads(response.read().decode("utf-8"))
                if res_data.get("audio_base64"):
                    with open(output_path, "wb") as f:
                        f.write(base64.b64decode(res_data["audio_base64"]))
                    return True
    except Exception as e:
        sys.stderr.write(f"VoxCPM video render notice: {e}\n")
    return False

async def generate_segment_tts_audio(text, gender, output_path, speed_rate="+25%", emotion="neutral"):
    """Generate Edge TTS, KiriTTS or VoxCPM2 audio file for Khmer speech line with dynamic emotion expressiveness"""
    try:
        import edge_tts
        import re
        voice = "km-KH-SreymomNeural"
        pitch_num = 0
        g = (gender or "narrator").lower()
        
        is_kiri = False
        kiri_voice = "Chanda"
        is_voxcpm = False
        voxcpm_colab_url = ""
        voxcpm_preset_id = ""
        voxcpm_gender = "male"
        
        if g.startswith("kiri_"):
            is_kiri = True
            kiri_voice = g.replace("kiri_", "")

        sample_file_path = None
        if g.startswith("voice_"):
            try:
                import sqlite3
                conn = sqlite3.connect("data/dubber.db")
                c = conn.cursor()
                c.execute("SELECT base_voice, pitch_offset, speed_rate, sample_file_name, provider, kiri_voice_id, colab_url, gender, sample_audio_url, audio_base64 FROM cloned_voices WHERE id = ?", (gender,))
                row = c.fetchone()
                conn.close()
                if row:
                    if len(row) > 4 and (row[4] == 'kiri' or (row[0] and row[0].startswith('kiri_')) or (len(row) > 5 and row[5])):
                        is_kiri = True
                        kiri_voice = (row[5] if len(row) > 5 and row[5] else row[0] or "Chanda").replace("kiri_", "")
                    elif len(row) > 4 and (row[4] == 'voxcpm2' or (len(row) > 6 and row[6])):
                        is_voxcpm = True
                        voxcpm_colab_url = (row[6] if len(row) > 6 and row[6] else os.environ.get("VOXCPM2_API_URL", "")).strip()
                        voxcpm_gender = row[7] if len(row) > 7 and row[7] else ("female" if "ស្រី" in g or "female" in g else "male")
                        s_url = row[8] if len(row) > 8 and row[8] else ""
                        a_b64 = row[9] if len(row) > 9 and row[9] else ""
                        if s_url.startswith("preset:"):
                            voxcpm_preset_id = s_url.replace("preset:", "")
                        elif a_b64.startswith("preset:"):
                            voxcpm_preset_id = a_b64.replace("preset:", "")
                        if len(row) > 3 and row[3]:
                            s_path = os.path.join("data", "cloned_voices", row[3])
                            if os.path.exists(s_path):
                                sample_file_path = s_path
                    else:
                        voice = row[0] or "km-KH-PisethNeural"
                        pitch_num = row[1] or 0
                        if len(row) > 3 and row[3]:
                            s_path = os.path.join("data", "cloned_voices", row[3])
                            if os.path.exists(s_path):
                                sample_file_path = s_path
            except Exception as e:
                sys.stderr.write(f"Cloned voice db lookup notice: {e}\n")
        elif g in ["child_boy", "boy", "kid_boy"]:
            voice = "km-KH-PisethNeural"
            pitch_num = 30
            try:
                import sqlite3
                conn = sqlite3.connect("data/dubber.db")
                c = conn.cursor()
                c.execute("SELECT sample_file_name FROM cloned_voices WHERE gender = 'male' ORDER BY created_at DESC LIMIT 1")
                row = c.fetchone()
                conn.close()
                if row and row[0]:
                    s_path = os.path.join("data", "cloned_voices", row[0])
                    if os.path.exists(s_path):
                        sample_file_path = s_path
            except Exception:
                pass
        elif g in ["child_girl", "girl", "kid_girl", "child", "kid"]:
            voice = "km-KH-SreymomNeural"
            pitch_num = 36
            try:
                import sqlite3
                conn = sqlite3.connect("data/dubber.db")
                c = conn.cursor()
                c.execute("SELECT sample_file_name FROM cloned_voices WHERE gender = 'female' ORDER BY created_at DESC LIMIT 1")
                row = c.fetchone()
                conn.close()
                if row and row[0]:
                    s_path = os.path.join("data", "cloned_voices", row[0])
                    if os.path.exists(s_path):
                        sample_file_path = s_path
            except Exception:
                pass
        elif g in ["male", "man"]:
            voice = "km-KH-PisethNeural"
            pitch_num = -5
        elif g in ["male_elder", "elder"]:
            voice = "km-KH-PisethNeural"
            pitch_num = -20
        elif g in ["female_elder"]:
            voice = "km-KH-SreymomNeural"
            pitch_num = -10
        elif g in ["villain"]:
            voice = "km-KH-PisethNeural"
            pitch_num = -30

        # Emotion pitch and rate offset calculation
        emo = (emotion or "neutral").lower()
        emo_pitch_offset = 0
        emo_rate_offset = 0
        if emo in ["angry", "aggressive"]:
            emo_pitch_offset = 18
            emo_rate_offset = 15
        elif emo in ["sad", "crying", "emotional"]:
            emo_pitch_offset = -14
            emo_rate_offset = -12
        elif emo in ["excited", "happy"]:
            emo_pitch_offset = 14
            emo_rate_offset = 12
        elif emo in ["fear", "tense", "shocked"]:
            emo_pitch_offset = 16
            emo_rate_offset = 8
        elif emo in ["whisper", "mysterious"]:
            emo_pitch_offset = -16
            emo_rate_offset = -10
        elif emo in ["dramatic"]:
            emo_pitch_offset = 10
            emo_rate_offset = 15

        # For Cloned Voices, lock pitch 100% stable so character identity never shifts
        if sample_file_path:
            emo_pitch_offset = 0
            emo_rate_offset = int(round(emo_rate_offset * 0.3))

        final_pitch_num = pitch_num + emo_pitch_offset
        pitch = f"+{final_pitch_num}Hz" if final_pitch_num >= 0 else f"{final_pitch_num}Hz"

        # Calculate speed rate with emotion
        base_rate_num = 25
        try:
            m = re.search(r'([+-]?\d+)', speed_rate)
            if m:
                base_rate_num = int(m.group(1))
        except:
            pass
        final_rate_num = max(-20, min(60, base_rate_num + emo_rate_offset))
        rate_str = f"+{final_rate_num}%" if final_rate_num >= 0 else f"{final_rate_num}%"
            
        if is_voxcpm:
            if fetch_voxcpm_audio(text, voxcpm_colab_url, voxcpm_preset_id, voxcpm_gender, sample_file_path, output_path):
                return True
            sys.stderr.write(f"VoxCPM synthesis failed for '{text[:20]}...', falling back to Edge Neural TTS\n")

        if is_kiri:
            if fetch_kiritts_audio(text, kiri_voice, output_path):
                return True
            sys.stderr.write(f"KiriTTS synthesis failed for '{text[:20]}...', falling back to Edge TTS\n")

        communicate = edge_tts.Communicate(text, voice, rate=rate_str, pitch=pitch)
        await communicate.save(output_path)
        return True
    except Exception as e:
        sys.stderr.write(f"TTS gen notice for '{text[:20]}...': {e}\n")
        return False

def escape_ffmpeg_filter_path(p):
    """Escape Windows path for FFmpeg filtergraph (e.g. D\\:/path/to/file)"""
    if not p:
        return ""
    abs_p = os.path.abspath(p).replace("\\", "/")
    # In ffmpeg filter arguments, colons and special characters must be escaped with \
    return abs_p.replace(":", "\\:")

def get_khmer_font_path():
    """Find the best available Khmer TrueType font for FFmpeg drawtext and libass"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(DATA_DIR, "fonts", "KantumruyPro-Bold.ttf"),
        os.path.join(DATA_DIR, "fonts", "Battambang-Bold.ttf"),
        os.path.join(DATA_DIR, "fonts", "Moul-Regular.ttf"),
        os.path.join(base_dir, "data", "fonts", "KantumruyPro-Bold.ttf"),
        os.path.join(base_dir, "data", "fonts", "Battambang-Bold.ttf"),
        os.path.join(base_dir, "data", "fonts", "Moul-Regular.ttf"),
        os.path.join(base_dir, "fonts", "KantumruyPro-Bold.ttf"),
        "C:/Windows/Fonts/KhmerUI.ttf",
        "C:/Windows/Fonts/KhmerUIb.ttf",
        "C:/Windows/Fonts/Nirmala.ttf",
        "C:/Windows/Fonts/NirmalaB.ttf",
        "C:/Windows/Fonts/LeelawUI.ttf",
        "C:/Windows/Fonts/LEELAWDB.TTF",
        "C:/Windows/Fonts/arial.ttf"
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)
    return ""

def get_khmer_fonts_dir():
    """Return fonts directory path for libass fontsdir parameter"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(DATA_DIR, "fonts"),
        os.path.join(base_dir, "data", "fonts"),
        os.path.join(base_dir, "fonts")
    ]
    for d in candidates:
        if d and os.path.exists(d):
            return os.path.abspath(d)
    return ""

def probe_video_stream(video_path):
    """Probe video dimensions and aspect ratio using FFprobe/FFmpeg"""
    try:
        cmd = [FFMPEG_EXE, "-i", video_path]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out = res.stderr or res.stdout
        match = re.search(r'Video:.*,\s*(\d{2,5})x(\d{2,5})', out)
        if match:
            w = int(match.group(1))
            h = int(match.group(2))
            return {"width": w, "height": h, "is_portrait": h > w}
    except Exception as e:
        sys.stderr.write(f"Probe video error: {e}\n")
    return {"width": 1920, "height": 1080, "is_portrait": False}

def get_optimal_video_encoder():
    """Detect and select the fastest available hardware video encoder (Intel QSV, NVENC, or CPU ultrafast)"""
    candidates = [
        ["-c:v", "h264_qsv", "-global_quality", "22", "-look_ahead", "0"],
        ["-c:v", "h264_nvenc", "-preset", "p1", "-cq", "22"],
        ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-threads", "0"]
    ]
    for enc_opt in candidates:
        enc = enc_opt[1]
        try:
            cmd = [FFMPEG_EXE, "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.05", *enc_opt, "-f", "null", "-"]
            r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if r.returncode == 0:
                sys.stderr.write(f"⚡ [Hardware Accelerator] Using ultra-fast encoder: {enc}\n")
                return enc_opt
        except Exception:
            pass
    return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-threads", "0"]

def generate_ass_subtitle_file(segments, output_ass_path, style_config=None, movie_title="BT-Dubber Subtitles"):
    style = style_config or {}
    font_family = style.get("fontFamily") or "Kantumruy Pro"
    if font_family in ["sans-serif", "system-ui", "Arial", "Default"]:
        font_family = "Kantumruy Pro"
    
    font_size_map = {"sm": "34", "md": "40", "lg": "48", "xl": "56"}
    font_size = font_size_map.get(style.get("fontSize", "lg"), "46")
    
    def hex_to_ass(hex_val, default="&H00FFFFFF&"):
        if not hex_val or not hex_val.startswith("#"):
            return default
        clean = hex_val.replace("#", "")
        if len(clean) == 6:
            r, g, b = clean[0:2], clean[2:4], clean[4:6]
            return f"&H00{b}{g}{r}&"
        return default
        
    primary_color = hex_to_ass(style.get("textColor", "#FFFFFF"), "&H00FFFFFF&")
    outline_color = hex_to_ass(style.get("strokeColor", "#000000"), "&H00000000&")
    highlight_color = hex_to_ass(style.get("highlightColor", "#FACC15"), "&H0015CCFA&")
    
    pos = style.get("position", "bottom")
    alignment = 2 if pos == "bottom" else (8 if pos == "top" else 5)
    margin_v = 45 if pos == "bottom" else (40 if pos == "top" else 0)
    
    lines = [
        "[Script Info]",
        f"; Script generated by BT-Dubber AI Studio",
        f"Title: {movie_title}",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.601",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{font_family},{font_size},{primary_color},{highlight_color},{outline_color},&H90000000,1,0,0,0,100,100,0,0,1,3.5,1.5,{alignment},40,40,{margin_v},1",
        f"Style: Narrator,{font_family},{font_size},&H00E0E7FF&,&H004338CA&,&H001E1B4B&,&H90000000,1,0,0,0,100,100,0,0,1,3.5,1.5,{alignment},40,40,{margin_v},1",
        f"Style: Female,{font_family},{font_size},&H00FCE7F3&,&H00BE185D&,&H00500724&,&H90000000,1,0,0,0,100,100,0,0,1,3.5,1.5,{alignment},40,40,{margin_v},1",
        f"Style: Male,{font_family},{font_size},&H00DBEAFE&,&H001D4ED8&,&H00172554&,&H90000000,1,0,0,0,100,100,0,0,1,3.5,1.5,{alignment},40,40,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]
    
    def format_ass_time(sec):
        sec = max(0.0, float(sec))
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = int(sec % 60)
        cs = int(round((sec % 1) * 100))
        if cs >= 100:
            cs = 99
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"
        
    for seg in segments:
        script = seg.get("khmer_script", "").strip()
        if not script:
            continue
        start_sec = parse_timecode_to_seconds(seg.get("start_time", 0))
        end_sec = parse_timecode_to_seconds(seg.get("end_time", 0))
        if end_sec <= start_sec:
            end_sec = start_sec + 2.5
            
        g = (seg.get("speaker_gender") or "").lower()
        style_name = "Narrator" if g == "narrator" else ("Female" if "female" in g else ("Male" if "male" in g else "Default"))
        speaker = seg.get("speaker_name", "")
        prefix = f"{{\\c{highlight_color}}}[{speaker}]:{{\\r}} " if speaker and speaker != "អ្នកសម្រាយ" else ""
        clean_text = script.replace("\n", " ").replace("\r", "")
        
        lines.append(f"Dialogue: 0,{format_ass_time(start_sec)},{format_ass_time(end_sec)},{style_name},,0,0,0,,{prefix}{clean_text}")
        
    # Write with UTF-8 BOM (utf-8-sig) so libass in FFmpeg handles Khmer vowels and subscript ligatures flawlessly
    with open(output_ass_path, "w", encoding="utf-8-sig") as f:
        f.write("\n".join(lines))
    return output_ass_path

def render_video_sync(job_config):
    """Synchronous pipeline that prepares audio tracks, filters, subtitles, and renders final MP4"""
    video_path = job_config.get("videoPath")
    bgm_path = job_config.get("bgmPath")
    segments = job_config.get("segments", [])
    anti_copyright = job_config.get("antiCopyright", {})
    watermark = job_config.get("watermark", {})
    cleaner_config = job_config.get("cleanerConfig", {})
    lip_sync_config = job_config.get("lipSyncConfig", {})
    subtitle_style = job_config.get("subtitleStyle") or job_config.get("subtitleConfig", {})
    burn_subtitles = job_config.get("burnSubtitles", True)
    audio_settings = job_config.get("audioSettings", {})
    output_path = job_config.get("outputPath")
    resolution = job_config.get("resolution", "1080p")
    title = job_config.get("title", "BT-Dubber Video")
    
    if not video_path or not os.path.exists(video_path):
        raise ValueError(f"Source video file not found: {video_path}")
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix="dubber_render_", dir=DATA_TEMP_DIR)
    
    try:
        # Probe source video info for intelligent aspect ratio scaling
        probe_info = probe_video_stream(video_path)
        is_portrait = probe_info.get("is_portrait", False)
        
        # 1. Resolve or Generate TTS audio clips
        provided_clips = job_config.get("ttsClips", [])
        tts_clips = []
        
        if provided_clips and len(provided_clips) > 0:
            # Server already pre-generated TTS clips with exact preview pipeline
            for c in provided_clips:
                c_path = c.get("path")
                if c_path and os.path.exists(c_path):
                    s_sec = float(c.get("start_sec", 0.0))
                    tts_clips.append({
                        "path": c_path,
                        "start_sec": s_sec,
                        "delay_ms": max(0, int(s_sec * 1000)),
                        "volume_gain": float(c.get("volume_gain", 1.0) or 1.0)
                    })
        else:
            # Generate TTS clips internally
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            voice_mapping = job_config.get("voiceRolesMapping") or job_config.get("voiceMapping", {})
            male_mapped = voice_mapping.get("male")
            female_mapped = voice_mapping.get("female")
            narrator_mapped = voice_mapping.get("narrator")
            
            for idx, seg in enumerate(segments):
                script = seg.get("khmer_script", "").strip()
                if not script:
                    continue
                start_sec = parse_timecode_to_seconds(seg.get("start_time", "00:00"))
                raw_gender = (seg.get("speaker_gender") or "female").lower()
                
                if raw_gender.startswith("voice_"):
                    gender = raw_gender
                elif raw_gender in ["male", "male_elder", "villain"]:
                    gender = male_mapped or raw_gender
                elif raw_gender in ["female", "female_elder", "child"]:
                    gender = female_mapped or raw_gender
                elif raw_gender == "narrator":
                    gender = narrator_mapped or "male"
                else:
                    gender = female_mapped or raw_gender

                emotion = seg.get("voice_emotion") or seg.get("voice_tone") or "neutral"
                seg_speed = seg.get("playback_speed")
                seg_gain = float(seg.get("volume_gain", 1.0) or 1.0)
                
                speed_rate_str = "+25%"
                if seg_speed and isinstance(seg_speed, (int, float)):
                    rate_pct = int(round((float(seg_speed) - 1.0) * 100))
                    speed_rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

                clip_file = os.path.join(temp_dir, f"tts_{idx}_{gender}.mp3")
                ok = loop.run_until_complete(generate_segment_tts_audio(script, gender, clip_file, speed_rate=speed_rate_str, emotion=emotion))
                if ok and os.path.exists(clip_file) and os.path.getsize(clip_file) > 100:
                    tts_clips.append({
                        "path": clip_file,
                        "start_sec": start_sec,
                        "delay_ms": max(0, int(start_sec * 1000)),
                        "volume_gain": seg_gain
                    })
            loop.close()
        
        # 2. Build Master Narration Audio Track if we have TTS clips (Python High-Fidelity Non-Overlapping Mixer)
        has_tts = len(tts_clips) > 0
        master_narration_path = None
        
        if has_tts:
            try:
                import soundfile as sf
                import numpy as np

                sr = 44100
                vid_dur = float(probe_info.get("duration", 0.0) or 0.0)
                
                # Estimate total duration
                max_clip_end = max([c["start_sec"] + 15.0 for c in tts_clips] or [10.0])
                total_duration = max(vid_dur, max_clip_end, 10.0)
                total_samples = int(np.ceil(total_duration * sr)) + (sr * 5)
                
                # 2-channel 32-bit float master array
                master_audio = np.zeros((total_samples, 2), dtype=np.float32)
                
                # Sort clips chronologically by start_sec
                sorted_clips = sorted(tts_clips, key=lambda x: x["start_sec"])
                last_end_sample = 0
                
                for clip in sorted_clips:
                    c_path = clip["path"]
                    if not os.path.exists(c_path):
                        continue
                    try:
                        data, file_sr = sf.read(c_path)
                        # Convert to stereo
                        if data.ndim == 1:
                            clip_stereo = np.column_stack([data, data])
                        elif data.ndim == 2 and data.shape[1] == 1:
                            clip_stereo = np.column_stack([data[:, 0], data[:, 0]])
                        else:
                            clip_stereo = data[:, :2]
                            
                        # Resample if sample rate differs
                        if file_sr != sr:
                            new_len = int(round(len(clip_stereo) * float(sr) / file_sr))
                            indices = np.linspace(0, len(clip_stereo) - 1, new_len)
                            ch0 = np.interp(indices, np.arange(len(clip_stereo)), clip_stereo[:, 0])
                            ch1 = np.interp(indices, np.arange(len(clip_stereo)), clip_stereo[:, 1])
                            clip_stereo = np.column_stack([ch0, ch1])
                            
                        gain = float(clip.get("volume_gain", 1.0) or 1.0)
                        clip_stereo = clip_stereo * gain
                        
                        target_start_sample = max(0, int(round(clip["start_sec"] * sr)))
                        
                        # Anti-Overlap: If previous sentence is still speaking, ensure a clean 60ms gap
                        # so speech never overlaps (មិនជាន់សំឡេងគ្នា)
                        if target_start_sample < last_end_sample:
                            target_start_sample = last_end_sample + int(0.06 * sr)
                            
                        clip_len = len(clip_stereo)
                        target_end_sample = target_start_sample + clip_len
                        
                        # Expand master array dynamically if needed
                        if target_end_sample > len(master_audio):
                            pad = np.zeros((target_end_sample - len(master_audio) + sr * 5, 2), dtype=np.float32)
                            master_audio = np.vstack([master_audio, pad])
                            
                        master_audio[target_start_sample:target_end_sample] += clip_stereo
                        last_end_sample = target_end_sample
                    except Exception as clip_err:
                        sys.stderr.write(f"Clip mix notice for {c_path}: {clip_err}\n")
                        
                # Soft-clip/normalize to prevent digital distortion
                max_peak = np.max(np.abs(master_audio))
                if max_peak > 0.98:
                    master_audio = (master_audio / max_peak) * 0.98
                    
                master_narration_path = os.path.join(temp_dir, "master_narration.wav")
                sf.write(master_narration_path, master_audio, sr, subtype='PCM_16')
                sys.stderr.write(f"Built master narration track: {len(sorted_clips)} clips, duration: {len(master_audio)/sr:.2f}s\n")
            except Exception as e:
                sys.stderr.write(f"Python master narration builder notice: {e}\n")
                master_narration_path = None
                has_tts = False

        # 3. Prepare Subtitles file (.ass) if requested
        ass_subtitle_path = None
        if burn_subtitles and segments and len(segments) > 0:
            ass_file = os.path.join(temp_dir, "subtitles.ass")
            generate_ass_subtitle_file(segments, ass_file, style_config=subtitle_style, movie_title=title)
            if os.path.exists(ass_file):
                ass_subtitle_path = ass_file
                
        # 4. Prepare Watermark Text file
        khmer_font_path = get_khmer_font_path()
        khmer_fonts_dir = get_khmer_fonts_dir()
        watermark_text_file = None
        
        if watermark.get("enabled") and watermark.get("text"):
            watermark_text_file = os.path.join(temp_dir, "watermark_text.txt")
            with open(watermark_text_file, "w", encoding="utf-8") as f:
                f.write(watermark.get("text", ""))

        # 5. Build FFmpeg command inputs
        ffmpeg_inputs = ["-y", "-i", video_path]
        
        has_bgm = bool(bgm_path and os.path.exists(bgm_path))
        if has_bgm:
            ffmpeg_inputs.extend(["-i", bgm_path])
            
        if has_tts and master_narration_path and os.path.exists(master_narration_path):
            ffmpeg_inputs.extend(["-i", master_narration_path])

        # 6. Build Video Filter Complex
        vf_chain = []
        
        # Anti-Copyright: Only applied if explicitly enabled
        is_anti_copyright_active = bool(anti_copyright.get("enabled", False))
        if is_anti_copyright_active:
            if anti_copyright.get("flipHorizontal"):
                vf_chain.append("hflip")
            zoom = float(anti_copyright.get("zoomScale", 1.0) or 1.0)
            if zoom > 1.01:
                vf_chain.append(f"crop=iw/{zoom:.3f}:ih/{zoom:.3f}")
            color = anti_copyright.get("colorFilter", "none")
            if color == "cinematic_warm":
                vf_chain.append("colorbalance=rs=0.06:gs=0.02:bs=-0.04:rm=0.04:gm=0.01:bm=-0.03")
            elif color == "cinematic_cool":
                vf_chain.append("colorbalance=rs=-0.04:gs=0.02:bs=0.08:rm=-0.03:gm=0.01:bm=0.06")
            elif color == "golden_hour":
                vf_chain.append("colorbalance=rs=0.10:gs=0.05:bs=-0.06,eq=contrast=1.04:saturation=1.10")
            elif color == "film_noir":
                vf_chain.append("hue=s=0,eq=contrast=1.20:brightness=-0.02")
            elif color == "vibrant_boost":
                vf_chain.append("eq=saturation=1.20:contrast=1.05")
            if anti_copyright.get("vignette"):
                vf_chain.append("vignette=PI/4")
            speed = float(anti_copyright.get("microSpeed", 1.0) or 1.0)
            if abs(speed - 1.0) > 0.01:
                vf_chain.append(f"setpts=PTS/{speed:.3f}")
        
        # Scale to Target Resolution (with portrait vs landscape awareness)
        if resolution != "original":
            if is_portrait:
                target_scale = "1080:1920" if resolution == "1080p" else "720:1280"
            else:
                target_scale = "1920:1080" if resolution == "1080p" else "1280:720"
            vf_chain.append(f"scale={target_scale}:force_original_aspect_ratio=decrease,pad={target_scale}:(ow-iw)/2:(oh-ih)/2:black")
            
        # AI Watermark & Logo Cleaner Filters
        if cleaner_config.get("enabled") and cleaner_config.get("zones"):
            for zone in cleaner_config.get("zones", []):
                x_pct = float(zone.get("xPercent", 0)) / 100.0
                y_pct = float(zone.get("yPercent", 0)) / 100.0
                w_pct = float(zone.get("widthPercent", 0)) / 100.0
                h_pct = float(zone.get("heightPercent", 0)) / 100.0
                method = zone.get("method", "smart_delogo")
                
                if method == "cinematic_backdrop":
                    vf_chain.append(f"drawbox=x=iw*{x_pct:.3f}:y=ih*{y_pct:.3f}:w=iw*{w_pct:.3f}:h=ih*{h_pct:.3f}:color=black@0.85:t=fill")
                elif method == "smart_delogo":
                    vf_chain.append(f"delogo=x=round(iw*{x_pct:.3f}):y=round(ih*{y_pct:.3f}):w=round(iw*{w_pct:.3f}):h=round(ih*{h_pct:.3f}):band=1:show=0")
                else:
                    vf_chain.append(f"delogo=x=round(iw*{x_pct:.3f}):y=round(ih*{y_pct:.3f}):w=round(iw*{w_pct:.3f}):h=round(ih*{h_pct:.3f}):band=2:show=0")

        # Watermark Overlay (with Khmer TrueType Font)
        if watermark.get("enabled") and watermark.get("text") and watermark_text_file and os.path.exists(watermark_text_file):
            pos = watermark.get("position", "top-right")
            opacity = float(watermark.get("opacity", 0.85) or 0.85)
            font_size = "28" if resolution == "1080p" else "22"
            
            x_y = "x=w-tw-30:y=30"
            if pos == "top-left":
                x_y = "x=30:y=30"
            elif pos == "bottom-left":
                x_y = "x=30:y=h-th-30"
            elif pos == "bottom-right":
                x_y = "x=w-tw-30:y=h-th-30"
            elif pos == "center":
                x_y = "x=(w-tw)/2:y=(h-th)/2"
                
            esc_wm_txt = escape_ffmpeg_filter_path(watermark_text_file)
            drawtext_parts = [
                f"textfile='{esc_wm_txt}'",
                x_y,
                f"fontsize={font_size}",
                f"fontcolor=white@{opacity}",
                "shadowcolor=black@0.85",
                "shadowx=2",
                "shadowy=2"
            ]
            if khmer_font_path and os.path.exists(khmer_font_path):
                esc_font = escape_ffmpeg_filter_path(khmer_font_path)
                drawtext_parts.insert(0, f"fontfile='{esc_font}'")
                
            vf_chain.append(f"drawtext={':'.join(drawtext_parts)}")

        # Burn-in Subtitles Filter (libass with Khmer fontdir)
        if ass_subtitle_path and os.path.exists(ass_subtitle_path):
            esc_ass = escape_ffmpeg_filter_path(ass_subtitle_path)
            if khmer_fonts_dir and os.path.exists(khmer_fonts_dir):
                esc_fdir = escape_ffmpeg_filter_path(khmer_fonts_dir)
                vf_chain.append(f"subtitles='{esc_ass}':fontsdir='{esc_fdir}'")
            else:
                vf_chain.append(f"subtitles='{esc_ass}'")

        video_filter_str = ",".join(vf_chain) if vf_chain else "null"
        
        # 7. Audio Filter Complex (Multi-track studio mixing with normalize=0)
        filter_complex_parts = [f"[0:v]{video_filter_str}[outv]"]
        
        # Volume levels
        orig_vol = float(audio_settings.get("originalAudioVolume", 0.0) if has_tts else 1.0)
        bgm_vol = float(audio_settings.get("bgmVolume", 0.30) if has_bgm else 0.0)
        tts_vol = float(audio_settings.get("ttsVolume", 1.25) if has_tts else 1.0)
        
        audio_mix_inputs = []
        
        # Stream 0: Source Video Audio
        if orig_vol > 0.01:
            filter_complex_parts.append(f"[0:a]volume={orig_vol:.2f}[orig_aud]")
            audio_mix_inputs.append("[orig_aud]")
            
        # Stream 1 (or 2): BGM Audio
        bgm_input_idx = 1 if has_bgm else None
        if has_bgm and bgm_vol > 0.01:
            filter_complex_parts.append(f"[{bgm_input_idx}:a]volume={bgm_vol:.2f}[bgm_aud]")
            audio_mix_inputs.append("[bgm_aud]")
            
        # Stream (TTS Master Narration)
        narration_input_idx = (1 if not has_bgm else 2) if has_tts else None
        if has_tts and master_narration_path and narration_input_idx is not None:
            filter_complex_parts.append(f"[{narration_input_idx}:a]volume={tts_vol:.2f}[tts_aud]")
            audio_mix_inputs.append("[tts_aud]")
            
        if len(audio_mix_inputs) == 0:
            filter_complex_parts.append("[0:a]volume=1.0[outa]")
        elif len(audio_mix_inputs) == 1:
            filter_complex_parts.append(f"{audio_mix_inputs[0]}anull[outa]")
        else:
            mix_str = "".join(audio_mix_inputs)
            filter_complex_parts.append(f"{mix_str}amix=inputs={len(audio_mix_inputs)}:duration=first:dropout_transition=0:normalize=0[outa]")
            
        full_filter_complex = ";".join(filter_complex_parts)
        
        # 8. Assemble full FFmpeg rendering command with optimal encoder
        opt_enc = get_optimal_video_encoder()
        cmd = [
            FFMPEG_EXE,
            *ffmpeg_inputs,
            "-filter_complex", full_filter_complex,
            "-map", "[outv]",
            "-map", "[outa]",
            *opt_enc,
            "-pix_fmt", "yuv420p",
            "-colorspace", "bt709",
            "-color_primaries", "bt709",
            "-color_trc", "bt709",
            "-c:a", "aac",
            "-b:a", "256k",
            "-movflags", "+faststart",
            output_path
        ]
        
        sys.stderr.write(f"Starting Studio FFmpeg render job to: {output_path}...\n")
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        if proc.returncode != 0:
            sys.stderr.write(f"FFmpeg error:\n{proc.stderr}\n")
            raise RuntimeError(f"FFmpeg render failed with exit code {proc.returncode}")
            
        sys.stderr.write(f"Render completed successfully! Output file size: {os.path.getsize(output_path)} bytes\n")
        return {"success": True, "outputPath": output_path, "size": os.path.getsize(output_path)}
        
    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
            pass

def cut_and_merge_video_sync(job_config):
    """Cut single or multiple time slices from video and merge into a single MP4 with high-speed direct stream copy and robust fallback"""
    import shutil
    video_path = job_config.get("videoPath")
    slices = job_config.get("slices", [])
    output_path = job_config.get("outputPath")
    
    if not video_path or not os.path.exists(video_path):
        raise ValueError(f"Source video file not found: {video_path}")
    if not slices or len(slices) == 0:
        raise ValueError("No cut slices provided")
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix="dubber_cut_", dir=DATA_TEMP_DIR)
    
    try:
        # Case A: Only 1 slice
        if len(slices) == 1:
            s = slices[0]
            start_sec = max(0.0, float(s.get("startSec", 0)))
            end_sec = float(s.get("endSec", 0))
            src_file = s.get("videoPath") or video_path
            
            if start_sec == 0 and end_sec == 0:
                shutil.copy2(src_file, output_path)
                return {"success": True, "outputPath": output_path, "size": os.path.getsize(output_path), "sliceCount": 1}

            # Fast Path 1: Direct stream copy (takes < 0.1s, 100% original lossless quality)
            fast_cut_cmd = [
                FFMPEG_EXE, "-y",
                "-ss", str(start_sec)
            ]
            if end_sec > start_sec:
                fast_cut_cmd.extend(["-to", str(end_sec)])
            fast_cut_cmd.extend([
                "-i", src_file,
                "-c", "copy",
                "-movflags", "+faststart",
                output_path
            ])
            sys.stderr.write(f"⚡ [Ultra-Fast Cut] Cutting slice ({start_sec}s -> {end_sec}s) with direct stream copy...\n")
            proc_fast = subprocess.run(fast_cut_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc_fast.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                sys.stderr.write(f"🎉 [Ultra-Fast Cut Success] Cut completed in sub-second!\n")
                return {"success": True, "outputPath": output_path, "size": os.path.getsize(output_path), "sliceCount": 1}

            # Fast Path 2: Hardware accelerated re-encoding fallback
            opt_enc = get_optimal_video_encoder()
            cmd = [
                FFMPEG_EXE, "-y",
                "-ss", str(start_sec)
            ]
            if end_sec > start_sec:
                cmd.extend(["-to", str(end_sec)])
            cmd.extend([
                "-i", src_file,
                *opt_enc,
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                output_path
            ])
            
            sys.stderr.write(f"Cutting single slice ({start_sec}s -> {end_sec}s) to {output_path}...\n")
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode != 0:
                raise RuntimeError(f"FFmpeg slice cut failed: {proc.stderr}")
            return {"success": True, "outputPath": output_path, "size": os.path.getsize(output_path), "sliceCount": 1}

        # Case B: Multiple slices / episodes
        are_all_full_videos = True
        valid_sources = []
        for s in slices:
            src = s.get("videoPath") or video_path
            if src and os.path.exists(src):
                valid_sources.append(src)
                st = max(0.0, float(s.get("startSec", 0)))
                en = float(s.get("endSec", 0))
                if st > 0 or en > 0:
                    are_all_full_videos = False

        if len(valid_sources) == 0:
            raise ValueError("No valid video files found to merge")

        # 1. ULTRA-FAST PATH: Concat Demuxer with Stream Copy (-c copy)
        # Completes 45 episodes in seconds (lossless, near-zero CPU usage)
        if are_all_full_videos:
            sys.stderr.write(f"⚡ [Fast Merge] Attempting high-speed direct stream copy for {len(valid_sources)} episodes...\n")
            concat_list_file = os.path.join(temp_dir, "fast_concat_list.txt")
            with open(concat_list_file, "w", encoding="utf-8") as f:
                for src in valid_sources:
                    escaped_path = src.replace("\\", "/").replace("'", "'\\''")
                    f.write(f"file '{escaped_path}'\n")

            fast_concat_cmd = [
                FFMPEG_EXE, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_list_file,
                "-c", "copy",
                "-movflags", "+faststart",
                output_path
            ]
            fast_proc = subprocess.run(fast_concat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if fast_proc.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
                sys.stderr.write(f"🎉 [Fast Merge Success] Direct stream copy merged {len(valid_sources)} episodes successfully!\n")
                return {
                    "success": True,
                    "outputPath": output_path,
                    "size": os.path.getsize(output_path),
                    "sliceCount": len(valid_sources),
                    "fastMode": True
                }
            else:
                sys.stderr.write(f"⚠️ Direct stream copy notice: Formats/codecs differ. Proceeding with high-speed normalized transcode...\n")

        # 2. OPTIMIZED FALLBACK PATH:
        # Standardize slices with ultrafast preset and concat in one step
        slice_files = []
        total_slices = len(slices)
        for i, s in enumerate(slices):
            src_video = s.get("videoPath") or video_path
            if not src_video or not os.path.exists(src_video):
                continue

            start_sec = max(0.0, float(s.get("startSec", 0)))
            end_sec = float(s.get("endSec", 0))
            
            temp_slice_file = os.path.join(temp_dir, f"slice_{i:03d}.mp4")
            cmd = [FFMPEG_EXE, "-y"]
            
            if start_sec > 0:
                cmd.extend(["-ss", str(start_sec)])
            if end_sec > start_sec:
                cmd.extend(["-to", str(end_sec)])
                
            cmd.extend([
                "-i", src_video,
                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
                "-af", "aformat=sample_rates=44100:channel_layouts=stereo",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                temp_slice_file
            ])
            
            sys.stderr.write(f"[{i+1}/{total_slices}] Normalizing episode slice: {os.path.basename(src_video)} ({start_sec}s -> {end_sec}s)...\n")
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0 and os.path.exists(temp_slice_file):
                slice_files.append(temp_slice_file)
                
        if len(slice_files) == 0:
            raise ValueError("No valid video slices could be cut from provided video sources")
            
        # Concat normalized slices via demuxer (-c copy) so we avoid double encoding!
        norm_concat_file = os.path.join(temp_dir, "normalized_concat_list.txt")
        with open(norm_concat_file, "w", encoding="utf-8") as f:
            for sf in slice_files:
                escaped_path = sf.replace("\\", "/").replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")

        concat_cmd = [
            FFMPEG_EXE, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", norm_concat_file,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path
        ]
        
        sys.stderr.write(f"Concatenating {len(slice_files)} normalized slices into {output_path}...\n")
        proc = subprocess.run(concat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        if proc.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
            # Fallback to filter_complex if demuxer fails
            inputs = []
            for f in slice_files:
                inputs.extend(["-i", f])
                
            concat_streams = "".join([f"[{i}:v][{i}:a]" for i in range(len(slice_files))])
            filter_str = f"{concat_streams}concat=n={len(slice_files)}:v=1:a=1[outv][outa]"
            
            concat_cmd = [
                FFMPEG_EXE, "-y",
                *inputs,
                "-filter_complex", filter_str,
                "-map", "[outv]", "-map", "[outa]",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                output_path
            ]
            
            proc = subprocess.run(concat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode != 0:
                raise RuntimeError(f"FFmpeg concat failed: {proc.stderr}")
            
        return {"success": True, "outputPath": output_path, "size": os.path.getsize(output_path), "sliceCount": len(slice_files)}
        
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

def batch_split_and_render_series_sync(job_config):
    """Split video into episodes, generate SRTs, save into dedicated series folder, and package as ZIP"""
    import zipfile
    import shutil
    
    series_title = job_config.get("seriesTitle", "Series_Project")
    video_path = job_config.get("videoPath")
    episodes = job_config.get("episodes", [])
    series_folder_path = job_config.get("seriesFolderPath")
    zip_path = job_config.get("zipPath")
    
    if not video_path or not os.path.exists(video_path):
        raise ValueError(f"Source video file not found: {video_path}")
    if not episodes:
        raise ValueError("No episodes configured for series export")
        
    os.makedirs(series_folder_path, exist_ok=True)
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    
    exported_files = []
    
    for ep in episodes:
        ep_num = ep.get("episodeNumber", 1)
        raw_title = ep.get("title", f"Episode_{ep_num:02d}")
        clean_title = re.sub(r'[^\w\s\u1780-\u17FF-]', '', raw_title).strip().replace(' ', '_')
        if not clean_title:
            clean_title = f"Episode_{ep_num:02d}"
            
        start_sec = max(0.0, float(ep.get("startSec", 0)))
        end_sec = float(ep.get("endSec", 0))
        duration_sec = end_sec - start_sec if end_sec > start_sec else 0
        
        ep_filename = f"Ep_{ep_num:02d}_{clean_title}.mp4"
        ep_out_path = os.path.join(series_folder_path, ep_filename)
        
        cmd_fast = [
            FFMPEG_EXE, "-y",
            "-ss", str(start_sec),
            "-i", video_path
        ]
        if duration_sec > 0:
            cmd_fast.extend(["-t", str(duration_sec)])
        cmd_fast.extend([
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            "-movflags", "+faststart",
            ep_out_path
        ])
        
        sys.stderr.write(f"⚡ Fast Splitting Episode {ep_num} ({start_sec}s -> {end_sec}s, dur: {duration_sec}s) to {ep_filename}...\n")
        proc = subprocess.run(cmd_fast, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # If stream copy succeeded and file has valid size, use it; otherwise fallback to ultrafast re-encode
        if proc.returncode != 0 or not os.path.exists(ep_out_path) or os.path.getsize(ep_out_path) < 10000:
            cmd_reencode = [
                FFMPEG_EXE, "-y",
                "-ss", str(start_sec),
                "-i", video_path
            ]
            if duration_sec > 0:
                cmd_reencode.extend(["-t", str(duration_sec)])
            cmd_reencode.extend([
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k",
                "-avoid_negative_ts", "make_zero",
                "-movflags", "+faststart",
                ep_out_path
            ])
            proc = subprocess.run(cmd_reencode, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        if proc.returncode == 0 and os.path.exists(ep_out_path) and os.path.getsize(ep_out_path) > 1000:
            file_info = {
                "episodeNumber": ep_num,
                "title": raw_title,
                "videoFileName": ep_filename,
                "videoPath": ep_out_path,
                "size": os.path.getsize(ep_out_path),
                "durationSec": duration_sec
            }
            
            # If episode has segments, write individual .srt file
            segments = ep.get("segments", [])
            if segments:
                srt_lines = []
                for s_idx, seg in enumerate(segments):
                    s_start = max(0.0, parse_timecode_to_seconds(seg.get("start_time", 0)) - start_sec)
                    s_end = max(s_start + 1.5, parse_timecode_to_seconds(seg.get("end_time", 0)) - start_sec)
                    
                    def to_srt_time(sec):
                        h = int(sec // 3600)
                        m = int((sec % 3600) // 60)
                        s = int(sec % 60)
                        ms = int((sec % 1) * 1000)
                        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                        
                    text = seg.get("khmer_script", "")
                    spk = seg.get("speaker_name", "")
                    prefix = f"[{spk}]: " if spk and spk != "អ្នកសម្រាយ" else ""
                    
                    srt_lines.append(str(s_idx + 1))
                    srt_lines.append(f"{to_srt_time(s_start)} --> {to_srt_time(s_end)}")
                    srt_lines.append(f"{prefix}{text}".strip())
                    srt_lines.append("")
                    
                srt_filename = f"Ep_{ep_num:02d}_{clean_title}.srt"
                srt_path = os.path.join(series_folder_path, srt_filename)
                with open(srt_path, "w", encoding="utf-8") as f:
                    f.write("\n".join(srt_lines))
                file_info["srtFileName"] = srt_filename
                
            exported_files.append(file_info)
            
    # Create ZIP of the entire series folder
    sys.stderr.write(f"Creating ZIP archive of series folder at: {zip_path}...\n")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(series_folder_path):
            for file in files:
                file_full_path = os.path.join(root, file)
                arcname = os.path.relpath(file_full_path, series_folder_path)
                zipf.write(file_full_path, arcname)
                
    return {
        "success": True,
        "seriesTitle": series_title,
        "folderPath": series_folder_path,
        "zipPath": zip_path,
        "totalEpisodes": len(exported_files),
        "files": exported_files,
        "zipSize": os.path.getsize(zip_path) if os.path.exists(zip_path) else 0
    }

def compress_video_sync(cfg: dict) -> dict:
    video_path = cfg.get("videoPath")
    output_path = cfg.get("outputPath")
    mode = cfg.get("mode", "smart_hd")  # smart_hd | extreme | tiktok_fast | mobile_light | max_clarity
    
    if not video_path or not os.path.exists(video_path):
        raise ValueError(f"Source video not found: {video_path}")
        
    orig_size = os.path.getsize(video_path)
    
    crf = "23"
    preset = "veryfast"
    audio_br = "128k"
    extra_filters = []
    
    if mode == "extreme" or mode == "tiktok_fast":
        crf = "26"
        preset = "ultrafast"
        audio_br = "112k"
        # Scale to max 720p height/width for extreme speed and low file size
        extra_filters.append("scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))':force_original_aspect_ratio=decrease")
    elif mode == "mobile_light":
        crf = "28"
        preset = "ultrafast"
        audio_br = "96k"
        extra_filters.append("scale='if(gt(iw,ih),min(854,iw),-2)':'if(gt(iw,ih),-2,min(854,ih))':force_original_aspect_ratio=decrease")
    elif mode == "max_clarity":
        crf = "20"
        preset = "fast"
        audio_br = "192k"
    else: # smart_hd
        crf = "23"
        preset = "veryfast"
        audio_br = "128k"
        extra_filters.append("scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))':force_original_aspect_ratio=decrease")
        
    cmd = [
        FFMPEG_EXE, "-y",
        "-i", video_path
    ]
    
    if extra_filters:
        cmd.extend(["-vf", ",".join(extra_filters)])
        
    cmd.extend([
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", crf,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", audio_br,
        "-ar", "44100",
        "-movflags", "+faststart",
        output_path
    ])
    
    sys.stderr.write(f"⚡ Compressing video ({mode}, crf={crf}, preset={preset}) to {output_path}...\n")
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0 or not os.path.exists(output_path):
        raise RuntimeError(f"Compression failed: {proc.stderr}")
        
    new_size = os.path.getsize(output_path)
    saved_percent = round((1 - (new_size / orig_size)) * 100, 1) if orig_size > 0 else 0
    
    return {
        "success": True,
        "originalSize": orig_size,
        "compressedSize": new_size,
        "savedPercent": f"{saved_percent}%",
        "outputPath": output_path,
        "mode": mode
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python video_renderer.py <config.json> [action]"}))
        sys.exit(1)
        
    config_file = sys.argv[1]
    action = sys.argv[2] if len(sys.argv) > 2 else "render"
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            
        action = cfg.get("action", action)
        
        if action == "cut_merge":
            result = cut_and_merge_video_sync(cfg)
        elif action == "batch_series_render":
            result = batch_split_and_render_series_sync(cfg)
        elif action == "compress":
            result = compress_video_sync(cfg)
        else:
            result = render_video_sync(cfg)
            
        print(json.dumps(result))
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
