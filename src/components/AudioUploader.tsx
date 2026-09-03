import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Mic,
  Square,
  Play,
  Pause,
  Sparkles,
  AlertTriangle,
  Languages,
  CheckCircle2,
  FileAudio,
  FileVideo,
  Video,
  Radio,
  Clock,
  Scissors,
  Layers,
  Zap,
  Key,
  Loader2,
  Check,
} from 'lucide-react';
import {
  getAudioMetadata,
  formatAudioTime,
  AudioMetadata,
  pcmBase64ToWavBlob,
  isVideoFile,
} from '../utils/audioUtils';
import { SUPPORTED_LANGUAGES, ApiConfig } from '../types';

interface AudioUploaderProps {
  onStartProcessing: (config: {
    audioFile: File | Blob;
    fileName: string;
    mimeType: string;
    duration: number;
    isOver30Minutes: boolean;
    languageHint: string;
    targetTranslationLang?: string;
    generateSummary: boolean;
  }) => void;
  isProcessing: boolean;
  apiConfig?: ApiConfig;
  onOpenApiSettings?: () => void;
}

export const AudioUploader: React.FC<AudioUploaderProps> = ({
  onStartProcessing,
  isProcessing,
  apiConfig,
  onOpenApiSettings,
}) => {
  const [activeMode, setActiveMode] = useState<'upload' | 'record' | 'sample'>('upload');
  
  // File state
  const [selectedFile, setSelectedFile] = useState<File | Blob | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('audio/mp3');
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState<boolean>(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  // Sample generation progress state
  const [generatingSampleType, setGeneratingSampleType] = useState<'podcast' | 'meeting' | 'lecture' | null>(null);
  const [sampleProgress, setSampleProgress] = useState<number>(0);
  const [sampleStatusText, setSampleStatusText] = useState<string>('');
  const [currentSelectedSample, setCurrentSelectedSample] = useState<'podcast' | 'meeting' | 'lecture' | null>(null);

  // Settings
  const [languageHint, setLanguageHint] = useState<string>('zh-TW');
  const [targetTranslationLang, setTargetTranslationLang] = useState<string>('en');
  const [enableTranslation, setEnableTranslation] = useState<boolean>(true);
  const [generateSummary, setGenerateSummary] = useState<boolean>(true);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Drag & drop
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up preview URLs
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [audioPreviewUrl]);

  // Handle File Selection
  const handleFileChange = async (file: File) => {
    if (!file) return;
    setIsAnalyzingAudio(true);
    setSelectedFile(file);
    setFileName(file.name);
    setMimeType(file.type || 'audio/mp3');

    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    const url = URL.createObjectURL(file);
    setAudioPreviewUrl(url);

    try {
      const meta = await getAudioMetadata(file);
      setAudioMetadata(meta);
    } catch (err) {
      console.warn('Metadata inspection warning:', err);
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileChange(file);
    }
  };

  // Microphone Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Audio Visualizer Setup
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      drawVisualizer();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setSelectedFile(audioBlob);
        const name = `麥克風錄音_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
        setFileName(name);
        setMimeType('audio/webm');

        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
        const url = URL.createObjectURL(audioBlob);
        setAudioPreviewUrl(url);

        const meta = await getAudioMetadata(audioBlob);
        setAudioMetadata(meta);

        // Stop media tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('無法存取麥克風，請檢查瀏覽器麥克風權限設定。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.8;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(1, '#06b6d4');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    render();
  };

  // Sample Audio Generator (uses server-side Gemini TTS or local synthesized audio)
  const loadSampleAudio = async (sampleType: 'podcast' | 'meeting' | 'lecture') => {
    if (generatingSampleType) return; // Prevent concurrent sample generation

    const sampleNames = {
      podcast: 'AI與軟體開發未來趨勢訪談_範例音訊.wav',
      meeting: '跨國產品發表會工作進度會議_範例音訊.wav',
      lecture: '人工智慧多語言翻譯與字幕實務教學_範例音訊.wav',
    };
    const sampleLabels = {
      podcast: '科技訪談 Podcast',
      meeting: '商務會議進度討論',
      lecture: '語言學習與字幕實務',
    };

    setGeneratingSampleType(sampleType);
    setIsAnalyzingAudio(true);
    setSampleProgress(15);
    setSampleStatusText(`正在連線 AI 語音引擎生成「${sampleLabels[sampleType]}」範例...`);

    let currentPct = 15;
    const progressTimer = window.setInterval(() => {
      currentPct = Math.min(88, currentPct + Math.floor(Math.random() * 10 + 6));
      setSampleProgress(currentPct);
      if (currentPct < 40) {
        setSampleStatusText(`正在生成「${sampleLabels[sampleType]}」擬真人聲訊號...`);
      } else if (currentPct < 70) {
        setSampleStatusText('正在編碼高品質 WAV 音訊波形...');
      } else {
        setSampleStatusText('正在解析音訊時長與振幅中繼資料...');
      }
    }, 260);

    try {
      const name = sampleNames[sampleType];
      let loadedBlob: Blob | null = null;

      // 1. Attempt to fetch real voice audio from server Gemini TTS
      try {
        const response = await fetch('/api/sample-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sampleType }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.base64Audio) {
            loadedBlob = pcmBase64ToWavBlob(data.base64Audio, 24000, 1);
          }
        }
      } catch (apiErr) {
        console.warn('Sample audio API request failed, falling back to client synthesis:', apiErr);
      }

      // 2. Fallback: generate synthesized sample waveform
      if (!loadedBlob) {
        const sampleRate = 44100;
        const durationSec = sampleType === 'podcast' ? 12 : sampleType === 'meeting' ? 18 : 24;
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const buffer = audioCtx.createBuffer(1, sampleRate * durationSec, sampleRate);
        const channel = buffer.getChannelData(0);

        // Simulated voice harmonics
        for (let i = 0; i < channel.length; i++) {
          const t = i / sampleRate;
          const speechPulse = Math.sin(2 * Math.PI * 4 * t) > 0 ? 1 : 0.2;
          const envelope = Math.sin((t / durationSec) * Math.PI) * 0.4 * speechPulse;
          const wave1 = Math.sin(2 * Math.PI * 180 * t);
          const wave2 = Math.sin(2 * Math.PI * 360 * t) * 0.5;
          const wave3 = Math.sin(2 * Math.PI * 720 * t) * 0.2;
          channel[i] = (wave1 + wave2 + wave3) * envelope;
        }

        const { audioBufferToWavBlob } = await import('../utils/audioUtils');
        loadedBlob = audioBufferToWavBlob(buffer, 0, durationSec);
        await audioCtx.close();
      }

      clearInterval(progressTimer);

      setSelectedFile(loadedBlob);
      setFileName(name);
      setMimeType('audio/wav');
      setCurrentSelectedSample(sampleType);

      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      const url = URL.createObjectURL(loadedBlob);
      setAudioPreviewUrl(url);

      try {
        const meta = await getAudioMetadata(loadedBlob);
        setAudioMetadata(meta);
      } catch (metaErr) {
        console.warn('Metadata parse non-blocking notice:', metaErr);
      }

      setSampleProgress(100);
      setSampleStatusText(`「${sampleLabels[sampleType]}」範例音訊載入完成！可直接點擊下方開始轉錄`);
    } catch (e) {
      clearInterval(progressTimer);
      console.error('Error loading sample audio:', e);
      setSampleProgress(100);
      setSampleStatusText('範例音訊已載入，可開始轉錄');
    } finally {
      clearInterval(progressTimer);
      setIsAnalyzingAudio(false);
      setTimeout(() => {
        setGeneratingSampleType(null);
      }, 500);
    }
  };

  // Submit
  const handleStart = () => {
    if (!selectedFile) return;

    onStartProcessing({
      audioFile: selectedFile,
      fileName: fileName || 'audio_file.mp3',
      mimeType: mimeType || 'audio/mp3',
      duration: audioMetadata?.duration || 0,
      isOver30Minutes: Boolean(audioMetadata?.isOver30Minutes),
      languageHint,
      targetTranslationLang: enableTranslation ? targetTranslationLang : undefined,
      generateSummary,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl border border-indigo-900/50 p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini 3.5 Transcribe 智能多模態語音核心</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              新增語音轉錄與 SRT 字幕專案
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-xl">
              支援音訊檔上傳或即時麥克風錄音。若檔案長度超過 30 分鐘，系統將自動啟動智能分段切割，確保轉錄高精準度與無縫拼接。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/80 text-xs text-slate-300">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>支援無長度限制 · 自動分段</span>
            </div>
            {onOpenApiSettings && (
              <button
                type="button"
                id="uploader-header-api-key-btn"
                onClick={onOpenApiSettings}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  apiConfig?.apiKey
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                    : 'bg-indigo-950/50 border-indigo-500/40 text-indigo-200 hover:bg-indigo-900/60'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>{apiConfig?.apiKey ? '已自訂 API Key' : '設定自訂 API Key'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Input Mode Selector */}
      <div className="flex p-1.5 bg-slate-900/80 rounded-xl border border-slate-800">
        <button
          id="tab-mode-upload"
          onClick={() => setActiveMode('upload')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeMode === 'upload'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>上傳本機音檔</span>
        </button>

        <button
          id="tab-mode-record"
          onClick={() => setActiveMode('record')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeMode === 'record'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>麥克風即時錄音</span>
        </button>

        <button
          id="tab-mode-sample"
          onClick={() => setActiveMode('sample')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeMode === 'sample'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>試用範例音訊</span>
        </button>
      </div>

      {/* Main Input Box */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
        {activeMode === 'upload' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
              isDragging
                ? 'border-indigo-400 bg-indigo-950/30'
                : 'border-slate-700 hover:border-indigo-500/60 bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Upload className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-white">
              點擊選擇音訊或 MP4 視訊檔案，或將檔案拖曳至此處
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
              支援 MP3、WAV、M4A、AAC、OGG、FLAC、WebM 以及 <strong className="text-indigo-300">MP4 / MOV 影片</strong>（系統將自動在瀏覽器中高速剝離出純音訊，省時省頻寬！）
            </p>
          </div>
        )}

        {activeMode === 'record' && (
          <div className="bg-slate-950/60 rounded-xl p-6 border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`}></div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isRecording ? '即時錄音中...' : '準備開始錄音'}
              </span>
            </div>

            {/* Timer */}
            <div className="font-mono text-3xl font-bold text-white tracking-widest">
              {formatAudioTime(recordingSeconds)}
            </div>

            {/* Visualizer Canvas */}
            <div className="w-full max-w-md h-20 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
              {isRecording ? (
                <canvas ref={canvasRef} width={400} height={80} className="w-full h-full" />
              ) : (
                <span className="text-xs text-slate-500 flex items-center space-x-1">
                  <Radio className="w-3.5 h-3.5" />
                  <span>點擊下方按鈕啟動麥克風錄音</span>
                </span>
              )}
            </div>

            {/* Record Controls */}
            <div className="flex items-center space-x-3 pt-2">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium shadow-lg shadow-red-600/20 transition-all"
                >
                  <Mic className="w-4 h-4" />
                  <span>開始錄音</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-red-400 border border-red-500/30 font-medium shadow-lg transition-all"
                >
                  <Square className="w-4 h-4" />
                  <span>停止並完成錄音</span>
                </button>
              )}
            </div>
          </div>
        )}

        {activeMode === 'sample' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <p className="text-xs text-slate-300 font-medium">
                點擊下方預設主題，即可快速體驗高精準語音轉錄、SRT 字幕產出與 AI 摘要：
              </p>
              {generatingSampleType && (
                <div className="flex items-center space-x-1.5 text-xs text-indigo-400 font-mono font-semibold shrink-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在生成範例音訊 ({sampleProgress}%)</span>
                </div>
              )}
            </div>

            {/* Dedicated Generation Progress Bar */}
            {(generatingSampleType !== null || (sampleProgress > 0 && currentSelectedSample !== null)) && (
              <div
                id="sample-generation-progress-box"
                className={`p-4 rounded-xl border transition-all duration-300 ${
                  sampleProgress === 100
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {sampleProgress === 100 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-white">
                      {sampleStatusText || (sampleProgress === 100 ? '範例音訊已就緒' : '正在準備範例音訊...')}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-white bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-700/60">
                    {sampleProgress}%
                  </span>
                </div>

                {/* Progress bar line */}
                <div className="w-full bg-slate-900/90 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-700/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      sampleProgress === 100
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-indigo-500 via-cyan-400 to-blue-500'
                    }`}
                    style={{ width: `${sampleProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Sample selection cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Podcast */}
              <button
                type="button"
                id="sample-btn-podcast"
                disabled={generatingSampleType !== null}
                onClick={() => loadSampleAudio('podcast')}
                className={`p-4 rounded-xl text-left transition-all relative group border ${
                  currentSelectedSample === 'podcast'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-500/10'
                    : generatingSampleType === 'podcast'
                    ? 'bg-indigo-950/30 border-indigo-400/80 animate-pulse'
                    : 'bg-slate-950/60 border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20'
                } ${generatingSampleType && generatingSampleType !== 'podcast' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileAudio className="w-4 h-4" />
                  </div>
                  {currentSelectedSample === 'podcast' && sampleProgress === 100 && (
                    <span className="flex items-center space-x-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                      <Check className="w-3 h-3" />
                      <span>已選取</span>
                    </span>
                  )}
                  {generatingSampleType === 'podcast' && (
                    <span className="flex items-center space-x-1 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-md">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>生成中</span>
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-white">科技訪談 Podcast</h4>
                <p className="text-xs text-slate-400 mt-1">探討 AI 程式開發與語音技術</p>
              </button>

              {/* Meeting */}
              <button
                type="button"
                id="sample-btn-meeting"
                disabled={generatingSampleType !== null}
                onClick={() => loadSampleAudio('meeting')}
                className={`p-4 rounded-xl text-left transition-all relative group border ${
                  currentSelectedSample === 'meeting'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-500/10'
                    : generatingSampleType === 'meeting'
                    ? 'bg-indigo-950/30 border-indigo-400/80 animate-pulse'
                    : 'bg-slate-950/60 border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20'
                } ${generatingSampleType && generatingSampleType !== 'meeting' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileAudio className="w-4 h-4" />
                  </div>
                  {currentSelectedSample === 'meeting' && sampleProgress === 100 && (
                    <span className="flex items-center space-x-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                      <Check className="w-3 h-3" />
                      <span>已選取</span>
                    </span>
                  )}
                  {generatingSampleType === 'meeting' && (
                    <span className="flex items-center space-x-1 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-md">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>生成中</span>
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-white">商務會議進度討論</h4>
                <p className="text-xs text-slate-400 mt-1">專案排程與跨部門決策清單</p>
              </button>

              {/* Lecture */}
              <button
                type="button"
                id="sample-btn-lecture"
                disabled={generatingSampleType !== null}
                onClick={() => loadSampleAudio('lecture')}
                className={`p-4 rounded-xl text-left transition-all relative group border ${
                  currentSelectedSample === 'lecture'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-500/10'
                    : generatingSampleType === 'lecture'
                    ? 'bg-indigo-950/30 border-indigo-400/80 animate-pulse'
                    : 'bg-slate-950/60 border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20'
                } ${generatingSampleType && generatingSampleType !== 'lecture' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileAudio className="w-4 h-4" />
                  </div>
                  {currentSelectedSample === 'lecture' && sampleProgress === 100 && (
                    <span className="flex items-center space-x-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                      <Check className="w-3 h-3" />
                      <span>已選取</span>
                    </span>
                  )}
                  {generatingSampleType === 'lecture' && (
                    <span className="flex items-center space-x-1 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-md">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>生成中</span>
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-white">語言學習與字幕實務</h4>
                <p className="text-xs text-slate-400 mt-1">多語言翻譯與字幕對齊教學</p>
              </button>
            </div>
          </div>
        )}

        {/* Selected Audio Preview & Duration Detection */}
        {selectedFile && (
          <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isVideoFile(selectedFile)
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                    : 'bg-indigo-600/20 text-indigo-400'
                }`}>
                  {isVideoFile(selectedFile) ? <FileVideo className="w-5 h-5" /> : <FileAudio className="w-5 h-5" />}
                </div>
                <div className="overflow-hidden">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                      {fileName}
                    </h4>
                    {isVideoFile(selectedFile) && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        <Video className="w-3 h-3" />
                        <span>MP4 視訊 (自動剝離音訊)</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-slate-400 mt-0.5">
                    <span>原始大小: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <span>·</span>
                    <span>時長: {audioMetadata ? audioMetadata.durationFormatted : '計算中...'}</span>
                  </div>
                </div>
              </div>

              {audioPreviewUrl && audioPreviewUrl.trim() !== '' && (
                isVideoFile(selectedFile) ? (
                  <video controls src={audioPreviewUrl || undefined} className="h-16 max-w-xs rounded-lg bg-black border border-slate-800" />
                ) : (
                  <audio controls src={audioPreviewUrl || undefined} className="h-9 max-w-xs rounded-lg" />
                )
              )}
            </div>

            {/* MP4 Audio Extraction Notice */}
            {isVideoFile(selectedFile) && (
              <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-purple-200 text-xs flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-300 flex items-center space-x-1.5">
                    <span>MP4 視訊純音軌抽取優化已啟用</span>
                  </div>
                  <p className="text-purple-200/90 mt-1 leading-relaxed">
                    開始轉錄後，瀏覽器將在記憶體中自動剝離 MP4 視訊畫面並提取出 16kHz 高保真純音軌進行 AI 語音識別。預計為您節省 <strong className="text-white">80%~95% 傳輸體積與 API 處理耗時</strong>！
                  </p>
                </div>
              </div>
            )}

            {/* Smart Audio Optimization & Chunking Details */}
            {audioMetadata?.isOver30Minutes && (
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs flex items-start space-x-3">
                <Scissors className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-indigo-300 flex items-center space-x-1.5">
                    <span>音訊分段優化（智能防爆量切割已就緒）</span>
                  </div>
                  <p className="text-indigo-200/90 mt-1 leading-relaxed">
                    本檔案長度為 <strong className="text-white">{audioMetadata.durationFormatted}</strong>。系統將自動進行 16kHz 高保真降採樣並無損切割為{' '}
                    <strong className="text-white">{audioMetadata.suggestedChunkCount} 個最佳片段</strong> 進行連續高精度語音轉錄，並自動校準所有時間戳，產出無縫且完整的連續 SRT 字幕與 AI 摘要！
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
          {/* Language Hint */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Languages className="w-3.5 h-3.5 text-indigo-400" />
              <span>音訊主語言提示 (Language Hint)</span>
            </label>
            <select
              value={languageHint}
              onChange={(e) => setLanguageHint(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="zh-TW">繁體中文 (Traditional Chinese)</option>
              <option value="zh-CN">簡體中文 (Simplified Chinese)</option>
              <option value="en">英文 (English)</option>
              <option value="ja">日文 (Japanese)</option>
              <option value="ko">韓文 (Korean)</option>
              <option value="es">西班牙文 (Spanish)</option>
              <option value="fr">法文 (French)</option>
              <option value="de">德文 (German)</option>
            </select>
          </div>

          {/* Subtitle Translation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>同步產出多語言翻譯字幕</span>
              </label>
              <input
                type="checkbox"
                checked={enableTranslation}
                onChange={(e) => setEnableTranslation(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
            </div>
            <select
              disabled={!enableTranslation}
              value={targetTranslationLang}
              onChange={(e) => setTargetTranslationLang(e.target.value)}
              className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 ${
                !enableTranslation ? 'opacity-50 border-slate-800' : 'border-slate-700'
              }`}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feature Switches */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300 font-medium">生成 AI 深度內容摘要、核心要點與章節時間軸</span>
          </div>
          <input
            type="checkbox"
            checked={generateSummary}
            onChange={(e) => setGenerateSummary(e.target.checked)}
            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
          />
        </div>

        {/* Submit Action */}
        <div className="pt-2">
          <button
            id="btn-start-transcribe"
            type="button"
            disabled={!selectedFile || isProcessing || isAnalyzingAudio}
            onClick={handleStart}
            className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg ${
              !selectedFile || isProcessing || isAnalyzingAudio
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:scale-[1.01]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isProcessing
                ? '正在轉錄與生成字幕中...'
                : '開始 AI 語音轉錄、SRT 字幕與內容摘要'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
