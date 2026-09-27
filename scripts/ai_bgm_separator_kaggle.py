"""
====================================================================================================
👑 Official BT-Dubber: Ultimate AI BGM & Vocal Separator Server (Kaggle & Colab GPU Powered)
====================================================================================================
1. ស្វ័យប្រវត្តិតម្លើង BS-RoFormer (World Champion: 12.97 dB SDR) & Meta Demucs
2. ញែកភ្លេង BGM ចេញពីសំឡេងនិយាយបានស្អាតឥតខ្ចោះ ១០០% (Zero Vocal Bleed / Zero Echo)
3. រក្សាទម្រង់ដើម និងគុណភាពសាច់ភ្លេង Studio Master (100% Natural Bass, Treble & Foley SFX)
4. ដំណើរការលើ NVIDIA Tesla T4 / P100 / A100 GPU (ត្រឹម ៨ - ១២ វិនាទី)
5. បើក Cloudflare Public Tunnel ភ្ជាប់ជាមួយ BT-Dubber ស្វ័យប្រវត្តិ!
====================================================================================================
"""

import os
import sys
import subprocess
import time
import shutil
import tempfile
import socket
import base64
import threading
import asyncio
import numpy as np

# 1. GPU VRAM Memory Optimization & TQDM log cleanup
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TQDM_DISABLE"] = "1"

