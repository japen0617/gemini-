/**
 * Audio Utilities: duration detection, audio slicing/chunking, format conversion
 */

export interface AudioMetadata {
  duration: number; // in seconds
  durationFormatted: string;
  isOver30Minutes: boolean;
  suggestedChunkCount: number;
  chunkDurationMinutes?: number;
  chunkDurationSec?: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Convert File or Blob to Base64 String (without data URL prefix)
 */
export function fileToBase64(file: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Convert Base64 Audio (PCM or WAV) to playable WAV Blob
 */
export function pcmBase64ToWavBlob(
  base64Data: string,
  sampleRate = 24000,
  numChannels = 1
): Blob {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Check if it already has RIFF header
  if (
    len >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF'
  ) {
    return new Blob([bytes], { type: 'audio/wav' });
  }

  // Otherwise, wrap raw PCM with standard 44-byte WAV header
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, len, true);

  return new Blob([wavHeader, bytes], { type: 'audio/wav' });
}

/**
 * Helper to check if a file or MIME string is a video (MP4, MOV, WebM, etc.)
 */
export function isVideoFile(fileOrType: File | Blob | string): boolean {
  if (!fileOrType) return false;
  if (typeof fileOrType === 'string') {
    const s = fileOrType.toLowerCase();
    return s.startsWith('video/') || s.endsWith('.mp4') || s.endsWith('.mov') || s.endsWith('.m4v') || s.endsWith('.webm') || s.endsWith('.mkv') || s.endsWith('.avi');
  }
  const type = (fileOrType.type || '').toLowerCase();
  const name = ('name' in fileOrType && typeof (fileOrType as File).name === 'string')
    ? (fileOrType as File).name.toLowerCase()
    : '';
  return type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.m4v') || name.endsWith('.webm') || name.endsWith('.mkv') || name.endsWith('.avi');
}

/**
 * Inspect Audio or Video duration and basic metadata
 */
export async function getAudioMetadata(file: File | Blob, chunkDurationMinutes: number = 3): Promise<AudioMetadata> {
  let duration = 0;
  let sampleRate = 44100;
  let channels = 2;
  const isVideo = isVideoFile(file);

  // Fast path for video files using HTMLVideoElement
  if (isVideo) {
    try {
      duration = await new Promise<number>((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        let resolved = false;

        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanUp();
            resolve(0);
          }
        }, 800);

        const cleanUp = () => {
          clearTimeout(timer);
          video.onloadedmetadata = null;
          video.onerror = null;
          URL.revokeObjectURL(url);
        };

        video.onloadedmetadata = () => {
          if (!resolved && isFinite(video.duration) && video.duration > 0) {
            resolved = true;
            const dur = video.duration;
            cleanUp();
            resolve(dur);
          }
        };

        video.onerror = () => {
          if (!resolved) {
            resolved = true;
            cleanUp();
            resolve(0);
          }
        };

        video.preload = 'metadata';
        video.src = url;
        video.load();
      });
    } catch {
      duration = 0;
    }
  }

  // Optimization: Fast synchronous/header inspection for WAV files (< 1ms)
  if (!isVideo && (!duration || duration === 0)) {
    try {
      const isWavName = 'name' in file && typeof (file as File).name === 'string' && (file as File).name.endsWith('.wav');
      if (file.type === 'audio/wav' || isWavName || file.size > 44) {
        const headerBuffer = await file.slice(0, 100).arrayBuffer();
        const headerBytes = new Uint8Array(headerBuffer);
        const isRiff = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]) === 'RIFF';
        const isWave = String.fromCharCode(headerBytes[8], headerBytes[9], headerBytes[10], headerBytes[11]) === 'WAVE';

        if (isRiff && isWave) {
          const view = new DataView(headerBuffer);
          const wavChannels = view.getUint16(22, true);
          const wavSampleRate = view.getUint32(24, true);
          const wavByteRate = view.getUint32(28, true);

          if (wavByteRate > 0 && file.size > 44) {
            const dataBytes = file.size - 44;
            const calculatedDuration = dataBytes / wavByteRate;
            if (calculatedDuration > 0 && isFinite(calculatedDuration)) {
              duration = calculatedDuration;
              sampleRate = wavSampleRate || 44100;
              channels = wavChannels || 1;
            }
          }
        }
      }
    } catch (headerErr) {
      console.warn('WAV header parse notice:', headerErr);
    }
  }

  // Method 1: HTMLAudioElement with strict timeout and load() call
  if (!duration || duration === 0) {
    try {
      duration = await new Promise<number>((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        let resolved = false;

        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanUp();
            resolve(0);
          }
        }, 500);

        const cleanUp = () => {
          clearTimeout(timer);
          audio.onloadedmetadata = null;
          audio.onerror = null;
          audio.ondurationchange = null;
          audio.oncanplay = null;
          URL.revokeObjectURL(url);
        };

        const handleSuccess = () => {
          if (!resolved && isFinite(audio.duration) && audio.duration > 0) {
            resolved = true;
            const dur = audio.duration;
            cleanUp();
            resolve(dur);
          }
        };

        audio.onloadedmetadata = handleSuccess;
        audio.ondurationchange = handleSuccess;
        audio.oncanplay = handleSuccess;
        audio.onerror = () => {
          if (!resolved) {
            resolved = true;
            cleanUp();
            resolve(0);
          }
        };

        audio.preload = 'metadata';
        audio.src = url;
        audio.load();
      });
    } catch {
      duration = 0;
    }
  }

  // Fallback / verification via AudioContext if HTMLAudioElement fails
  if (!duration || duration === 0 || !isFinite(duration)) {
    try {
      const arrayBuffer = await file.slice(0, 1024 * 1024 * 30).arrayBuffer(); // first 30MB
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const decoded = await Promise.race([
          audioCtx.decodeAudioData(arrayBuffer),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('AudioContext decode timeout')), 600))
        ]);
        if (decoded) {
          duration = decoded.duration;
          sampleRate = decoded.sampleRate;
          channels = decoded.numberOfChannels;
        }
        await audioCtx.close().catch(() => {});
      }
    } catch {
      // Keep default
    }
  }

  // Final fallback estimation if format has approximate bitrate
  if (!duration || duration <= 0) {
    // Default fallback duration estimation (approx 128kbps for audio, 1Mbps for video)
    duration = isVideo ? Math.max(1, file.size / (128 * 1024)) : Math.max(1, file.size / (16 * 1024));
  }

  // Calculate chunk duration based on user custom setting (minimum 30 seconds, default 180s/3min)
  const safeMinutes = Math.max(0.5, Math.min(15, chunkDurationMinutes || 3));
  const CHUNK_DURATION = Math.round(safeMinutes * 60);

  // Audio/video longer than the chunk threshold or file size > 8MB triggers smart chunking
  const isOver30Minutes = duration > CHUNK_DURATION || file.size > 8 * 1024 * 1024;
  const suggestedChunkCount = isOver30Minutes ? Math.max(1, Math.ceil(duration / CHUNK_DURATION)) : 1;

  return {
    duration,
    durationFormatted: formatAudioTime(duration),
    isOver30Minutes,
    suggestedChunkCount,
    chunkDurationMinutes: safeMinutes,
    chunkDurationSec: CHUNK_DURATION,
    sampleRate,
    channels,
    fileSize: file.size,
  };
}

