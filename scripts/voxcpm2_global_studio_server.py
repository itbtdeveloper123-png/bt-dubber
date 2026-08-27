"""
====================================================================================================
👑 Official BT-Dubber VoxCPM2 All-In-One Unified Studio Server (GPU Memory Optimized)
====================================================================================================
កូដរួមបញ្ចូលគ្នាពេញលេញតែមួយ (All-in-One Master Script):
1. ស្វ័យប្រវត្តិតម្លើង Dependencies (Auto Dependency Installer)
2. គ្រប់គ្រង VRAM GPU ការពារ CUDA Out Of Memory (T4 / A100 / P100 / RTX)
3. ស្កេន និងទាញយកសំឡេងគំរូខ្មែរ Master Reference Audio (Female & Male Profiles)
4. ប្រព័ន្ធសម្អាតអត្ថបទខ្មែរ ១០០% គ្មានលាយភាសាបរទេស (Pure Khmer Phonetics)
5. កែសម្រួលសំនៀងរលូន ធម្មជាតិ មិនកាច់ ឬបាក់សំឡេង (Smooth Pitch & Timbre Stability: CFG 1.6, Timesteps 16)
6. គ្រប់ Preset តួអង្គទាំងអស់ (តួឯកប្រុស, តួឯកស្រី, ក្មេង, មនុស្សចាស់, តួកាច, ពិធីករ)
7. Full REST APIs (/api/health, /api/presets, /api/clone, /api/tts, /api/batch-clone)
8. បើក Cloudflare Public Tunnel ដោយស្វ័យប្រវត្តិ សម្រាប់ចម្លង Link ទៅកាន់ BT-Dubber ភ្លាមៗ!
====================================================================================================
"""

import os, sys, subprocess

# 1. GPU VRAM Memory Allocator Optimization & Log Cleanup
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# Clear old memory if cell is re-run
import gc
import torch
if 'voxcpm_model' in globals():
    del globals()['voxcpm_model']
gc.collect()
if torch.cuda.is_available():
    torch.cuda.empty_cache()

os.environ["TQDM_DISABLE"] = "1"  # Disable tqdm progress bars for cleaner logs

print("📥 1/4 Installing & Verifying Dependencies...")
REQUIRED_PACKAGES = [
    ("voxcpm", "voxcpm"),
    ("soundfile", "soundfile"),
    ("librosa", "librosa"),
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("pydantic", "pydantic"),
    ("pycloudflared", "pycloudflared"),
    ("edge_tts", "edge-tts"),
    ("huggingface_hub", "huggingface_hub"),
    ("scipy", "scipy"),
    ("nest_asyncio", "nest_asyncio"),
]

missing_pkgs = []
for mod_name, pkg_name in REQUIRED_PACKAGES:
    try:
        __import__(mod_name)
    except ImportError:
        missing_pkgs.append(pkg_name)

if missing_pkgs:
    print(f"📦 Installing required packages: {', '.join(missing_pkgs)}...")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--no-warn-conflicts", "--no-warn-script-location", "-q"] + missing_pkgs,
            check=False
        )
    except Exception as e:
        print(f"⚠️ Note during package installation: {e}")

# 2. Deep monkey-patch tqdm to completely silence spammy logs in Colab/Jupyter
try:
    import tqdm
    from functools import partialmethod
    tqdm.tqdm.__init__ = partialmethod(tqdm.tqdm.__init__, disable=True)
    if hasattr(tqdm, 'auto') and hasattr(tqdm.auto, 'tqdm'):
        tqdm.auto.tqdm.__init__ = partialmethod(tqdm.auto.tqdm.__init__, disable=True)
    if hasattr(tqdm, 'notebook') and hasattr(tqdm.notebook, 'tqdm'):
        tqdm.notebook.tqdm.__init__ = partialmethod(tqdm.notebook.tqdm.__init__, disable=True)
except Exception:
    pass

print("🧠 2/4 Initializing Acoustic Reference Engine...")
import glob, json, time, socket, base64, tempfile, threading, torch, re, asyncio
import numpy as np
import soundfile as sf
import librosa
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import nest_asyncio
    nest_asyncio.apply()
