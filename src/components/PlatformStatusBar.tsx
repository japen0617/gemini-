import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Sparkles,
  Zap,
  RefreshCw,
  Settings,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ApiConfig } from '../types';

interface PlatformStatusBarProps {
  apiConfig: ApiConfig;
  onOpenSettings: () => void;
  onUpdateConfig: (newConfig: ApiConfig) => void;
}

export const PlatformStatusBar: React.FC<PlatformStatusBarProps> = ({
  apiConfig,
  onOpenSettings,
  onUpdateConfig,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testNotice, setTestNotice] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const activePlatform = apiConfig.platform || 'gemini_api';
  const isVertex = activePlatform === 'agent_platform';
  const isAiStudio = activePlatform === 'gemini_api';

  const currentPlatformKey = isVertex
    ? (apiConfig.agentPlatformKey || apiConfig.apiKey || '')
    : (apiConfig.geminiApiKey || apiConfig.apiKey || '');

  const handleQuickPing = async () => {
    setIsTesting(true);
    setTestNotice(null);

    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: currentPlatformKey || undefined,
          geminiApiKey: apiConfig.geminiApiKey || undefined,
          agentPlatformKey: apiConfig.agentPlatformKey || undefined,
          platform: activePlatform,
          gcpProjectId: isVertex ? apiConfig.gcpProjectId || undefined : undefined,
          gcpLocation: isVertex ? apiConfig.gcpLocation || 'global' : undefined,
          customEndpoint: isVertex ? apiConfig.customEndpoint || undefined : undefined,
        }),
      });

      const data = await res.json();

      if (data.valid) {
        const updated: ApiConfig = {
          ...apiConfig,
          platform: activePlatform,
          detectedType: data.platform || (isVertex ? 'agent_platform' : 'gemini_api'),
          status: 'valid',
          latencyMs: data.latencyMs,
          message: data.message,
          testedAt: new Date().toISOString(),
        };
        onUpdateConfig(updated);
        setTestNotice({
          success: true,
          message: `連線健康！端點回應時間: ${data.latencyMs}ms (${data.label || '服務就緒'})`,
        });
      } else {
        setTestNotice({
          success: false,
          message: data.error || '端點連線異常，請點擊右側設定檢查。',
        });
      }
    } catch (err: any) {
      setTestNotice({
        success: false,
        message: `連線測試失敗：${err.message}`,
      });
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestNotice(null), 5000);
    }
  };

  return (
    <div className="mb-6 rounded-2xl bg-slate-900/90 border border-slate-800/80 p-3.5 sm:p-4 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Platform & Endpoint Info */}
        <div className="flex items-center space-x-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md ${
              isVertex
                ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 shadow-purple-500/20'
                : 'bg-gradient-to-tr from-indigo-600 to-cyan-500 shadow-indigo-500/20'
            }`}
          >
            {isVertex ? <Layers className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-xs font-semibold text-slate-400">目前執行平台：</span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  isVertex
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                }`}
              >
                {isVertex ? 'Agent Platform' : 'Google AI Studio'}
              </span>

              {/* Active Model Pill - strictly Gemini 3.5 Transcribe */}
              <span
                className={`inline-flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                  isVertex
                    ? 'bg-purple-900/40 border-purple-500/40 text-purple-200'
                    : 'bg-indigo-900/40 border-indigo-500/40 text-indigo-200'
                }`}
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>
                  {isVertex
                    ? 'Gemini 3.5 Transcribe Preview (15分音訊 / global)'
                    : 'Gemini 3.5 Transcribe (v1beta 端點)'}
                </span>
              </span>

              {/* Status pill */}
              <span className="inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>端點連線就緒</span>
              </span>

              {apiConfig.latencyMs && (
                <span className="inline-flex items-center space-x-0.5 text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>{apiConfig.latencyMs}ms</span>
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400 flex items-center space-x-1.5 flex-wrap">
              <span>金鑰憑證：</span>
              <span className="text-slate-300 font-mono">
                {currentPlatformKey
                  ? `自訂 (${currentPlatformKey.slice(0, 6)}••••${currentPlatformKey.slice(-4)})`
                  : '系統環境預設金鑰 (無需手動配置即可立即使用)'}
              </span>
              <span className="text-cyan-400 font-mono text-[10px]">
                {isAiStudio ? '· 端點: v1beta' : '· 端點: global'}
              </span>
              {apiConfig.gcpProjectId && isVertex && (
                <span className="text-purple-300">· 專案: {apiConfig.gcpProjectId}</span>
              )}
              {isVertex && (
                <span className="text-slate-400">· 區域: {apiConfig.gcpLocation || 'global'}</span>
              )}
            </p>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
          {/* Test Connection Button */}
          <button
            id="btn-quick-ping-status"
            type="button"
            onClick={handleQuickPing}
            disabled={isTesting}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 shadow-sm transition-all"
            title="隨時發送 Ping 探針測試當前 API 端點狀態與延遲"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
            <span>{isTesting ? '測試中...' : '⚡ 隨時測試端點狀態'}</span>
          </button>

          {/* Switch Platform Button */}
          <button
            id="btn-switch-platform"
            type="button"
            onClick={onOpenSettings}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/40 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>切換平台 / 設定</span>
          </button>
        </div>
      </div>

      {/* Test Notice Banner */}
      {testNotice && (
        <div
          className={`mt-3 p-2.5 rounded-xl text-xs flex items-center space-x-2 animate-fadeIn ${
            testNotice.success
              ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-200'
              : 'bg-rose-950/60 border border-rose-800/80 text-rose-200'
          }`}
        >
          {testNotice.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{testNotice.message}</span>
        </div>
      )}
    </div>
  );
};
