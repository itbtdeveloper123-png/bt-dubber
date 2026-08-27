import os
import sys
import json
import traceback
import tempfile
import subprocess
import numpy as np

# Configure local temp directory on Drive D
DATA_TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "temp")
os.makedirs(DATA_TEMP_DIR, exist_ok=True)
tempfile.tempdir = DATA_TEMP_DIR

try:
    import librosa
    import soundfile as sf
except Exception as e:
    sys.stderr.write(f"Audio package notice: {e}\n")

try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = "ffmpeg"

def analyze_voice_sample(audio_path):
    """Analyze a creator's recorded or uploaded voice sample to extract exact F0 pitch, vocal timbre, and gender"""
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Sample audio not found: {audio_path}")

    # Use ffmpeg to guarantee 100% format support (MP3, WAV, M4A, OGG, AAC, WebM, FLAC)
    converted_wav = tempfile.mktemp(suffix="_conv.wav", dir=DATA_TEMP_DIR)
    load_path = audio_path
    try:
        cmd = [FFMPEG_EXE, "-y", "-i", audio_path, "-vn", "-ac", "1", "-ar", "22050", converted_wav]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(converted_wav) and os.path.getsize(converted_wav) > 1000:
            load_path = converted_wav
    except Exception as e:
        sys.stderr.write(f"FFmpeg decode notice: {e}\n")

    try:
        y, sr = librosa.load(load_path, sr=22050, mono=True)
    finally:
        if os.path.exists(converted_wav):
            try:
                os.unlink(converted_wav)
            except Exception:
                pass
    
    # 1. Pitch Fundamental F0 analysis (YIN algorithm)
    f0 = librosa.yin(y, fmin=55, fmax=480, sr=sr)
    # Filter out unvoiced / zero / extreme noise frames
    voiced_f0 = f0[(f0 > 65) & (f0 < 450)]
    
    if len(voiced_f0) > 0:
        mean_f0 = float(np.median(voiced_f0))
    else:
        mean_f0 = 140.0
        
    # 2. Spectral Centroid (Timbre brightness)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    mean_centroid = float(np.mean(centroid))
    
    # 3. Spectral Rolloff & Bandwidth (Resonance & Warmth)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    mean_rolloff = float(np.mean(rolloff))
    
    # Determine inferred gender & base model calibration for deep adult resonance
    # Calibrated against mature adult vocal ranges
    if mean_f0 < 160:
        inferred_gender = "male"
        base_voice = "km-KH-PisethNeural"
        pitch_offset = int(round(mean_f0 - 140)) # Deeper adult male resonance
    else:
        inferred_gender = "female"
        base_voice = "km-KH-SreymomNeural"
        pitch_offset = int(round(mean_f0 - 230)) # Deeper mature adult female resonance
        
    # Formant shift approximation based on centroid
    if mean_centroid < 1800:
        timbre_preset = "warm_deep"
        formant_shift = 0.92
    elif mean_centroid > 2800:
        timbre_preset = "crisp_clear"
        formant_shift = 1.08
    else:
        timbre_preset = "natural"
        formant_shift = 1.0
        
    return {
        "success": True,
        "meanF0": round(mean_f0, 1),
        "inferredGender": inferred_gender,
        "baseVoice": base_voice,
        "pitchOffset": max(-45, min(45, pitch_offset)),
        "formantShift": round(formant_shift, 2),
        "timbrePreset": timbre_preset,
        "spectralCentroid": round(mean_centroid, 1),
        "durationSec": round(len(y) / sr, 2)
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python voice_cloner.py <action> <path> [options]"}))
        sys.exit(1)
        
    action = sys.argv[1]
    target_path = sys.argv[2]
    
    try:
        if action == "analyze":
            result = analyze_voice_sample(target_path)
            print(json.dumps(result))
        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