/**
 * Encodes a single-channel (mono) Float32Array AudioBuffer to 16-bit PCM WAV format Blob
 */
function encodeMonoAudioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const channelData = audioBuffer.getChannelData(0);

  const buffer = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // Mono (1 channel)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate (sampleRate * 1 * 2)
  view.setUint16(32, 2, true); // BlockAlign (1 * 2)
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, frameCount * 2, true);

  // Write 16-bit PCM mono samples
  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Resamples an AudioBuffer slice to 16kHz Mono 16-bit PCM WAV Blob.
 * 16kHz Mono uses only 32KB/sec (1.92 MB / min), ensuring zero 413 payload errors.
 */
export async function audioBufferTo16kMonoWavBlob(
  sourceBuffer: AudioBuffer,
  startSec = 0,
  endSec = sourceBuffer.duration,
  targetSampleRate = 16000
): Promise<Blob> {
  const duration = Math.max(0.1, endSec - startSec);
  const targetLength = Math.ceil(duration * targetSampleRate);

  const OfflineCtxClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  if (OfflineCtxClass) {
    try {
      const offlineCtx = new OfflineCtxClass(1, targetLength, targetSampleRate);
      const bufferSource = offlineCtx.createBufferSource();
      bufferSource.buffer = sourceBuffer;

      // Downmix to mono and route
      bufferSource.connect(offlineCtx.destination);
      bufferSource.start(0, startSec, duration);

      const renderedBuffer = await offlineCtx.startRendering();
      return encodeMonoAudioBufferToWav(renderedBuffer);
    } catch (e) {
      console.warn('OfflineAudioContext render fallback:', e);
    }
  }

  // Fallback linear resample
  const srcSampleRate = sourceBuffer.sampleRate;
  const numChannels = sourceBuffer.numberOfChannels;
  const startSample = Math.floor(startSec * srcSampleRate);
  const endSample = Math.min(Math.floor(endSec * srcSampleRate), sourceBuffer.length);
  const srcFrameCount = endSample - startSample;
  const resampledLength = Math.ceil((srcFrameCount / srcSampleRate) * targetSampleRate);

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass();
  const resampledBuffer = ctx.createBuffer(1, resampledLength, targetSampleRate);
  const channelData = resampledBuffer.getChannelData(0);

  const ratio = srcSampleRate / targetSampleRate;
  for (let i = 0; i < resampledLength; i++) {
    const srcIndex = Math.floor(startSample + i * ratio);
    if (srcIndex < sourceBuffer.length) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += sourceBuffer.getChannelData(ch)[srcIndex] || 0;
      }
      channelData[i] = sum / numChannels;
    }
  }
  ctx.close().catch(() => {});

  return encodeMonoAudioBufferToWav(resampledBuffer);
}

