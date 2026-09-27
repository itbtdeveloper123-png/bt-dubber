import sys
import os
import tempfile
import subprocess
import soundfile as sf
import numpy as np

# Force UTF-8 encoding on Windows
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

def extract_and_load_wav(input_path, target_sr=44100):
    """Extract audio from video file using FFmpeg into clean WAV, then load with soundfile."""
    conv_wav = tempfile.mktemp(suffix="_audio_in.wav", dir=DATA_TEMP_DIR)
    try:
        cmd = [
            FFMPEG_EXE, "-y",
            "-i", input_path,
            "-vn",
            "-ac", "2",
            "-ar", str(target_sr),
            "-acodec", "pcm_s16le",
            conv_wav
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
        if not os.path.exists(conv_wav) or os.path.getsize(conv_wav) < 100:
            raise ValueError("FFmpeg failed to extract audio stream from video")
            
        data, sr = sf.read(conv_wav)
        if data.ndim == 1:
            y = np.vstack([data, data])
        elif data.ndim == 2:
            y = data.T if data.shape[0] > data.shape[1] else data
            if y.shape[0] == 1:
                y = np.vstack([y[0], y[0]])
        return y.astype(np.float32), sr
    finally:
        if os.path.exists(conv_wav):
            try:
                os.unlink(conv_wav)
            except Exception:
                pass

def clean_vocal_bleed_single(bgm_tensor, voc_tensor, sr=44100, aggressiveness=1.2):
    """
    Studio-Grade Zero-Bleed BGM Isolator (STFT Domain)
    - Spectral Subtraction tuned for human vocal formants (150Hz - 7.5kHz)
    - Temporal decay to eliminate dialogue room reverberation & echo tails (~250ms)
    - Center-channel dialogue suppression while preserving stereo music/ambient width
    """
    import torch
    import torch.nn.functional as F

    device = bgm_tensor.device
    n_fft = 2048
    hop_length = 512
    window = torch.hann_window(n_fft, device=device)

    # 1. STFT
    bgm_stft = torch.stft(bgm_tensor, n_fft=n_fft, hop_length=hop_length, window=window, return_complex=True)
    voc_stft = torch.stft(voc_tensor, n_fft=n_fft, hop_length=hop_length, window=window, return_complex=True)

    bgm_mag = torch.abs(bgm_stft)
    bgm_phase = torch.angle(bgm_stft)
    voc_mag = torch.abs(voc_stft)

    # 2. Smooth vocal magnitude across time to capture room reverb tails (~250ms)
    reverb_frames = max(4, int(0.25 * sr / hop_length))
    decay_weights = torch.exp(-torch.linspace(0, 2.5, reverb_frames, device=device)).view(1, 1, 1, -1)
    decay_weights = decay_weights / decay_weights.sum()

    voc_pad = F.pad(voc_mag.unsqueeze(1), (reverb_frames - 1, 0, 0, 0), mode='replicate')
    voc_tail = F.conv2d(voc_pad, decay_weights).squeeze(1)

    # Blend direct speech + reverb tail
    voc_energy_est = torch.maximum(voc_mag, 0.75 * voc_tail)

    # 3. Frequency emphasis curve (vocal fundamental & formants: 150Hz - 7.5kHz)
    freq_bins = torch.linspace(0, sr / 2, n_fft // 2 + 1, device=device).view(1, -1, 1)
    freq_weight = torch.ones_like(freq_bins)
    freq_weight = torch.where(freq_bins < 150, torch.clamp(freq_bins / 150.0, 0.2, 1.0), freq_weight)
    freq_weight = torch.where(freq_bins > 8000, torch.clamp(1.0 - (freq_bins - 8000) / 12000.0, 0.2, 1.0), freq_weight)

    alpha = (0.65 * aggressiveness) * freq_weight
    spectral_floor = max(0.01, 0.06 - (0.04 * (aggressiveness - 1.0)))

    bleed_estimate = alpha * voc_energy_est
    gain = torch.clamp((bgm_mag - bleed_estimate) / (bgm_mag + 1e-6), min=spectral_floor, max=1.0)

    # 4. Center-channel speech suppression (Mid/Side)
    if bgm_tensor.shape[0] == 2:
        mid_gain = gain.mean(dim=0, keepdim=True)
        # Preserve stereo width and ambience
        gain[1] = torch.maximum(gain[1], mid_gain.squeeze(0) * 0.9)

    clean_stft = (bgm_mag * gain) * torch.exp(1j * bgm_phase)
    clean_audio = torch.istft(clean_stft, n_fft=n_fft, hop_length=hop_length, window=window, length=bgm_tensor.shape[-1])
    return clean_audio

def clean_vocal_bleed_chunked(bgm_tensor, voc_tensor, sr=44100, aggressiveness=1.2, chunk_seconds=30):
    """Chunked Zero-Bleed cleaner to ensure ultra-low RAM consumption for long movies."""
    import torch
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

def separate_bgm_demucs(input_path, output_path, aggressiveness=1.2):
    print("PROGRESS:5", flush=True)
    y, sr = extract_and_load_wav(input_path, target_sr=44100)
    
    print("PROGRESS:12", flush=True)
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    # Auto-detect CUDA GPU Acceleration, otherwise optimize CPU multi-threading
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        try:
            torch.set_num_threads(os.cpu_count() or 4)
        except Exception:
            pass

    # Load HTDemucs Fine-Tuned model (or fallback to htdemucs)
    try:
        model = get_model('htdemucs_ft')
    except Exception:
        model = get_model('htdemucs')
    model.to(device)
    model.eval()
    
    audio_tensor = torch.from_numpy(y).float()
    if device == "cuda":
        audio_tensor = audio_tensor.to("cuda")
    
    print("PROGRESS:18", flush=True)
    
    audio_length = max(1, y.shape[1])
    # Real-time progress callback for Demucs chunks (scales from 18% to 90%)
    def demucs_progress_callback(info):
        offset = info.get('segment_offset', 0) if isinstance(info, dict) else 0
        fraction = min(1.0, max(0.0, float(offset) / audio_length))
        scaled_pct = int(18 + (fraction * 72)) # 18% -> 90%
        print(f"PROGRESS:{min(90, max(18, scaled_pct))}", flush=True)

    with torch.no_grad():
        # High fidelity separation: overlap=0.5 eliminates boundary artifacts & phasing
        sources = apply_model(
            model,
            audio_tensor[None],
            device=device,
            shifts=1 if device == "cuda" else 0,
            overlap=0.5,
            callback=demucs_progress_callback
        )[0]
    
    print("PROGRESS:92", flush=True)
    
    # Stems: 0: drums, 1: bass, 2: other, 3: vocals
    drums = sources[0]
    bass = sources[1]
    other = sources[2]
    vocals = sources[3]

    # Base Instrumental Track (Drums + Bass + Foley/Instruments)
    bgm_tensor = drums + bass + other

    # Apply Studio Zero-Bleed Spectral De-Bleed
    # 1. Clean 'other' stem where dialogue reverb & bleed primarily reside
    clean_other = clean_vocal_bleed_chunked(other, vocals, sr=sr, aggressiveness=aggressiveness)
    
    # 2. Combine with punchy drums and deep bass
    combined_bgm = drums + bass + clean_other
    
    # 3. If aggressive mode is requested (>= 1.2), perform a master touchup on combined BGM
    if aggressiveness >= 1.2:
        clean_bgm_tensor = clean_vocal_bleed_chunked(combined_bgm, vocals, sr=sr, aggressiveness=aggressiveness * 0.8)
    else:
        clean_bgm_tensor = combined_bgm

    print("PROGRESS:96", flush=True)
    y_bgm = clean_bgm_tensor.cpu().numpy()
    
    # Clean linear mastering: Preserves 100% original acoustics & dynamics
    max_val = np.max(np.abs(y_bgm))
    if max_val > 1.0:
        y_clean = (y_bgm / max_val) * 0.98
    else:
        y_clean = y_bgm
        
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    sf.write(output_path, y_clean.T, sr, subtype='PCM_16')
    print("PROGRESS:100", flush=True)
    print(f"Demucs AI successfully isolated clean Zero-Bleed BGM: {output_path}", flush=True)

def separate_bgm(input_path, output_path, aggressiveness=1.2):
    try:
        separate_bgm_demucs(input_path, output_path, aggressiveness=aggressiveness)
    except Exception as demucs_err:
        print(f"ERROR: Demucs AI separation failed: {demucs_err}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python vocal_remover.py <input> <output> [aggressiveness]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    agg = float(sys.argv[3]) if len(sys.argv) > 3 else 1.2
    separate_bgm(input_file, output_file, aggressiveness=agg)
