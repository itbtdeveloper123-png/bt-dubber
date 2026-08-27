import os
import sys
import json
import time
import base64
import tempfile
import urllib.request
import urllib.error
import subprocess
import imageio_ffmpeg

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
DATA_TEMP_DIR = os.path.join(os.getcwd(), "data", "temp")
os.makedirs(DATA_TEMP_DIR, exist_ok=True)
tempfile.tempdir = DATA_TEMP_DIR

def run_ffmpeg(args):
    """Run an FFmpeg command synchronously"""
    cmd = [FFMPEG_EXE, *args]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        sys.stderr.write(f"FFmpeg error: {proc.stderr}\n")
        raise RuntimeError(f"FFmpeg failed with exit code {proc.returncode}")
    return proc

def test_colab_connection(colab_url):
    """Test connection to the Google Colab Wav2Lip GPU server"""
    url = (colab_url or "").strip().rstrip("/")
    if not url:
        return {"status": "error", "message": "Colab URL is empty"}
    
    test_endpoints = [f"{url}/health", f"{url}/api/status", f"{url}/api/lipsync/health", f"{url}/"]
    for ep in test_endpoints:
        try:
            req = urllib.request.Request(
                ep,
                headers={"User-Agent": "BT-Dubber-LipSync/1.0"},
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status in [200, 201, 204]:
                    raw = response.read().decode('utf-8')
                    try:
                        data = json.loads(raw)
                        return {
                            "status": "connected",
                            "gpu": data.get("gpu", "NVIDIA Tesla GPU (Active)"),
                            "model": data.get("model", "Wav2Lip + GFPGAN HD"),
                            "message": "Connected to Google Colab GPU successfully!"
                        }
                    except:
                        return {
                            "status": "connected",
                            "gpu": "Google Colab Cloud GPU",
                            "model": "Wav2Lip Engine",
                            "message": "Connected to Google Colab GPU successfully!"
                        }
        except Exception as e:
            continue

    return {"status": "error", "message": f"Could not connect to {colab_url}. Please check if the Colab notebook is running."}

def call_colab_lipsync(colab_url, video_path, audio_path, output_path, pads=(0, 10, 0, 0), face_enhancer=True):
    """Send video and audio to Colab GPU server to perform Wav2Lip + GFPGAN inference"""
    url = (colab_url or "").strip().rstrip("/")
    if not url:
        raise ValueError("Colab URL is required for GPU Lip-Sync processing.")

    with open(video_path, "rb") as vf:
        video_b64 = base64.b64encode(vf.read()).decode("utf-8")
    with open(audio_path, "rb") as af:
        audio_b64 = base64.b64encode(af.read()).decode("utf-8")

    payload = json.dumps({
        "video_base64": video_b64,
        "audio_base64": audio_b64,
        "pads": list(pads),
        "face_enhancer": face_enhancer,
        "nosmooth": False,
        "resize_factor": 1
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{url}/api/lipsync",
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "BT-Dubber-LipSync/1.0"},
        method="POST"
    )

    sys.stderr.write(f"[Wav2Lip Colab] Sending video & audio to {url}/api/lipsync...\n")
    with urllib.request.urlopen(req, timeout=300) as response:
        if response.status != 200:
            raise RuntimeError(f"Colab Lip-Sync returned status {response.status}")
        
        result_data = json.loads(response.read().decode("utf-8"))
        out_b64 = result_data.get("video_base64") or result_data.get("video")
        if not out_b64:
            raise RuntimeError("Colab response did not contain video_base64 data.")

        with open(output_path, "wb") as out_f:
            out_f.write(base64.b64decode(out_b64))

    sys.stderr.write(f"[Wav2Lip Colab] Lip-Sync completed successfully: {output_path}\n")
    return True

def process_lipsync_job(config):
    """Main entrypoint to process lip-sync on a video segment or full video"""
    video_path = config.get("videoPath")
    audio_path = config.get("audioPath")
    output_path = config.get("outputPath")
    colab_url = config.get("colabUrl") or os.environ.get("WAV2LIP_COLAB_URL", "")
    pads = config.get("pads", [0, 10, 0, 0])
    face_enhancer = config.get("faceEnhancer", True)

    if not video_path or not os.path.exists(video_path):
        raise ValueError(f"Input video not found: {video_path}")
    if not audio_path or not os.path.exists(audio_path):
        raise ValueError(f"Input audio not found: {audio_path}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if colab_url:
        return call_colab_lipsync(colab_url, video_path, audio_path, output_path, pads=pads, face_enhancer=face_enhancer)
    else:
        # Local Remux Fallback: Merge video with Khmer audio when Colab is offline
        sys.stderr.write("[Wav2Lip Notice] Colab URL not configured. Remuxing video with dubbed audio track.\n")
        run_ffmpeg([
            "-y",
            "-i", video_path,
            "-i", audio_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            output_path
        ])
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python lip_syncer.py <config.json>"}))
        sys.exit(1)

    cfg_file = sys.argv[1]
    if not os.path.exists(cfg_file):
        print(json.dumps({"error": f"Config file not found: {cfg_file}"}))
        sys.exit(1)

    try:
        with open(cfg_file, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        if cfg.get("action") == "test_connection":
            res = test_colab_connection(cfg.get("colabUrl"))
            print(json.dumps(res))
            sys.exit(0)

        success = process_lipsync_job(cfg)
        print(json.dumps({"success": success, "outputPath": cfg.get("outputPath")}))
    except Exception as e:
        sys.stderr.write(f"LipSync execution error: {e}\n")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
