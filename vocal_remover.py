import sys
import os
import av
import librosa
import soundfile as sf
import numpy as np

def load_audio_any_format(file_path, target_sr=44100):
    try:
        container = av.open(file_path)
        audio_stream = next((s for s in container.streams if s.type == 'audio'), None)
        if audio_stream is None:
            raise ValueError("No audio stream in file")
            
        resampler = av.AudioResampler(format='fltp', layout='stereo', rate=target_sr)
        frames = []
        for packet in container.demux(audio_stream):
            for frame in packet.decode():
                r_frames = resampler.resample(frame)
                if r_frames:
                    for rf in r_frames:
                        frames.append(rf.to_ndarray())
                    
        if not frames:
            raise ValueError("Could not decode audio frames")
            
        y = np.concatenate(frames, axis=1)
        return y, target_sr
    except Exception as e:
        print(f"PyAV decode fallback note: {e}")
        y, sr = librosa.load(file_path, sr=target_sr, mono=False)
        if y.ndim == 1:
            y = np.vstack([y, y])
        return y, target_sr

def separate_bgm(input_path, output_path):
    print(f"Loading and decoding audio from: {input_path}")
    y, sr = load_audio_any_format(input_path, target_sr=44100)
    
    n_fft = 2048
    hop_length = 512
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    vocal_bins = (freqs >= 180) & (freqs <= 4200)

    def process_channel(signal):
        S_full, phase = librosa.magphase(librosa.stft(signal, n_fft=n_fft, hop_length=hop_length))
        
        # Decompose into Harmonic music and Percussive transients
        H, P = librosa.decompose.hpss(S_full, margin=(1.0, 5.0))
        
        # Calculate vocal residue
        vocal_component = np.maximum(0, S_full - H)
        
        # Softmask with power=3.5 for deep vocal rejection
        mask_bgm = librosa.util.softmask(H, 4.0 * vocal_component, power=3.5)
        
        # Suppress residual vocal frequencies (-26dB in voice range)
        mask_bgm[vocal_bins, :] = mask_bgm[vocal_bins, :] * 0.05
        
        # Reconstruct clean BGM
        S_bgm = mask_bgm * S_full
        return librosa.istft(S_bgm * phase, hop_length=hop_length)

    ch0 = process_channel(y[0])
    ch1 = process_channel(y[1])
    min_len = min(len(ch0), len(ch1))
    y_bgm = np.vstack([ch0[:min_len], ch1[:min_len]])
    
    # Normalize volume
    max_val = np.max(np.abs(y_bgm))
    if max_val > 0:
        y_bgm = (y_bgm / max_val) * 0.92
        
    sf.write(output_path, y_bgm.T, sr, subtype='PCM_16')
    print(f"Successfully separated and saved clean BGM to: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python vocal_remover.py <input> <output>")
        sys.exit(1)
    separate_bgm(sys.argv[1], sys.argv[2])
