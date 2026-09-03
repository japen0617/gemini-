import React from 'react';
import { Sparkles, Loader2, CheckCircle, Scissors, Key, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export interface ProcessingStep {
  id: string;
  label: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'error';
  detail?: string;
}

interface ProcessingViewProps {
  fileName: string;
  isChunked: boolean;
  chunkProgress?: {
    current: number;
    total: number;
  };
  steps: ProcessingStep[];
  currentStepIndex: number;
  error?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
  onOpenApiSettings?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({
  fileName,
  isChunked,
  chunkProgress,
  steps,
  currentStepIndex,
  error,
  onRetry,
  onCancel,
  onOpenApiSettings,
}) => {
  const percent = Math.min(
    100,
    Math.round(((currentStepIndex + 0.5) / (steps.length || 1)) * 100)
  );

  const isAuthOrBlockedError =
    error &&
    (error.includes('API_KEY_SERVICE_BLOCKED') ||
      error.includes('PERMISSION_DENIED') ||
      error.includes('API_KEY_INVALID') ||
      error.includes('GenerativeService.GenerateContent are blocked') ||
      error.includes('API Key') ||
      error.includes('權限'));

  return (
    <div className="max-w-2xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="text-center space-y-2 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white animate-pulse">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          AI 語音轉錄與多功能字幕生成中
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto truncate">
          處理檔案：<span className="text-slate-200 font-mono">{fileName}</span>
        </p>

        {isChunked && chunkProgress && (
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mt-2">
            <Scissors className="w-3.5 h-3.5" />
            <span>
              長音檔自動分段處理：正在處理第 {chunkProgress.current} / {chunkProgress.total} 個片段
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-8 space-y-1.5">
        <div className="flex justify-between text-xs text-slate-400">
          <span>處理進度</span>
          <span className="font-mono text-indigo-400 font-semibold">{percent}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          ></div>
        </div>
      </div>

      {/* Step Checklist */}
      <div className="space-y-3 mb-8">
        {steps.map((step, idx) => {
          const isDone = step.status === 'completed';
          const isCurrent = step.status === 'in_progress';
          const isErr = step.status === 'error';

          return (
            <div
              key={step.id}
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                isCurrent
                  ? 'bg-indigo-950/40 border-indigo-500/40 text-white shadow-sm'
                  : isDone
                  ? 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  : 'bg-slate-950/20 border-slate-900 text-slate-600'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {isDone ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  ) : isErr ? (
                    <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">
                      !
                    </span>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 font-mono">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-sm font-medium ${isCurrent ? 'text-indigo-200' : ''}`}>
                    {step.label}
                  </p>
                  {step.detail && (
                    <p className="text-xs text-slate-400 mt-0.5">{step.detail}</p>
                  )}
                </div>
              </div>

              <div>
                {isCurrent && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                    處理中...
                  </span>
                )}
                {isDone && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                    完成
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-sm space-y-4 mb-6 shadow-xl">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <h4 className="font-bold text-white text-base">
                {isAuthOrBlockedError ? 'API Key 權限受阻或需設定自訂金鑰' : '處理過程中發生錯誤'}
              </h4>
              <p className="text-xs text-rose-200/90 leading-relaxed font-sans">
                {error}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-rose-900/40">
            {onOpenApiSettings && (
              <button
                type="button"
                id="error-open-api-settings-btn"
                onClick={onOpenApiSettings}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all"
              >
                <Key className="w-4 h-4" />
                <span>設定 / 更換 API Key</span>
              </button>
            )}

            {onRetry && (
              <button
                type="button"
                id="error-retry-btn"
                onClick={onRetry}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重試處理</span>
              </button>
            )}

            {onCancel && (
              <button
                type="button"
                id="error-cancel-btn"
                onClick={onCancel}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors border border-slate-700/60"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回上傳</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