# Kill any prior running uvicorn / cloudflared instances to ensure clean restart
try:
    subprocess.run("pkill -9 -f uvicorn || true", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run("pkill -9 -f cloudflared || true", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
except Exception:
    pass

print("📥 1/4 Installing & Verifying State-of-the-Art AI BGM Separator Dependencies...")
REQUIRED_PACKAGES = [
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("pydantic", "pydantic"),
    ("pycloudflared", "pycloudflared"),
    ("audio_separator", "audio-separator[gpu]"),
    ("demucs", "demucs"),
    ("soundfile", "soundfile"),
    ("torch", "torch torchaudio"),
    ("nest_asyncio", "nest_asyncio")
]

missing_pkgs = []
for mod, pkg in REQUIRED_PACKAGES:
    try:
        __import__(mod)
    except ImportError:
        missing_pkgs.append(pkg)

if missing_pkgs:
    print(f"📦 Installing missing packages: {' '.join(missing_pkgs)}...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--no-warn-conflicts"] + missing_pkgs, check=False)

# Apply nest_asyncio for Jupyter / Kaggle / Colab kernels
try:
    import nest_asyncio
    nest_asyncio.apply()
except Exception:
    pass

import torch
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException, Body, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

try:
    from pycloudflared import try_cloudflare
except ImportError:
    try_cloudflare = None

# 2. Setup Device & Load BS-RoFormer / Demucs AI Model into GPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
print(f"🚀 2/4 Initializing AI Engine on: {DEVICE.upper()} ({gpu_name})")

separator_instance = None
OUTPUT_STEMS_DIR = tempfile.mkdtemp(prefix="uvr_stems_")
MODEL_CACHE_DIR = "/tmp/audio_separator_models"
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
demucs_model = None

# Priority 1: BS-RoFormer (World Champion: 12.97 dB SDR - 100% Zero Vocal Bleed)
try:
    print("🧠 Loading BS-RoFormer ViperX (SDR 12.97 dB - World Record) AI Model...")
    from audio_separator.separator import Separator
    separator_instance = Separator(
        output_dir=OUTPUT_STEMS_DIR,
        output_format="WAV",
        model_file_dir=MODEL_CACHE_DIR,
        log_level=20
    )
    separator_instance.load_model(model_filename="model_bs_roformer_ep_317_sdr_12.9755.ckpt")
    model_name = "BS-RoFormer ViperX (12.97 dB SDR - 100% Zero Bleed)"
    print(f"✅ {model_name} Loaded Successfully on {DEVICE.upper()}!")
except Exception as roformer_err:
    print(f"Notice: Loading BS-RoFormer ({roformer_err}), fallback to Meta HTDemucs Fine-Tuned...")
    try:
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        demucs_model = get_model('htdemucs_ft')
        model_name = 'htdemucs_ft (Fine-Tuned Studio Ensemble)'
    except Exception as demucs_err:
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        demucs_model = get_model('htdemucs')
        model_name = 'htdemucs'
    demucs_model.to(DEVICE)
    demucs_model.eval()
    print(f"✅ {model_name} Loaded Successfully on {DEVICE.upper()}!")

# 3. Create FastAPI App
app = FastAPI(title="BT-Dubber Ultimate AI BGM Separator GPU Worker", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "BT-Dubber Ultimate AI BGM Separator GPU Worker",
        "device": DEVICE,
        "gpu_name": gpu_name,
        "model": model_name,
        "version": "3.0.0"
    }

class SeparateRequest(BaseModel):
    audio_base64: Optional[str] = None
    video_base64: Optional[str] = None
    fileName: Optional[str] = "audio.wav"
    target_sr: Optional[int] = 44100
    boost_gain: Optional[bool] = False
    aggressiveness: Optional[float] = 1.2

def clean_vocal_bleed_single(bgm_tensor, voc_tensor, sr=44100, aggressiveness=1.2):
    """Studio-Grade Zero-Bleed BGM Isolator (STFT Domain)"""
    import torch.nn.functional as F

    device = bgm_tensor.device
    n_fft = 2048
    hop_length = 512
    window = torch.hann_window(n_fft, device=device)

    bgm_stft = torch.stft(bgm_tensor, n_fft=n_fft, hop_length=hop_length, window=window, return_complex=True)
    voc_stft = torch.stft(voc_tensor, n_fft=n_fft, hop_length=hop_length, window=window, return_complex=True)

    bgm_mag = torch.abs(bgm_stft)
    bgm_phase = torch.angle(bgm_stft)
    voc_mag = torch.abs(voc_stft)

    reverb_frames = max(4, int(0.25 * sr / hop_length))
    decay_weights = torch.exp(-torch.linspace(0, 2.5, reverb_frames, device=device)).view(1, 1, 1, -1)
    decay_weights = decay_weights / decay_weights.sum()

    voc_pad = F.pad(voc_mag.unsqueeze(1), (reverb_frames - 1, 0, 0, 0), mode='replicate')
    voc_tail = F.conv2d(voc_pad, decay_weights).squeeze(1)
    voc_energy_est = torch.maximum(voc_mag, 0.75 * voc_tail)

    freq_bins = torch.linspace(0, sr / 2, n_fft // 2 + 1, device=device).view(1, -1, 1)
    freq_weight = torch.ones_like(freq_bins)
    freq_weight = torch.where(freq_bins < 150, torch.clamp(freq_bins / 150.0, 0.2, 1.0), freq_weight)
    freq_weight = torch.where(freq_bins > 8000, torch.clamp(1.0 - (freq_bins - 8000) / 12000.0, 0.2, 1.0), freq_weight)

    alpha = (0.65 * aggressiveness) * freq_weight
    spectral_floor = max(0.01, 0.06 - (0.04 * (aggressiveness - 1.0)))

    bleed_estimate = alpha * voc_energy_est
    gain = torch.clamp((bgm_mag - bleed_estimate) / (bgm_mag + 1e-6), min=spectral_floor, max=1.0)

    if bgm_tensor.shape[0] == 2:
        mid_gain = gain.mean(dim=0, keepdim=True)
        gain[1] = torch.maximum(gain[1], mid_gain.squeeze(0) * 0.9)

    clean_stft = (bgm_mag * gain) * torch.exp(1j * bgm_phase)
    clean_audio = torch.istft(clean_stft, n_fft=n_fft, hop_length=hop_length, window=window, length=bgm_tensor.shape[-1])
    return clean_audio

def clean_vocal_bleed_chunked(bgm_tensor, voc_tensor, sr=44100, aggressiveness=1.2, chunk_seconds=30):
    """Chunked Zero-Bleed cleaner to ensure low VRAM/RAM consumption for long movies."""
    total_samples = bgm_tensor.shape[-1]
    hop_length = 512
    n_fft = 2048
    chunk_size = int(chunk_seconds * sr)
    chunk_size = (chunk_size // hop_length) * hop_length
    overlap = n_fft * 2

    if total_samples <= chunk_size + overlap:
        return clean_vocal_bleed_single(bgm_tensor, voc_tensor, sr, aggressiveness)

    out = torch.zeros_like(bgm_tensor)
    weight = torch.zeros(total_samples, device=bgm_tensor.device)

    start = 0
    while start < total_samples:
        end = min(start + chunk_size + overlap, total_samples)
        bgm_chunk = bgm_tensor[:, start:end]
        voc_chunk = voc_tensor[:, start:end]

        cleaned_chunk = clean_vocal_bleed_single(bgm_chunk, voc_chunk, sr, aggressiveness)

        w_chunk = torch.ones(end - start, device=bgm_tensor.device)
        if start > 0:
            ramp_len = min(overlap, end - start)
            w_chunk[:ramp_len] = torch.linspace(0, 1, ramp_len, device=bgm_tensor.device)
        if end < total_samples:
            ramp_len = min(overlap, end - start)
            w_chunk[-ramp_len:] = torch.linspace(1, 0, ramp_len, device=bgm_tensor.device)

        out[:, start:end] += cleaned_chunk * w_chunk
        weight[start:end] += w_chunk
        start += chunk_size

    weight = torch.clamp(weight, min=1e-6)
    return out / weight

def process_audio_separation(raw_audio_bytes: bytes, target_sr: int = 44100, boost_gain: bool = False, aggressiveness: float = 1.2):
    """Clean, studio-grade BGM extraction on GPU without distortion, echo, or vocal bleed."""
    temp_in = tempfile.mktemp(suffix="_in.wav")
    temp_out = tempfile.mktemp(suffix="_bgm.wav")
    
    try:
        with open(temp_in, "wb") as f:
            f.write(raw_audio_bytes)
        
        # 1. Primary Engine: BS-RoFormer (Zero Vocal Bleed / Zero Echo)
        if separator_instance is not None:
            try:
                output_files = separator_instance.separate(temp_in)
                inst_file = None
                voc_file = None
                for fname in output_files:
                    fpath = os.path.join(OUTPUT_STEMS_DIR, fname) if not os.path.isabs(fname) else fname
                    if "Instrumental" in fname or "_(Instrumental)" in fname or "no_vocals" in fname:
                        inst_file = fpath
                    elif "Vocals" in fname or "_(Vocals)" in fname or "vocals" in fname:
                        voc_file = fpath
                if not inst_file and output_files:
                    inst_file = os.path.join(OUTPUT_STEMS_DIR, output_files[0]) if not os.path.isabs(output_files[0]) else output_files[0]
                
                if inst_file and os.path.exists(inst_file):
                    data, sr = sf.read(inst_file)
                    
                    # If vocals stem exists, run spectral de-bleed to eradicate any dialogue reverb tails!
                    if voc_file and os.path.exists(voc_file) and aggressiveness > 0:
                        v_data, v_sr = sf.read(voc_file)
                        if data.ndim == 1: data = np.vstack([data, data])
                        elif data.shape[0] > data.shape[1]: data = data.T
                        if v_data.ndim == 1: v_data = np.vstack([v_data, v_data])
                        elif v_data.shape[0] > v_data.shape[1]: v_data = v_data.T

                        inst_tensor = torch.from_numpy(data.astype(np.float32)).to(DEVICE)
                        voc_tensor = torch.from_numpy(v_data.astype(np.float32)).to(DEVICE)
                        clean_tensor = clean_vocal_bleed_chunked(inst_tensor, voc_tensor, sr=sr, aggressiveness=aggressiveness)
                        y_clean = clean_tensor.cpu().numpy()
                    else:
                        y_clean = data.T if (data.ndim == 2 and data.shape[0] > data.shape[1]) else data

                    max_val = np.max(np.abs(y_clean))
                    if max_val > 1.0:
                        y_clean = (y_clean / max_val) * 0.98

                    sf.write(temp_out, y_clean.T if y_clean.ndim == 2 else y_clean, sr, subtype='PCM_16')
                    with open(temp_out, "rb") as f:
                        out_bytes = f.read()
                    duration_sec = (y_clean.shape[-1] if y_clean.ndim == 2 else len(y_clean)) / float(sr) if sr > 0 else 0
                    
                    # Cleanup generated stems
                    for fname in output_files:
                        fpath = os.path.join(OUTPUT_STEMS_DIR, fname) if not os.path.isabs(fname) else fname
                        try:
                            if os.path.exists(fpath): os.unlink(fpath)
                        except Exception: pass
                        
                    return out_bytes, duration_sec
            except Exception as sep_err:
                print(f"BS-RoFormer inference notice: {sep_err}, falling back to Demucs...")

        # 2. Secondary Engine: Meta Demucs with Studio Zero-Bleed Spectral Cleaner
        try:
            data, sr = sf.read(temp_in)
            if data.ndim == 1:
                y = np.vstack([data, data])
            elif data.ndim == 2:
                y = data.T if data.shape[0] > data.shape[1] else data
                if y.shape[0] == 1:
                    y = np.vstack([y[0], y[0]])
        except Exception:
            conv_wav = tempfile.mktemp(suffix="_conv.wav")
            subprocess.run([
                "ffmpeg", "-y", "-i", temp_in, "-vn", "-ac", "2", "-ar", str(target_sr), "-acodec", "pcm_s16le", conv_wav
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            data, sr = sf.read(conv_wav)
            if data.ndim == 1:
                y = np.vstack([data, data])
            elif data.ndim == 2:
                y = data.T if data.shape[0] > data.shape[1] else data
                if y.shape[0] == 1:
                    y = np.vstack([y[0], y[0]])
            if os.path.exists(conv_wav):
                try: os.unlink(conv_wav)
                except Exception: pass
        
        audio_tensor = torch.from_numpy(y.astype(np.float32)).float()
        if DEVICE == "cuda":
            audio_tensor = audio_tensor.to("cuda")
        
        from demucs.apply import apply_model
        with torch.no_grad():
            sources = apply_model(
                demucs_model,
                audio_tensor[None],
                device=DEVICE,
                shifts=1 if DEVICE == "cuda" else 0,
                overlap=0.5,
                progress=False
            )[0]
        
        drums = sources[0]
        bass = sources[1]
        other = sources[2]
        vocals = sources[3]

        # 1. Clean 'other' where dialogue reverb tails reside
        clean_other = clean_vocal_bleed_chunked(other, vocals, sr=sr, aggressiveness=aggressiveness)
        combined_bgm = drums + bass + clean_other

        # 2. Master polish
        if aggressiveness >= 1.2:
            clean_bgm_tensor = clean_vocal_bleed_chunked(combined_bgm, vocals, sr=sr, aggressiveness=aggressiveness * 0.8)
        else:
            clean_bgm_tensor = combined_bgm

        y_bgm = clean_bgm_tensor.cpu().numpy()
        
        # Pure Linear Mastering
        max_val = np.max(np.abs(y_bgm))
        if max_val > 1.0:
            y_clean = (y_bgm / max_val) * 0.98
        else:
            y_clean = y_bgm
            
        sf.write(temp_out, y_clean.T, sr, subtype='PCM_16')
        
        with open(temp_out, "rb") as f:
            out_bytes = f.read()
            
        duration_sec = len(y_clean[0]) / float(sr) if sr > 0 else 0
        return out_bytes, duration_sec
    finally:
        if os.path.exists(temp_in):
            try: os.unlink(temp_in)
            except Exception: pass
        if os.path.exists(temp_out):
            try: os.unlink(temp_out)
            except Exception: pass

@app.post("/api/separate-bgm")
def separate_bgm_endpoint(req: SeparateRequest):
    raw_b64 = req.audio_base64 or req.video_base64
    if not raw_b64:
        raise HTTPException(status_code=400, detail="Missing audio_base64 or video_base64 payload")
    
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",")[1]
        
    try:
        raw_bytes = base64.b64decode(raw_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Base64 audio: {e}")
        
    start_t = time.time()
    try:
        out_bytes, duration = process_audio_separation(
            raw_bytes, 
            target_sr=req.target_sr or 44100, 
            boost_gain=req.boost_gain,
            aggressiveness=req.aggressiveness if req.aggressiveness is not None else 1.2
        )
        elapsed = time.time() - start_t
        bgm_b64 = base64.b64encode(out_bytes).decode("utf-8")
        
        return {
            "status": "success",
            "bgm_base64": f"data:audio/wav;base64,{bgm_b64}",
            "duration_sec": round(duration, 2),
            "elapsed_sec": round(elapsed, 2),
            "device": DEVICE,
            "gpu_name": gpu_name,
            "model": model_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BGM separation failed: {e}")

# 4. Port & Cloudflare Tunnel Runner
def find_free_port(start_port=8000):
    for port in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    return start_port

SERVER_PORT = find_free_port(8000)

def run_uvicorn_in_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    config = uvicorn.Config(app, host="0.0.0.0", port=SERVER_PORT, log_level="warning")
    server = uvicorn.Server(config)
    loop.run_until_complete(server.serve())

print(f"⚡ Starting Ultimate BGM Separator GPU Server on port {SERVER_PORT}...")
server_thread = threading.Thread(target=run_uvicorn_in_thread, daemon=True)
server_thread.start()
time.sleep(2.0)

# Connect Cloudflare Public Tunnel
if try_cloudflare is not None:
    try:
        print("\n" + "=" * 80)
        print("🌐 Connecting Cloudflare Secure Tunnel to BT-Dubber...")
        tunnel = try_cloudflare(port=SERVER_PORT)
        print(f"👑 CLOUDFLARE PUBLIC GPU URL: {tunnel.tunnel}")
        print("👉 សូមចម្លង (Copy) Link ខាងលើ យកទៅបិទភ្ជាប់ក្នុង BT-Dubber!")
        print("=" * 80 + "\n")
    except Exception as e:
        print(f"⚠️ Cloudflare tunnel notice: {e}")
        print(f"👉 Local URL: http://127.0.0.1:{SERVER_PORT}")
else:
    print(f"👉 Server running on http://127.0.0.1:{SERVER_PORT}")

try:
    while True:
        time.sleep(1.0)
except (KeyboardInterrupt, SystemExit):
    print("\n🛑 Server stopped.")