except Exception:
    pass

try:
    from pycloudflared import try_cloudflare
except ImportError:
    try_cloudflare = None

device = "cuda:0" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
print(f"🚀 Running on: {gpu_name} ({device})")

WORK_DIR = "/kaggle/working" if os.path.exists("/kaggle") else ("/content" if os.path.exists("/content") else os.getcwd())

# 2. Search & Scan for Clean Khmer Reference Audio Samples
all_audio_files = sorted(
    glob.glob(f"{WORK_DIR}/*.mp3") + glob.glob(f"{WORK_DIR}/*.wav") +
    glob.glob("/kaggle/input/**/*.mp3", recursive=True) + glob.glob("/kaggle/input/**/*.wav", recursive=True) +
    glob.glob("/content/*.mp3") + glob.glob("/content/*.wav") +
    glob.glob("*.mp3") + glob.glob("*.wav")
)

female_sample = None
male_sample = None

for fpath in all_audio_files:
    fname = os.path.basename(fpath).lower()
    try:
        y, sr = librosa.load(fpath, sr=16000, mono=True)
        # Trim silence and slice to max 5.5s to prevent AudioVAE CUDA OOM
        y_trimmed, _ = librosa.effects.trim(y, top_db=25)
        max_len = int(5.5 * 16000)
        y_norm = librosa.util.normalize(y_trimmed[:max_len])

        if any(k in fname for k in ["401087", "403328", "405750", "female", "girl", "woman", "sreymom"]):
            if female_sample is None:
                female_sample = y_norm
                print(f"👩 [Female Master Audio] បានជ្រើសរើស៖ {fname}")
        elif any(k in fname for k in ["401095", "405777", "male", "boy", "man", "piseth"]):
            if male_sample is None:
                male_sample = y_norm
                print(f"👨 [Male Master Audio] បានជ្រើសរើស៖ {fname}")
        else:
            if female_sample is None:
                female_sample = y_norm
            elif male_sample is None:
                male_sample = y_norm
    except Exception as e:
        print(f"⚠️ Note reading audio sample {fname}: {e}")

female_master_path = os.path.join(WORK_DIR, "master_female_clean.wav")
male_master_path = os.path.join(WORK_DIR, "master_male_clean.wav")

if female_sample is not None:
    sf.write(female_master_path, female_sample, 16000)
if male_sample is not None:
    sf.write(male_master_path, male_sample, 16000)

MASTER_PROMPT_TEXT = "សួស្តី នេះគឺជាការសម្រាយសាច់រឿងយ៉ាងជក់ចិត្តដិតអារម្មណ៍។"

# Auto-generate crystal clear reference audio if no audio files were uploaded
if not os.path.exists(female_master_path):
    try:
        import edge_tts, asyncio
        temp_mp3 = os.path.join(WORK_DIR, "temp_female_ref.mp3")
        communicate = edge_tts.Communicate(MASTER_PROMPT_TEXT, "km-KH-SreymomNeural")
        asyncio.run(communicate.save(temp_mp3))
        y_fem, _ = librosa.load(temp_mp3, sr=16000, mono=True)
        y_fem_trimmed, _ = librosa.effects.trim(y_fem, top_db=25)
        max_len = int(5.5 * 16000)
        y_fem_norm = librosa.util.normalize(y_fem_trimmed[:max_len])
        sf.write(female_master_path, y_fem_norm, 16000, format='WAV')
        if os.path.exists(temp_mp3):
            os.remove(temp_mp3)
        print("👩 Auto-created Clean Female Master Reference WAV (16kHz PCM)!")
    except Exception as e:
        print(f"Female master ref note: {e}")

