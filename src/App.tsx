import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { AudioUploader } from './components/AudioUploader';
import { ProcessingView, ProcessingStep } from './components/ProcessingView';
import { TranscriptDetailView } from './components/TranscriptDetailView';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { PlatformStatusBar } from './components/PlatformStatusBar';
import {
  TranscriptionProject,
  AudioChunkMeta,
  SUPPORTED_LANGUAGES,
  ApiConfig,
} from './types';
import {
  getAllProjects,
  saveProjectToDB,
  deleteProjectFromDB,
  saveAudioBlob,
  getAudioBlob,
} from './utils/db';
import {
  fileToBase64,
  sliceAudioFile,
  optimizeAudioFile,
  extractAudioFromVideo,
  isVideoFile,
} from './utils/audioUtils';

const API_CONFIG_STORAGE_KEY = 'audioscribe_custom_api_config';

export default function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'uploader' | 'detail'>('dashboard');
  const [projects, setProjects] = useState<TranscriptionProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<TranscriptionProject | null>(null);
  const [activeAudioBlob, setActiveAudioBlob] = useState<Blob | null>(null);

  // Custom API Key & Model Type State
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    apiKey: '',
    keyType: 'auto',
  });
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState<boolean>(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingFileName, setProcessingFileName] = useState<string>('');
  const [isChunkedProcessing, setIsChunkedProcessing] = useState<boolean>(false);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | undefined>(undefined);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Load projects & saved API config from storage on startup
  useEffect(() => {
    loadProjects();
    try {
      const savedConfig = localStorage.getItem(API_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        setApiConfig(JSON.parse(savedConfig));
      }
    } catch (e) {
      console.warn('Failed to load saved API config from localStorage:', e);
    }
  }, []);

  const handleSaveApiConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
    try {
      localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.warn('Failed to save API config to localStorage:', e);
    }
  };

  const handleClearApiConfig = () => {
    const emptyConfig: ApiConfig = { apiKey: '', keyType: 'auto' };
    setApiConfig(emptyConfig);
    try {
      localStorage.removeItem(API_CONFIG_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear API config from localStorage:', e);
    }
  };

  // Helper to build headers with custom API key & platform routing if present
  const getRequestHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiConfig.apiKey && apiConfig.apiKey.trim()) {
      headers['x-gemini-api-key'] = apiConfig.apiKey.trim();
    }
    if (apiConfig.platform) {
      headers['x-platform-type'] = apiConfig.platform;
    } else if (apiConfig.keyType) {
      headers['x-platform-type'] = apiConfig.keyType;
    }
    if (apiConfig.gcpProjectId) {
      headers['x-gcp-project-id'] = apiConfig.gcpProjectId;
    }
    if (apiConfig.gcpLocation) {
      headers['x-gcp-location'] = apiConfig.gcpLocation;
    }
    if (apiConfig.customEndpoint) {
      headers['x-custom-endpoint'] = apiConfig.customEndpoint;
    }
    return headers;
  };

  // Helper to safely execute and parse API calls without throwing on HTML/text errors
  const safeApiPost = async (
    endpoint: string,
    body: any
  ): Promise<{ ok: boolean; data?: any; error?: string; isAuthError?: boolean }> => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        // Not valid JSON
      }

      if (res.ok && parsedJson) {
        return { ok: true, data: parsedJson };
      }

      const statusText = res.statusText ? ` ${res.statusText}` : '';
      const fallbackStatusMsg = `伺服器回應錯誤 (${res.status}${statusText})`;
      const rawError = parsedJson?.error || parsedJson?.message;
      const errorMessage =
        rawError ||
        (text && !text.startsWith('<') ? text : fallbackStatusMsg) ||
        '請求失敗';

      const isAuthError =
        parsedJson?.isAuthError ||
        res.status === 403 ||
        res.status === 401 ||
        errorMessage.includes('API_KEY_SERVICE_BLOCKED') ||
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('API key') ||
        errorMessage.includes('金鑰');

      return {
        ok: false,
        error: errorMessage,
        isAuthError,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || '無法連線至後端伺服器，請稍後再試。',
        isAuthError: false,
      };
    }
  };

  const loadProjects = async () => {
    try {
      const list = await getAllProjects();
      setProjects(list);
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  // Open a project in Studio Detail View
  const handleOpenProject = async (project: TranscriptionProject) => {
    setSelectedProject(project);
    try {
      const blob = await getAudioBlob(project.id);
      setActiveAudioBlob(blob);
    } catch {
      setActiveAudioBlob(null);
    }
    setCurrentView('detail');
  };

  // Delete project
  const handleDeleteProject = async (id: string) => {
    await deleteProjectFromDB(id);
    await loadProjects();
    if (selectedProject?.id === id) {
      setSelectedProject(null);
      setCurrentView('dashboard');
    }
  };

  // Update existing project
  const handleUpdateProject = async (updated: TranscriptionProject) => {
    setSelectedProject(updated);
    await saveProjectToDB(updated);
    await loadProjects();
  };

  // ---------------- TRANSCRIPTION PIPELINE ----------------

  const handleStartProcessing = async (config: {
    audioFile: File | Blob;
    fileName: string;
    mimeType: string;
    duration: number;
    isOver30Minutes: boolean;
    languageHint: string;
    targetTranslationLang?: string;
    generateSummary: boolean;
  }) => {
    const {
      audioFile,
      fileName,
      mimeType,
      duration,
      isOver30Minutes,
      languageHint,
      targetTranslationLang,
      generateSummary,
    } = config;

    setIsProcessing(true);
    setProcessingFileName(fileName);
    setIsChunkedProcessing(isOver30Minutes);
    setProcessingError(null);
    setCurrentStepIndex(0);

    const isVideo = isVideoFile(audioFile) || isVideoFile(fileName);

    // Build initial steps
    const initialSteps: ProcessingStep[] = [
      {
        id: 'inspect',
        label: '檔案長度偵測與格式分析',
        status: 'in_progress',
        detail: `長度約 ${Math.round(duration)} 秒${isVideo ? ' (偵測到視訊檔案)' : ''}${isOver30Minutes ? ' (啟用智能分段)' : ''}`,
      },
      ...(isVideo
        ? [
            {
              id: 'extract_audio',
              label: 'MP4 視訊純音軌抽取 (排除畫面減少 90% 體積)',
              status: 'waiting' as const,
              detail: 'Web Audio 正在解碼並分離視訊與 16kHz 高保真純音訊',
            },
          ]
        : []),
      ...(isOver30Minutes
        ? [
            {
              id: 'slice',
              label: '音訊智能分段切割 (每 3 分鐘為一區段)',
              status: 'waiting' as const,
              detail: '無損切割並計算時間位移偏移植',
            },
          ]
        : []),
      {
        id: 'transcribe',
        label: 'Gemini 語音辨識轉錄',
        status: 'waiting',
        detail: '高精確度提取語音內容並生成時間軸 SRT 字幕',
      },
      {
        id: 'summary',
        label: 'AI 核心摘要、重點與主題章節萃取',
        status: 'waiting',
        detail: '提取執行摘要、條列式核心要點與待辦清單',
      },
      ...(targetTranslationLang
        ? [
            {
              id: 'translate',
              label: `多語言字幕翻譯 (${SUPPORTED_LANGUAGES.find((l) => l.code === targetTranslationLang)?.name || targetTranslationLang})`,
              status: 'waiting' as const,
              detail: '對齊時間戳生成雙語與翻譯字幕檔',
            },
          ]
        : []),
    ];

    setProcessingSteps(initialSteps);

    const updateStep = (
      stepId: string,
      status: 'waiting' | 'in_progress' | 'completed' | 'error',
      detail?: string
    ) => {
      setProcessingSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, status, detail: detail || s.detail } : s))
      );
    };

    try {
      // Step 1: Complete Inspect
      updateStep('inspect', 'completed');
      let stepIdx = 1;
      setCurrentStepIndex(stepIdx);

      let workingAudioFile: File | Blob = audioFile;
      let workingDuration = duration;

      // Video Extraction Step
      if (isVideo) {
        updateStep('extract_audio', 'in_progress', '正在從視訊檔案中分離純音軌並封裝為 16kHz WAV...');
        const extracted = await extractAudioFromVideo(audioFile, (pct, msg) => {
          updateStep('extract_audio', 'in_progress', msg);
        });
        workingAudioFile = extracted.audioBlob;
        workingDuration = extracted.duration;
        updateStep(
          'extract_audio',
          'completed',
          `成功抽取音訊！純音訊時長 ${Math.round(workingDuration)} 秒，已完全排除影像畫面`
        );
        stepIdx++;
        setCurrentStepIndex(stepIdx);
      }

      const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let allSegments: any[] = [];
      let combinedTranscript = '';
      let finalSummary: any = null;
      let chunksMeta: AudioChunkMeta[] = [];

      // If over chunking threshold or large audio, slice audio into safe 3-minute chunks (16kHz mono = ~5.7MB)
      if (isOver30Minutes) {
        updateStep('slice', 'in_progress', '正在利用 Web Audio 進行高保真 16kHz 降採樣與分段切割...');
        const CHUNK_LEN = 180; // 3 mins (180s) safe chunk size
        const slices = await sliceAudioFile(workingAudioFile, CHUNK_LEN, (pct, cur, total) => {
          setChunkProgress({ current: cur, total });
          updateStep('slice', 'in_progress', `正在切割片段 ${cur} / ${total} (${pct}%)`);
        });

        updateStep('slice', 'completed', `成功完成 ${slices.length} 個片段切割`);
        stepIdx++;
        setCurrentStepIndex(stepIdx);

        // Process each chunk with pacing and resilient retry
        updateStep('transcribe', 'in_progress', `正在轉錄片段 1 / ${slices.length}...`);
        
        let globalSegmentId = 1;
        for (let i = 0; i < slices.length; i++) {
          const slice = slices[i];
          setChunkProgress({ current: i + 1, total: slices.length });
          updateStep(
            'transcribe',
            'in_progress',
            `Gemini 正在轉錄片段 ${i + 1} / ${slices.length} (時間戳: ${Math.round(slice.startSec)}s ~ ${Math.round(slice.endSec)}s)...`
          );

          // Pacing delay between chunk API calls to prevent 429 quota bursts
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          }

          let apiResult: any = null;
          let chunkAttempt = 0;
          const maxChunkAttempts = 3;

          while (chunkAttempt < maxChunkAttempts) {
            chunkAttempt++;
            apiResult = await safeApiPost('/api/transcribe', {
              audioBase64: slice.base64,
              mimeType: 'audio/wav',
              languageHint,
              offsetSeconds: slice.startSec,
              audioDuration: slice.duration,
              generateSummary: i === 0,
            });

            if (apiResult.ok) {
              break;
            }

            if (apiResult.isAuthError) {
              setIsApiSettingsOpen(true);
              throw new Error(`片段 ${i + 1} 授權失敗: ${apiResult.error}`);
            }

            if (chunkAttempt < maxChunkAttempts) {
              const waitTime = chunkAttempt * 2000;
              updateStep(
                'transcribe',
                'in_progress',
                `片段 ${i + 1} 遭遇速率限制，將於 ${waitTime / 1000} 秒後自動重試 (第 ${chunkAttempt}/${maxChunkAttempts} 次)...`
              );
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
          }

          if (!apiResult || !apiResult.ok) {
            throw new Error(`片段 ${i + 1} 轉錄失敗: ${apiResult?.error || '伺服器無回應'}`);
          }

          const data = apiResult.data;
          combinedTranscript += (combinedTranscript ? '\n\n' : '') + (data.fullTranscript || '');

          const remappedSegments = (data.segments || []).map((seg: any) => ({
            ...seg,
            id: globalSegmentId++,
          }));

          allSegments.push(...remappedSegments);

          chunksMeta.push({
            chunkIndex: i,
            totalChunks: slices.length,
            startSeconds: slice.startSec,
            endSeconds: slice.endSec,
            durationSeconds: slice.duration,
            status: 'completed',
          });

          if (!finalSummary && data.summary) {
            finalSummary = data.summary;
          }
        }

        updateStep('transcribe', 'completed', `全體 ${slices.length} 個片段轉錄完成`);
      } else {
        // Single chunk process with audio optimization (downsamples to 16kHz mono WAV if uncompressed)
        updateStep('transcribe', 'in_progress', 'Gemini Transcribe 正在進行語音轉錄...');
        const optimized = await optimizeAudioFile(workingAudioFile);

        const apiResult = await safeApiPost('/api/transcribe', {
          audioBase64: optimized.base64,
          mimeType: optimized.mimeType,
          languageHint,
          offsetSeconds: 0,
          audioDuration: workingDuration,
          generateSummary: true,
          fileName,
        });

        if (!apiResult.ok) {
          if (apiResult.isAuthError) {
            setIsApiSettingsOpen(true);
          }
          throw new Error(apiResult.error || '語音轉錄失敗');
        }

        const data = apiResult.data;
        combinedTranscript = data.fullTranscript || '';
        allSegments = data.segments || [];
        finalSummary = data.summary;

        updateStep('transcribe', 'completed', `轉錄完成，產出 ${allSegments.length} 條 SRT 字幕句`);
      }

      // Step: Summary
      stepIdx++;
      setCurrentStepIndex(stepIdx);
      updateStep('summary', 'in_progress', 'AI 正在分析核心論點與章節標記...');

      // If needed, generate or refine summary for large files
      if (!finalSummary && combinedTranscript) {
        const sumResult = await safeApiPost('/api/summarize', {
          transcript: combinedTranscript,
          fileName,
        });
        if (sumResult.ok && sumResult.data?.summary) {
          finalSummary = sumResult.data.summary;
        }
      }
      updateStep('summary', 'completed', 'AI 內容摘要與時間軸章節生成完成');

      // Step: Translation if requested
      const translationsMap: Record<string, any> = {};
      if (targetTranslationLang) {
        stepIdx++;
        setCurrentStepIndex(stepIdx);
        const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetTranslationLang);
        updateStep('translate', 'in_progress', `正在翻譯為 ${langObj?.name || targetTranslationLang}...`);

        try {
          const transResult = await safeApiPost('/api/translate-subtitles', {
            segments: allSegments,
            targetLanguage: targetTranslationLang,
            targetLanguageName: langObj?.name || targetTranslationLang,
            fileName,
          });

          if (transResult.ok && transResult.data) {
            translationsMap[targetTranslationLang] = transResult.data;
            updateStep('translate', 'completed', `已產出 ${langObj?.name} 字幕翻譯`);
          }
        } catch (transErr) {
          console.warn('Initial translation warning:', transErr);
        }
      }

      // Save Project
      const newProject: TranscriptionProject = {
        id: projectId,
        title: fileName.replace(/\.[^/.]+$/, ''),
        fileName,
        fileSize: workingAudioFile.size,
        mimeType: workingAudioFile.type || mimeType || 'audio/wav',
        duration: workingDuration,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'completed',
        isChunked: isOver30Minutes,
        chunksMeta: isOver30Minutes ? chunksMeta : undefined,
        sourceLanguage: languageHint,
        fullTranscript: combinedTranscript,
        segments: allSegments,
        summary: finalSummary,
        translations: translationsMap,
      };

      // Save to IndexedDB
      await saveProjectToDB(newProject);
      await saveAudioBlob(projectId, workingAudioFile);
      await loadProjects();

      // Open detail view
      setSelectedProject(newProject);
      setActiveAudioBlob(workingAudioFile);
      setIsProcessing(false);
      setCurrentView('detail');
    } catch (error: any) {
      console.error('Processing pipeline error:', error);
      const errMsg = error.message || '轉錄流程失敗，請檢查音訊或稍後重試。';
      setProcessingError(errMsg);
      if (
        errMsg.includes('API_KEY_SERVICE_BLOCKED') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('API key') ||
        errMsg.includes('403') ||
        errMsg.includes('401')
      ) {
        setIsApiSettingsOpen(true);
      }
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation */}
      <Navbar
        currentTab={currentView}
        onNavigate={(tab) => setCurrentView(tab)}
        totalProjectsCount={projects.length}
        apiConfig={apiConfig}
        onOpenApiSettings={() => setIsApiSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Real-time Platform & Endpoint Health Status Bar */}
        {!isProcessing && (
          <PlatformStatusBar
            apiConfig={apiConfig}
            onOpenSettings={() => setIsApiSettingsOpen(true)}
            onUpdateConfig={handleSaveApiConfig}
          />
        )}

        {isProcessing ? (
          <ProcessingView
            fileName={processingFileName}
            isChunked={isChunkedProcessing}
            chunkProgress={chunkProgress}
            steps={processingSteps}
            currentStepIndex={currentStepIndex}
            error={processingError}
            onRetry={() => setIsProcessing(false)}
            onCancel={() => setIsProcessing(false)}
            onOpenApiSettings={() => setIsApiSettingsOpen(true)}
          />
        ) : currentView === 'dashboard' ? (
          <Dashboard
            projects={projects}
            onOpenProject={handleOpenProject}
            onDeleteProject={handleDeleteProject}
            onNewTranscription={() => setCurrentView('uploader')}
          />
        ) : currentView === 'uploader' ? (
          <AudioUploader
            onStartProcessing={handleStartProcessing}
            isProcessing={isProcessing}
            apiConfig={apiConfig}
            onOpenApiSettings={() => setIsApiSettingsOpen(true)}
          />
        ) : currentView === 'detail' && selectedProject ? (
          <TranscriptDetailView
            project={selectedProject}
            audioBlob={activeAudioBlob}
            apiConfig={apiConfig}
            onBack={() => setCurrentView('dashboard')}
            onUpdateProject={handleUpdateProject}
          />
        ) : (
          <Dashboard
            projects={projects}
            onOpenProject={handleOpenProject}
            onDeleteProject={handleDeleteProject}
            onNewTranscription={() => setCurrentView('uploader')}
          />
        )}
      </main>

      {/* API Key & Model Settings Modal */}
      <ApiSettingsModal
        isOpen={isApiSettingsOpen}
        onClose={() => setIsApiSettingsOpen(false)}
        apiConfig={apiConfig}
        onSaveConfig={handleSaveApiConfig}
        onClearConfig={handleClearApiConfig}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <p>
          AudioScribe & Subtitle Studio · Powered by Google Gemini 3.5 Transcribe · SRT / VTT / TXT / Markdown 匯出
        </p>
      </footer>
    </div>
  );
}