/**
 * Extracts pure audio track from an MP4, MOV or WebM video file using Web Audio API.
 * Discards video frames completely, reducing file size by 90%+ and returning a clean 16kHz mono WAV Blob.
 */
export async function extractAudioFromVideo(
  videoFile: File | Blob,
  onProgress?: (percent: number, stepText: string) => void
): Promise<{ audioBlob: Blob; duration: number; sampleRate: number; channels: number }> {
  if (onProgress) onProgress(15, '正在讀取視訊檔案結構...');
  const arrayBuffer = await videoFile.arrayBuffer();

  if (onProgress) onProgress(40, 'Web Audio 正在解碼並分離視訊與純音訊軌道...');
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = decoded.duration;
    const sampleRate = decoded.sampleRate;
    const channels = decoded.numberOfChannels;

    if (onProgress) onProgress(75, '正在將純音軌封裝為 16kHz 高保真單聲道 WAV...');
    const audioBlob = await audioBufferTo16kMonoWavBlob(decoded, 0, duration, 16000);
    await audioCtx.close().catch(() => {});

    if (onProgress) onProgress(100, `成功剝離音訊！時長: ${formatAudioTime(duration)} (已排除視訊畫面)`);
    return { audioBlob, duration, sampleRate, channels };
  } catch (err: any) {
    await audioCtx.close().catch(() => {});
    throw new Error(`無法從視訊檔案中解析出音訊軌: ${err?.message || '音訊編碼不支援或檔案損毀'}`);
  }
}

/**
 * Optimizes an uploaded audio or video file by downsampling to 16kHz mono WAV if it is large,
 * preventing 413 Entity Too Large errors.
 */
export async function optimizeAudioFile(
  file: File | Blob
): Promise<{ blob: Blob; base64: string; mimeType: string; duration?: number }> {
  const isVideo = isVideoFile(file);

  // If smaller than 5MB and already a standard compressed audio format (not video, not uncompressed wav)
  if (!isVideo && file.size <= 5 * 1024 * 1024 && file.type && file.type !== 'audio/wav') {
    const base64 = await fileToBase64(file);
    return { blob: file, base64, mimeType: file.type || 'audio/mp3' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = decoded.duration;
    const optimizedBlob = await audioBufferTo16kMonoWavBlob(decoded, 0, duration, 16000);
    const base64 = await fileToBase64(optimizedBlob);
    await audioCtx.close().catch(() => {});
    return { blob: optimizedBlob, base64, mimeType: 'audio/wav', duration };
  } catch (err) {
    console.warn('Direct audio/video decode fallback:', err);
    const base64 = await fileToBase64(file);
    return { blob: file, base64, mimeType: isVideo ? 'audio/mp4' : (file.type || 'audio/mp3') };
  }
}

/**
 * Legacy alias
 */
export function audioBufferToWavBlob(
  audioBuffer: AudioBuffer,
  startSec: number,
  endSec: number
): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.min(Math.floor(endSec * sampleRate), audioBuffer.length);
  const frameCount = endSample - startSample;

  const buffer = new ArrayBuffer(44 + frameCount * numChannels * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * numChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, frameCount * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      const sample = Math.max(-1, Math.min(1, channelData[startSample + i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

export interface AudioChunkSlice {
  index: number;
  startSec: number;
  endSec: number;
  duration: number;
  blob: Blob;
  base64: string;
}

/**
 * Split a long audio file into high-quality 16kHz mono chunks (e.g. 3 minutes each)
 */
export async function sliceAudioFile(
  file: File | Blob,
  chunkDurationSec = 180, // 3 mins per chunk (16kHz mono = ~5.7MB WAV, perfectly under 20MB limit)
  onProgress?: (percent: number, currentChunk: number, totalChunks: number) => void
): Promise<AudioChunkSlice[]> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  const totalDuration = decoded.duration;
  const totalChunks = Math.max(1, Math.ceil(totalDuration / chunkDurationSec));

  const slices: AudioChunkSlice[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const startSec = i * chunkDurationSec;
    const endSec = Math.min((i + 1) * chunkDurationSec, totalDuration);
    const chunkWavBlob = await audioBufferTo16kMonoWavBlob(decoded, startSec, endSec, 16000);
    const base64 = await fileToBase64(chunkWavBlob);

    slices.push({
      index: i,
      startSec,
      endSec,
      duration: endSec - startSec,
      blob: chunkWavBlob,
      base64,
    });

    if (onProgress) {
      const pct = Math.round(((i + 1) / totalChunks) * 100);
      onProgress(pct, i + 1, totalChunks);
    }
  }

  await audioCtx.close().catch(() => {});
  return slices;
}