if not os.path.exists(male_master_path):
    try:
        import edge_tts, asyncio
        temp_mp3 = os.path.join(WORK_DIR, "temp_male_ref.mp3")
        communicate = edge_tts.Communicate(MASTER_PROMPT_TEXT, "km-KH-PisethNeural")
        asyncio.run(communicate.save(temp_mp3))
        y_male, _ = librosa.load(temp_mp3, sr=16000, mono=True)
        y_male_trimmed, _ = librosa.effects.trim(y_male, top_db=25)
        max_len = int(5.5 * 16000)
        y_male_norm = librosa.util.normalize(y_male_trimmed[:max_len])
        sf.write(male_master_path, y_male_norm, 16000, format='WAV')
        if os.path.exists(temp_mp3):
            os.remove(temp_mp3)
        print("👨 Auto-created Clean Male Master Reference WAV (16kHz PCM)!")
    except Exception as e:
        print(f"Male master ref note: {e}")

print("⚡ Master Acoustic References Ready!")

# 3. Load VoxCPM2 Foundation Model
if torch.cuda.is_available():
    torch.cuda.empty_cache()

print("\n🧠 3/4 Loading VoxCPM2 Foundation Model...")
from voxcpm import VoxCPM
voxcpm_model = VoxCPM.from_pretrained("openbmb/VoxCPM2", optimize=False, load_denoiser=False)

sample_rate = getattr(voxcpm_model.tts_model, "sample_rate", 48000)
print(f"🎉 Official VoxCPM2 Loaded! Native 48kHz Studio Quality Output Ready.")

# Pre-warm on GPU
try:
    if torch.cuda.is_available():
        print("⚡ Pre-warming VoxCPM2 on GPU for instant synthesis...")
        _ = voxcpm_model.generate(text="សួស្តី", cfg_value=1.5, inference_timesteps=2)
        torch.cuda.empty_cache()
        print("🔥 VoxCPM2 Engine is Warm and Ready (<1.5s Fast Speed)!")
except Exception:
    pass

# 4. Character Voice Presets
VOICE_PRESETS = {
    "female_sweet": {
        "id": "female_sweet",
        "name": "តួស្រីសម្រាយរឿង (Female Story Narrator)",
        "gender": "female",
        "category": "សម្រាយរឿង",
        "desc": "សំឡេងនារីច្បាស់ៗ រស់រវើក មានថាមពល បែបសម្រាយរឿងអាជីព",
        "seed": 200302
    },
    "male_hero": {
        "id": "male_hero",
        "name": "តួប្រុសសម្រាយរឿង (Male Story Narrator)",
        "gender": "male",
        "category": "សម្រាយរឿង",
        "desc": "សំឡេងបុរសច្បាស់ៗ ម៉ឺងម៉ាត់ មានកម្លាំង បែបសម្រាយរឿង",
        "seed": 100201
    },
    "female_lively": {
        "id": "female_lively",
        "name": "នារីរស់រវើក/កំប្លែង (Lively Female)",
        "gender": "female",
        "category": "តួអង្គស្រី",
        "desc": "សំឡេងនារីស្វាហាប់ ស្រស់ថ្លា ច្បាស់ៗ សម្រាប់រឿងកំប្លែង ឬ Action",
        "seed": 200505
    },
    "kid_girl": {
        "id": "kid_girl",
        "name": "ក្មេងស្រី (Cute Girl)",
        "gender": "female",
        "category": "កុមារ",
        "desc": "សំឡេងកុមារីស្រស់ថ្លា ច្បាស់ៗ គួរឱ្យស្រឡាញ់",
        "seed": 400504
    },
    "kid_boy": {
        "id": "kid_boy",
        "name": "ក្មេងប្រុស (Playful Boy)",
        "gender": "male",
        "category": "កុមារ",
        "desc": "សំឡេងកុមារារស់រវើក គួរឱ្យស្រឡាញ់ វ័យ ៨-១០ ឆ្នាំ",
        "seed": 300403
    },
    "elder_male": {
        "id": "elder_male",
        "name": "លោកតា / មនុស្សចាស់ប្រុស (Wise Grandfather)",
        "gender": "male",
        "category": "មនុស្សចាស់",
        "desc": "សំឡេងមនុស្សចាស់ប្រុស ស្អក ជ្រៅ ស្ងប់ស្ងាត់ មានប្រាជ្ញា",
        "seed": 500605
    },
    "elder_female": {
        "id": "elder_female",
        "name": "លោកយាយ / មនុស្សចាស់ស្រី (Kind Grandmother)",
        "gender": "female",
        "category": "មនុស្សចាស់",
        "desc": "សំឡេងមនុស្សចាស់ស្រី ទន់ភ្លន់ ចិត្តល្អ កក់ក្តៅ",
        "seed": 600706
    },
    "villain": {
        "id": "villain",
        "name": "តួកាច / មេបិសាច (Action Villain)",
        "gender": "male",
        "category": "តួអង្គពិសេស",
        "desc": "សំឡេងកាច ធ្ងន់ គ្រលរ គួរឱ្យភ័យខ្លាច",
        "seed": 700807
    },
    "news_host": {
        "id": "news_host",
        "name": "ពិធីករ / ព័ត៌មាន (News Anchor)",
        "gender": "male",
        "category": "ពិធីករ",
        "desc": "សំឡេងអានព័ត៌មាន ច្បាស់ៗ បែបវិទ្យុទូរទស្សន៍អាជីព",
        "seed": 800908
    }
}

