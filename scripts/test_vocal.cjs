const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const tempDir = path.join(__dirname, '..', 'data', 'temp_bgm');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const inWav = path.join(tempDir, 'test_in.wav');
const outWav = path.join(tempDir, 'test_out.wav');

// Create 1 second of stereo test WAV
const sampleRate = 44100;
const numSamples = sampleRate * 1;
const buffer = Buffer.alloc(44 + numSamples * 4);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 4, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(2, 22); // Stereo
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 4, 28);
buffer.writeUInt16LE(4, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 4, 40);

for (let i = 0; i < numSamples; i++) {
  const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
  const intSample = Math.floor(sample * 32767);
  buffer.writeInt16LE(intSample, 44 + i * 4);
  buffer.writeInt16LE(intSample, 44 + i * 4 + 2);
}
fs.writeFileSync(inWav, buffer);

try {
  const res = execSync(`python vocal_remover.py "${inWav}" "${outWav}"`, { encoding: 'utf8' });
  console.log('Result:', res);
  console.log('Output file exists:', fs.existsSync(outWav), 'size:', fs.statSync(outWav).size);
} catch (err) {
  console.error('Error executing vocal_remover.py:', err.message, err.stderr?.toString());
}
