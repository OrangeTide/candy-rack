// SPDX-License-Identifier: 0BSD

// In-browser WAV recorder. Renders the pattern offline (deterministic, no audio
// hardware needed) and hands the viewer a 16-bit stereo WAV to download.
import { renderPattern } from '../../core/offline-render.js';
import { engines } from '../../core/worklet/registry.js';
import { brand } from 'machine-config';

// File-name slug for this machine (grape, lemon, strawberry, ...).
const SLUG = brand.name.toLowerCase();

function encodeWav(left, right, sampleRate) {
  const n = left.length;
  const channels = 2;
  const dataSize = n * channels * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };

  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);            // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    dv.setInt16(o, (l * 32767) | 0, true); o += 2;
    dv.setInt16(o, (r * 32767) | 0, true); o += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

// Encode stereo buffers to a WAV and trigger a download. Returns the clip length
// in seconds. Shared by the offline bounce and the Live master-tap recording.
export function downloadWav(left, right, sampleRate, tag) {
  const blob = encodeWav(left, right, sampleRate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `candyrack-${SLUG}-${tag}.wav`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return left.length / sampleRate;
}

// Bounce the pattern offline (deterministic, no audio hardware) and download it.
// Returns the clip length in seconds.
export function recordWav(pattern, mode) {
  const { left, right, sampleRate } = renderPattern(pattern, { engines, mode, sampleRate: 48000 });
  return downloadWav(left, right, sampleRate, mode);
}
