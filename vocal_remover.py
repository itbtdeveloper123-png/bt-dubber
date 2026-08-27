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

def separate_bgm_demucs(input_path, output_path):
    print("PROGRESS:5", flush=True)
    y, sr = extract_and_load_wav(input_path, target_sr=44100)
    
    print("PROGRESS:12", flush=True)
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    # Load HTDemucs pre-trained model
    model = get_model('htdemucs')
    model.cpu()
    model.eval()
    
    audio_tensor = torch.from_numpy(y).float()
    
    print("PROGRESS:18", flush=True)
    
    audio_length = max(1, y.shape[1])
    # Real-time progress callback for Demucs chunks (scales from 18% to 92%)
    def demucs_progress_callback(info):
        offset = info.get('segment_offset', 0) if isinstance(info, dict) else 0
        fraction = min(1.0, max(0.0, float(offset) / audio_length))
        scaled_pct = int(18 + (fraction * 74)) # 18% -> 92%
        print(f"PROGRESS:{min(94, max(18, scaled_pct))}", flush=True)

    with torch.no_grad():
        sources = apply_model(model, audio_tensor[None], device='cpu', callback=demucs_progress_callback)[0]
    
    print("PROGRESS:95", flush=True)
    
    # Instrumental BGM = drums (0) + bass (1) + other (2) (100% pure music, no vocals!)
    no_vocals = sources[0] + sources[1] + sources[2]
    y_bgm = no_vocals.cpu().numpy()
    
    # Master Dynamic Gain Boost + Soft Limiter for loud, punchy BGM
    max_val = np.max(np.abs(y_bgm))
    if max_val > 1e-6:
        target_gain = 2.4 / max(max_val, 0.01)
        y_boosted = np.tanh(y_bgm * min(target_gain, 3.5)) * 0.98
    else:
        y_boosted = y_bgm
        
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    sf.write(output_path, y_boosted.T, sr, subtype='PCM_16')
    print("PROGRESS:100", flush=True)
    print(f"Demucs AI successfully isolated and boosted BGM: {output_path}", flush=True)

def separate_bgm_fallback(input_path, output_path):
    import scipy.signal as sp_signal
    
    print("PROGRESS:30", flush=True)
    y, sr = extract_and_load_wav(input_path, target_sr=32000)
    left, right = y[0], y[1]
    
    print("PROGRESS:60", flush=True)
    sos_low = sp_signal.butter(4, 150, btype='low', fs=sr, output='sos')
    bass_mono = sp_signal.sosfilt(sos_low, (left + right) * 0.5)
    
    sos_high = sp_signal.butter(4, 150, btype='high', fs=sr, output='sos')
    side_clean = sp_signal.sosfilt(sos_high, (left - right) * 0.5)
    
    bgm_left = bass_mono + (1.2 * side_clean)
    bgm_right = bass_mono - (1.2 * side_clean)
    min_len = min(len(bgm_left), len(bgm_right))
    y_bgm = np.vstack([bgm_left[:min_len], bgm_right[:min_len]])
    
    max_val = np.max(np.abs(y_bgm))
    if max_val > 1e-6:
        y_bgm = (y_bgm / max_val) * 0.98
        
    print("PROGRESS:90", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    sf.write(output_path, y_bgm.T, sr, subtype='PCM_16')
    print("PROGRESS:100", flush=True)

def separate_bgm(input_path, output_path):
    try:
        separate_bgm_demucs(input_path, output_path)
    except Exception as demucs_err:
        print(f"Demucs notice: {demucs_err}, falling back to DSP...", file=sys.stderr, flush=True)
        try:
            separate_bgm_fallback(input_path, output_path)
        except Exception as dsp_err:
            print(f"ERROR: Both Demucs and DSP fallback failed: {demucs_err} / {dsp_err}", file=sys.stderr, flush=True)
            sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python vocal_remover.py <input> <output>")
        sys.exit(1)
    separate_bgm(sys.argv[1], sys.argv[2])
