import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  FastForward,
  Gauge,
} from 'lucide-react';
import { formatAudioTime } from '../utils/audioUtils';

interface AudioPlayerProps {
  audioSrc?: string;
  audioBlob?: Blob | null;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
  playerRef?: React.RefObject<HTMLAudioElement | null>;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioSrc,
  audioBlob,
  currentTime,
  duration,
  onTimeUpdate,
  onSeek,
  playerRef: externalPlayerRef,
}) => {
  const localPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioEl = externalPlayerRef ? externalPlayerRef.current : localPlayerRef.current;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);

  // Handle source resolution from src string or blob
  useEffect(() => {
    if (audioSrc && audioSrc.trim() !== '') {
      setResolvedSrc(audioSrc);
    } else if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setResolvedSrc(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setResolvedSrc(undefined);
    }
  }, [audioSrc, audioBlob]);

  // Sync internal audio element
  const togglePlay = () => {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
    } else {
      audioEl.play().catch((err) => console.warn('Playback error:', err));
    }
  };

  const handleSkip = (seconds: number) => {
    if (!audioEl) return;
    const target = Math.max(0, Math.min(duration, audioEl.currentTime + seconds));
    audioEl.currentTime = target;
    onSeek(target);
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioEl) audioEl.playbackRate = rate;
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (audioEl) {
      audioEl.volume = newVol;
      audioEl.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const toggleMute = () => {
    if (!audioEl) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    audioEl.muted = nextMute;
  };

  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
      {/* Hidden audio element if no external ref */}
      <audio
        ref={externalPlayerRef || localPlayerRef}
        src={resolvedSrc || undefined}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      {/* Scrubber & Timestamps */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs font-mono text-slate-400 px-1">
          <span className="text-cyan-400 font-semibold">{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration || 0)}</span>
        </div>
        <div className="relative flex items-center group">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onSeek(val);
              if (audioEl) audioEl.currentTime = val;
            }}
            className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Playback Buttons */}
        <div className="flex items-center space-x-2">
          {/* Skip backward 5s */}
          <button
            type="button"
            onClick={() => handleSkip(-5)}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="倒退 5 秒"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Main Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-transform active:scale-95"
            title={isPlaying ? '暫停' : '播放'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          {/* Skip forward 5s */}
          <button
            type="button"
            onClick={() => handleSkip(5)}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="快進 5 秒"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center space-x-1.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 text-xs">
          <Gauge className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 mr-1 hidden sm:inline">語速:</span>
          {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => handleRateChange(rate)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                playbackRate === rate
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Volume Control */}
        <div className="flex items-center space-x-2 text-slate-400">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-16 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>
    </div>
  );
};