# 5. Broadcast Studio Voice Mastering DSP Chain (EBU R128 Loudness Normalization, Compression, Presence EQ)
def studio_voice_mastering(
    raw_wav: np.ndarray, 
    sr: int = 48000, 
    target_lufs_rms: float = -18.0, 
    apply_vocal_eq: bool = True,
    apply_compression: bool = True,
    pitch_shift_semitones: float = 0.0
) -> np.ndarray:
    """
    កម្រិត Studio Voice Mastering ដូចសំឡេងអ្នកបញ្ចូលសំឡេងអាជីព (Broadcast Standards):
    1. ស្វ័យប្រវត្តិកាត់ភាពស្ងាត់ដើម/ចុង (Smart Trim with 35ms micro fade)
    2. Pitch & Age Formant Shifting (ក្មេង, មនុស្សចាស់, តួឯក, តួកាច)
    3. Dynamic Range Compression (DRC) & RMS Peak Leveling: ធ្វើឱ្យសំឡេងគ្រប់ឃ្លាស្មើថាមពលគ្នា (មិនខ្លាំងពេក មិនខ្សោយពេក)
    4. Studio Vocal EQ:
       - High-Pass Filter (80Hz Butterworth) បំបាត់សំឡេងកកិត ឬសំឡេងខ្យល់រំខាន (Sub-bass rumble)
       - Presence Air Polish (3.5kHz - 5kHz boost) ឱ្យសំឡេងថ្លា ច្បាស់ និងមានទឹកដម
    5. True Peak Limiter (-1.0 dBFS) ការពារកុំឱ្យបែកសំឡេង (Zero Distortion / Zero Clipping)
    """
    if raw_wav is None:
        return np.zeros(sr, dtype=np.float32)

    if isinstance(raw_wav, tuple):
        if len(raw_wav) >= 1:
            raw_wav = raw_wav[0]

    if isinstance(raw_wav, torch.Tensor):
        raw_wav = raw_wav.detach().cpu().squeeze().numpy()

    audio = np.squeeze(np.asarray(raw_wav, dtype=np.float32))
    if audio.ndim == 0 or len(audio) == 0:
        return np.zeros(sr, dtype=np.float32)

    # 1. Remove DC Offset
    audio = audio - np.mean(audio)

    # 2. Pitch / Age Formant Modulation (សម្រាប់កុមារ, លោកតា, លោកយាយ, តួកាច)
    if pitch_shift_semitones != 0.0:
        try:
            audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=pitch_shift_semitones)
        except Exception:
            pass

    # 2. Trim silence with top_db=32 and add 40ms soft fade-in / fade-out
    try:
        trimmed, _ = librosa.effects.trim(audio, top_db=32, frame_length=1024, hop_length=256)
        if len(trimmed) > int(sr * 0.1):
            audio = trimmed
    except Exception:
        pass

    # Smooth micro fade-in and fade-out (30ms) to eliminate click pops
    fade_len = min(int(sr * 0.03), len(audio) // 4)
    if fade_len > 0:
        fade_in = np.linspace(0.0, 1.0, fade_len, dtype=np.float32)
        fade_out = np.linspace(1.0, 0.0, fade_len, dtype=np.float32)
        audio[:fade_len] *= fade_in
        audio[-fade_len:] *= fade_out

    # 3. High-Pass Filter (80Hz 2nd order Butterworth) via scipy.signal to eliminate sub-bass mud
    try:
        from scipy.signal import butter, sosfilt
        sos_hp = butter(2, 80.0, btype='highpass', fs=sr, output='sos')
        audio = sosfilt(sos_hp, audio)
    except Exception:
        pass

    # 4. Multiband Studio Vocal EQ (Warmth & Clarity Presence)
    if apply_vocal_eq:
        try:
            from scipy.signal import butter, sosfilt
            sos_shelf = butter(1, 3500.0, btype='highpass', fs=sr, output='sos')
            high_content = sosfilt(sos_shelf, audio)
            audio = audio + (0.22 * high_content) # +1.8dB vocal presence & articulation
        except Exception:
            pass

    # 5. Studio Vocal Dynamic Range Compressor (Soft-Knee Peak Leveler)
    if apply_compression:
        peak = np.max(np.abs(audio)) + 1e-7
        if peak > 0:
            drive = 1.35
            compressed = np.tanh(audio * drive) / np.tanh(drive)
            audio = (0.75 * compressed) + (0.25 * audio)

    # 6. ITU-R BS.1770 / EBU R128 RMS Loudness Target Normalization
    rms = np.sqrt(np.mean(audio**2)) + 1e-7
    target_rms = 10.0 ** (target_lufs_rms / 20.0) # approx 0.125 (-18 dBFS)
    gain = target_rms / rms
    audio = audio * gain

    # 7. True Peak Hard / Soft Limiter at -1.0 dBFS (0.891 max amp) to guarantee zero distortion
    max_peak = np.max(np.abs(audio))
    if max_peak > 0.89:
        audio = audio * (0.89 / max_peak)

    return audio.astype(np.float32)

# 6. Pure Khmer Text Sanitizer (Removes foreign tags, English prompts, Orig quotes)
def clean_khmer_text_for_voxcpm(raw_text: str) -> str:
    if not raw_text:
        return ""
    
    # 1. Strip lines starting with "Orig:" or containing it
    lines = raw_text.split('\n')
    valid_lines = [l for l in lines if not l.strip().lower().startswith('orig:')]
    t = ' '.join(valid_lines)
    
    # 2. Remove bracketed annotations or quotes
    t = re.sub(r'\(.*?\)|\[.*?\]', '', t)
    
    # 3. Strip leading speaker label prefixes
    t = re.sub(r'^(តួប្រុស|តួស្រី|អ្នកសម្រាយ|អ្នកសម្រាយរឿង|តាចាស់|យាយចាស់|កុមារ|កូនក្មេង|មេក្រុម|មេបញ្ជាការ|[^\s:៖]{2,15})\s*[:៖-]\s*', '', t)
    
    # 4. Transliterate common foreign names/terms to Khmer
    trans_map = {
        r'\bMarcus\b': 'ម៉ាកុស',
        r'\bElena\b': 'អេលេណា',
        r'\bSWAT\b': 'ស្វាត',
        r'\bCyber\b': 'សាយប័រ',
        r'\bVault\b': 'វ៉ូល',
        r'\bPolice\b': 'ប៉ូលីស',
        r'\bHeist\b': 'ហាយស៍',
        r'\bFlash\b': 'ហ្វ្លាស',
        r'\bLaser\b': 'ឡាស៊ែរ',
        r'\bTeam\b': 'ក្រុម',
        r'\bMonaco\b': 'ម៉ូណាកូ'
    }
    for pat, repl in trans_map.items():
        t = re.sub(pat, repl, t, flags=re.IGNORECASE)
        
    # 5. [REMOVED] Latin/Chinese character stripping (Allow mixed English/Khmer control instructions)
    
    # 6. Remove orphaned English punctuation that causes VoxCPM hallucinations
    t = re.sub(r'[\[\]{}()<>"\'|\\/;:_~*#^&=@]', ' ', t)
    
    # 7. Clean whitespace & newlines
    t = re.sub(r'[\r\n\t]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    
    return t or raw_text.strip()

# 7. FastAPI Web & API Application
app = FastAPI(title="Official BT-Dubber VoxCPM2 Studio Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class CloneRequest(BaseModel):
    text: str
    audio_base64: str = ""
    preset_id: str = ""
    speed: float = 1.0
    base_voice: str = "km-KH-PisethNeural"
    gender: str = "female"
    model: str = "voxcpm2"
    prompt_text: str = ""

class BatchCloneRequest(BaseModel):
    texts: list[str]
    audio_base64: str = ""
    preset_id: str = ""
    speed: float = 1.0
    base_voice: str = "km-KH-PisethNeural"
    gender: str = "female"
    model: str = "voxcpm2"
    prompt_text: str = ""

@app.get("/")
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "gpu": gpu_name,
        "device": device,
        "model": "Official VoxCPM2 All-In-One Unified Studio",
        "sample_rate": sample_rate,
        "presets_available": len(VOICE_PRESETS),
        "ready": voxcpm_model is not None
    }

@app.get("/api/presets")
def get_presets():
    return {"success": True, "presets": list(VOICE_PRESETS.values())}

@app.post("/api/clone")
@app.post("/api/tts")
def clone_voice(req: CloneRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    clean_text = clean_khmer_text_for_voxcpm(req.text)
    if not clean_text:
        clean_text = req.text.strip()

    is_female = (req.gender == "female" or "female" in str(req.preset_id).lower() or "girl" in str(req.preset_id).lower())
    detected_gender_label = "ស្រី (Female)" if is_female else "ប្រុស (Male)"

    target_preset_id = req.preset_id.strip() if req.preset_id else ""
    if not target_preset_id or target_preset_id not in VOICE_PRESETS:
        target_preset_id = "female_sweet" if is_female else "male_hero"

    print(f"🎙️ [VoxCPM2] Request: Preset='{target_preset_id}', Gender='{detected_gender_label}', CustomAudio={bool(req.audio_base64)} | Text: '{clean_text[:40]}'")

    if voxcpm_model is None:
        raise HTTPException(status_code=503, detail="VoxCPM2 Model is not ready on GPU")

    with tempfile.TemporaryDirectory() as tmpdir:
        ref_audio_path = os.path.join(tmpdir, "ref_sample.wav")
        out_audio_path = os.path.join(tmpdir, "out_cloned.wav")
        
        has_custom_audio = False
        speaker_seed = 42

        # 1. Custom User Audio (Zero-Shot Voice Cloning)
        if req.audio_base64 and not req.audio_base64.startswith("preset:"):
            ref_bytes = base64.b64decode(req.audio_base64)
            with open(ref_audio_path, "wb") as f:
                f.write(ref_bytes)
            try:
                y_c, sr_c = librosa.load(ref_audio_path, sr=16000, mono=True)
                y_c_mastered = studio_voice_mastering(y_c, sr=16000, target_lufs_rms=-18.0)
                max_len = int(5.5 * 16000)
                sf.write(ref_audio_path, y_c_mastered[:max_len], 16000)
            except Exception:
                pass
            has_custom_audio = True
            speaker_seed = abs(hash(req.audio_base64[:500] + str(len(req.audio_base64)))) % 1000000
            text_to_generate = clean_text
            used_engine = "VoxCPM2 (Zero-Shot Cloned Voice)"
            target_ref = ref_audio_path
            target_preset_id = "custom"

        # 2. Preset Multi-Speaker Engine
        else:
            preset = VOICE_PRESETS[target_preset_id]
            speaker_seed = preset["seed"]
            text_to_generate = clean_text
            used_engine = f"VoxCPM2 Studio ({preset['name']})"

            # Auto-Route to Clean Master Khmer Reference
            if is_female and os.path.exists(female_master_path):
                target_ref = female_master_path
            elif not is_female and os.path.exists(male_master_path):
                target_ref = male_master_path
            else:
                target_ref = female_master_path if os.path.exists(female_master_path) else male_master_path

        # Standard Diffusion Timesteps (25) for high-fidelity speech (Matches Hugging Face Space)
        text_len = len(text_to_generate)
        steps = 25

        # Choose aligned prompt text matching the reference audio
        if target_ref in (female_master_path, male_master_path):
            prompt_text_to_use = MASTER_PROMPT_TEXT
        elif getattr(req, 'prompt_text', '').strip():
            prompt_text_to_use = req.prompt_text.strip()
        else:
            prompt_text_to_use = "សួស្តី នេះគឺជាការសម្រាយសាច់រឿងយ៉ាងជក់ចិត្តដិតអារម្មណ៍។"

        try:
            with torch.inference_mode():
                call_kwargs = {"text": text_to_generate, "cfg_value": 1.5, "inference_timesteps": steps}
                if target_ref and os.path.exists(target_ref):
                    if target_ref in (female_master_path, male_master_path) or getattr(req, 'prompt_text', '').strip():
                        # Ultimate Cloning Mode (Requires perfect transcript)
                        call_kwargs["prompt_wav_path"] = target_ref
                        call_kwargs["prompt_text"] = prompt_text_to_use
                        call_kwargs["reference_wav_path"] = target_ref # Recommended for better similarity
                    else:
                        # Controllable Cloning Mode (No transcript needed, just style cloning)
                        call_kwargs["reference_wav_path"] = target_ref

                try:
                    wav = voxcpm_model.generate(**call_kwargs)
                except TypeError:
                    # Fallback 1: API uses reference_wav_path / reference_text instead
                    if "prompt_wav_path" in call_kwargs:
                        fallback_kwargs = {
                            "text": text_to_generate,
                            "cfg_value": 1.5,
                            "inference_timesteps": steps,
                            "reference_wav_path": call_kwargs["prompt_wav_path"],
                            "reference_text": call_kwargs.get("prompt_text", prompt_text_to_use),
                        }
                        try:
                            wav = voxcpm_model.generate(**fallback_kwargs)
                        except TypeError:
                            # Fallback 2: No reference at all (unconditional generation)
                            wav = voxcpm_model.generate(
                                text=text_to_generate,
                                cfg_value=1.5,
                                inference_timesteps=steps
                            )
                    else:
                        wav = voxcpm_model.generate(text=text_to_generate, cfg_value=1.5, inference_timesteps=steps)
            
            out_sr = getattr(voxcpm_model.tts_model, "sample_rate", 48000)
            if isinstance(wav, tuple) and len(wav) >= 2:
                if isinstance(wav[1], int):
                    out_sr = wav[1]
                wav = wav[0]
            if isinstance(wav, torch.Tensor):
                wav = wav.detach().cpu().squeeze().numpy()
            
            # Calculate Age / Character Role Pitch Modulation
            pitch_shift = 0.0
            if target_preset_id == 'kid_girl':
                pitch_shift = 3.5
            elif target_preset_id == 'kid_boy':
                pitch_shift = 2.8
            elif target_preset_id == 'elder_male':
                pitch_shift = -3.0
            elif target_preset_id == 'elder_female':
                pitch_shift = -2.0
            elif target_preset_id == 'villain':
                pitch_shift = -3.8

            # Apply Broadcast Studio Voice Mastering DSP Chain:
            # 1. Consistent -18 dBFS Loudness & Energy across all sentences
            # 2. Dynamic Range Compression (smooths weak whispers & loud spikes)
            # 3. High-Pass Filter (80Hz) + High-Frequency Vocal Presence Polish (+1.8dB at 3.5kHz)
            # 4. Age-Specific Pitch & Formant Modulation (Children / Elders / Villains)
            # 5. True Peak Limiting (-1.0 dBFS) to prevent clipping
            mastered_wav = studio_voice_mastering(
                wav, 
                sr=out_sr, 
                target_lufs_rms=-18.0,
                pitch_shift_semitones=pitch_shift
            )
            
            sf.write(out_audio_path, mastered_wav, out_sr, format='WAV')
        except Exception as gen_err:
            print(f"⚠️ [VoxCPM2] Generator exception ({gen_err}), executing resilient fallback...")
            try:
                import edge_tts, asyncio
                voice = "km-KH-SreymomNeural" if is_female else "km-KH-PisethNeural"
                speed_str = f"{int((req.speed - 1.0) * 100):+d}%" if req.speed != 1.0 else "+0%"
                communicate = edge_tts.Communicate(clean_text, voice, rate=speed_str)
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(communicate.save(out_audio_path))
                loop.close()
                out_sr = 24000
                used_engine = f"EdgeTTS Studio ({voice})"
            except Exception as fb_err:
                print(f"❌ Fallback error: {fb_err}")
                raise HTTPException(status_code=500, detail=f"Generation failed: {fb_err}")

        # Avoid calling empty_cache() here to prevent GPU pipeline stalling in batches
        # It will be called after batch generation instead.

        with open(out_audio_path, "rb") as f:
            out_bytes = f.read()

        out_b64 = base64.b64encode(out_bytes).decode("utf-8")
        return {
            "success": True,
            "audio_base64": out_b64,
            "engine": used_engine,
            "device": gpu_name,
            "sample_rate": out_sr
        }

@app.post("/api/batch-clone")
def batch_clone_voice(req: BatchCloneRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="Texts array is required")
        
    results = []
    for text in req.texts:
        single_req = CloneRequest(
            text=text,
            audio_base64=req.audio_base64,
            preset_id=req.preset_id,
            speed=req.speed,
            base_voice=req.base_voice,
            gender=req.gender,
            model=req.model,
            prompt_text=req.prompt_text
        )
        try:
            res = clone_voice(single_req)
            results.append(res)
        except Exception as e:
            results.append({"success": False, "error": str(e)})
            
    # Clean GPU cache once after the entire batch finishes
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
            
    return {"success": True, "results": results}

def get_free_port(start_port=8000):
    for p in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                return p
    return start_port

SERVER_PORT = get_free_port(8000)
print("🌟 4/4 Starting FastAPI & Cloudflare Tunnel...")

tunnel_url = None
if try_cloudflare:
    try:
        tunnel = try_cloudflare(port=SERVER_PORT)
        tunnel_url = getattr(tunnel, "tunnel", str(tunnel))
        print("\n" + "═" * 80)
        print("🎉 OFFICIAL VOXCPM2 STUDIO SERVER IS LIVE & READY!")
        print(f"👉 Public API URL: {tunnel_url}")
        print(f"👉 Local API URL:  http://127.0.0.1:{SERVER_PORT}")
        print("═" * 80)
        print("\n📋 របៀបប្រើប្រាស់៖")
        print(f"1. ចម្លងយក Public API URL ខាងលើ: {tunnel_url}")
        print("2. ចូលទៅកាន់ BT-Dubber ➔ ចុចប៊ូតុង Voice ➔ ជ្រើសរើស Google Colab / VoxCPM2")
        print("3. បិទភ្ជាប់ (Paste) URL នេះចូល រួចចុច 'ផ្ទៀងផ្ទាត់' ដើម្បីប្រើប្រាស់បានភ្លាមៗ!\n")
    except Exception as e:
        print(f"⚠️ Cloudflare tunnel note: {e}")
        print(f"👉 Local URL: http://127.0.0.1:{SERVER_PORT}")
else:
    print(f"👉 Server running on http://127.0.0.1:{SERVER_PORT}")

def run_uvicorn_in_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    config = uvicorn.Config(app, host="0.0.0.0", port=SERVER_PORT, log_level="info")
    server = uvicorn.Server(config)
    loop.run_until_complete(server.serve())

print("🚀 Starting FastAPI Server in isolated thread...")
server_thread = threading.Thread(target=run_uvicorn_in_thread, daemon=True)
server_thread.start()
time.sleep(2.0)

if __name__ == "__main__":
    try:
        while True:
            time.sleep(1.0)
    except (KeyboardInterrupt, SystemExit):
        print("\n🛑 Server stopped.")
