import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as any,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      watch: {
        ignored: [
          '**/data/**',
          '**/uploads/**',
          '**/temp/**',
          '**/exports/**',
          '**/*.db*',
          '**/*.mp4',
          '**/*.webm',
          '**/*.zip',
          '**/*.wav',
          '**/*.mp3',
          '**/*.srt'
        ]
      },
    },
  };
});
