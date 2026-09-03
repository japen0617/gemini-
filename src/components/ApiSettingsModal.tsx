import React, { useState } from 'react';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Cpu,
  Sparkles,
  RefreshCw,
  Trash2,
  X,
  Info,
  Layers,
  Globe,
  Server,
  Zap,
  Check,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { ApiConfig, PlatformType } from '../types';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiConfig: ApiConfig;
  onSaveConfig: (config: ApiConfig) => void;
  onClearConfig: () => void;
}

const GCP_REGIONS = [
  { id: 'global', name: 'global (全球統一路由 / Vertex Agent)' },
  { id: 'us-central1', name: 'us-central1 (愛荷華, 推薦)' },
  { id: 'asia-east1', name: 'asia-east1 (台灣彰化)' },
  { id: 'asia-northeast1', name: 'asia-northeast1 (日本東京)' },
  { id: 'asia-southeast1', name: 'asia-southeast1 (新加坡)' },
  { id: 'europe-west4', name: 'europe-west4 (荷蘭)' },
  { id: 'us-west1', name: 'us-west1 (美國奧勒岡)' },
  { id: 'us-east4', name: 'us-east4 (美國北維吉尼亞)' },
];

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  apiConfig,
  onSaveConfig,
  onClearConfig,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>(
    apiConfig.platform || apiConfig.keyType || 'auto'
  );
  const [keyInput, setKeyInput] = useState(apiConfig.apiKey || '');
  const [gcpProjectId, setGcpProjectId] = useState(apiConfig.gcpProjectId || '');
  const [gcpLocation, setGcpLocation] = useState(apiConfig.gcpLocation || 'us-central1');
  const [customEndpoint, setCustomEndpoint] = useState(apiConfig.customEndpoint || '');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(apiConfig.customEndpoint));

  const [isValidating, setIsValidating] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid?: boolean;
    platform?: 'gemini_api' | 'agent_platform';
    detectedType?: 'gemini_api' | 'agent_platform';
    label?: string;
    endpointUrl?: string;
    latencyMs?: number;
    message?: string;
    error?: string;
    isDefaultKey?: boolean;
  } | null>(null);

  if (!isOpen) return null;

  // Compute live preview URL based on selections
  const getPreviewEndpoint = () => {
    if (customEndpoint.trim()) {
      return customEndpoint.trim();
    }
    if (selectedPlatform === 'agent_platform') {
      const loc = gcpLocation || 'us-central1';
      const proj = gcpProjectId.trim() || '{PROJECT_ID}';
      const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
      return `https://${host}/v1/projects/${proj}/locations/${loc}/publishers/google/models/gemini-3.7-flash:generateContent`;
    }
    if (selectedPlatform === 'gemini_api') {
      return 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent';
    }
    return 'https://generativelanguage.googleapis.com 或 https://{region}-aiplatform.googleapis.com (依金鑰自動路由)';
  };

  // Perform probe testing on target platform and endpoint
  const runProbeValidation = async (saveAfterTest = false) => {
    setIsValidating(true);
    setValidationResult(null);
    setSavedSuccess(false);

    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: keyInput.trim() || undefined,
          platform: selectedPlatform,
          gcpProjectId: gcpProjectId.trim() || undefined,
          gcpLocation: gcpLocation || 'us-central1',
          customEndpoint: customEndpoint.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.valid) {
        setValidationResult(data);
        const newConfig: ApiConfig = {
          platform: selectedPlatform,
          apiKey: keyInput.trim(),
          keyType: selectedPlatform,
          detectedType: data.platform || data.detectedType || (selectedPlatform === 'agent_platform' ? 'agent_platform' : 'gemini_api'),
          gcpProjectId: gcpProjectId.trim() || undefined,
          gcpLocation: gcpLocation || 'us-central1',
          customEndpoint: customEndpoint.trim() || undefined,
          status: 'valid',
          message: data.message,
          latencyMs: data.latencyMs,
          testedAt: new Date().toISOString(),
        };

        if (saveAfterTest) {
          onSaveConfig(newConfig);
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 2500);
        }
        return newConfig;
      } else {
        setValidationResult({
          valid: false,
          error: data.error || '端點連線驗證未通過，請檢查金鑰與專案設定後重試。',
          latencyMs: data.latencyMs,
        });
        return null;
      }
    } catch (err: any) {
      setValidationResult({
        valid: false,
        error: `連線後端測試代理失敗：${err.message}`,
      });
      return null;
    } finally {
      setIsValidating(false);
    }
  };

  // Direct Apply & Save (even without running explicit probe)
  const handleDirectSave = () => {
    const newConfig: ApiConfig = {
      platform: selectedPlatform,
      apiKey: keyInput.trim(),
      keyType: selectedPlatform,
      detectedType: selectedPlatform === 'agent_platform' ? 'agent_platform' : 'gemini_api',
      gcpProjectId: gcpProjectId.trim() || undefined,
      gcpLocation: gcpLocation || 'us-central1',
      customEndpoint: customEndpoint.trim() || undefined,
      status: 'valid',
      testedAt: new Date().toISOString(),
    };
    onSaveConfig(newConfig);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleClear = () => {
    setKeyInput('');
    setGcpProjectId('');
    setCustomEndpoint('');
    setValidationResult(null);
    onClearConfig();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        id="api-settings-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md ${
              selectedPlatform === 'agent_platform'
                ? 'bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-purple-500/20'
                : selectedPlatform === 'gemini_api'
                ? 'bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-indigo-500/20'
                : 'bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-cyan-500/20'
            }`}>
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white">
                  AI 平台切換與 API 連線端點設定
                </h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  即時切換
                </span>
              </div>
              <p className="text-xs text-slate-400">
                切換 Google AI Studio 或 Vertex AI / Agent Platform 專屬端點，隨時測試連線健康狀態
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Platform Selector Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <span>目標服務平台切換</span>
              </label>
              <span className="text-xs text-indigo-300">
                點選平台卡片後可立即測試連線或套用切換
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Option 1: AI Studio */}
              <button
                type="button"
                id="platform-tab-gemini"
                onClick={() => {
                  setSelectedPlatform('gemini_api');
                  setValidationResult(null);
                }}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all relative ${
                  selectedPlatform === 'gemini_api'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <Cpu className={`w-4 h-4 ${selectedPlatform === 'gemini_api' ? 'text-indigo-400' : 'text-slate-400'}`} />
                  {selectedPlatform === 'gemini_api' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>
                <span className="text-xs font-bold">Google AI Studio</span>
                <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Gemini API 原生端點
                </span>
              </button>

              {/* Option 2: Vertex AI / Agent Platform */}
              <button
                type="button"
                id="platform-tab-agent"
                onClick={() => {
                  setSelectedPlatform('agent_platform');
                  setValidationResult(null);
                }}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all relative ${
                  selectedPlatform === 'agent_platform'
                    ? 'bg-purple-600/20 border-purple-500 text-white ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/10'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <Layers className={`w-4 h-4 ${selectedPlatform === 'agent_platform' ? 'text-purple-400' : 'text-slate-400'}`} />
                  {selectedPlatform === 'agent_platform' && (
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  )}
                </div>
                <span className="text-xs font-bold">Vertex / Agent Platform</span>
                <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Google Cloud 企業端點
                </span>
              </button>

              {/* Option 3: Auto Detect */}
              <button
                type="button"
                id="platform-tab-auto"
                onClick={() => {
                  setSelectedPlatform('auto');
                  setValidationResult(null);
                }}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all relative ${
                  selectedPlatform === 'auto'
                    ? 'bg-cyan-600/20 border-cyan-500 text-white ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/10'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <Sparkles className={`w-4 h-4 ${selectedPlatform === 'auto' ? 'text-cyan-400' : 'text-slate-400'}`} />
                  {selectedPlatform === 'auto' && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                </div>
                <span className="text-xs font-bold">智慧自動判斷</span>
                <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  連線探針自動識別
                </span>
              </button>
            </div>
          </div>

          {/* Platform Specific Settings */}
          <div className="space-y-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            {/* API Key Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {selectedPlatform === 'agent_platform'
                      ? 'Vertex AI API Key 或 GCP Bearer Token (選填)'
                      : '自訂 Gemini API Key (選填，若留空將使用系統預設金鑰)'}
                  </span>
                </label>
                {selectedPlatform !== 'agent_platform' ? (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <span>取得 Google AI Studio Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <a
                    href="https://console.cloud.google.com/vertex-ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1"
                  >
                    <span>GCP Vertex AI 控制台</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                id="custom-api-key-input"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={
                  selectedPlatform === 'agent_platform'
                    ? '留空將使用伺服器預設金鑰，或貼上專屬 Token (如 AQ... 或 ya29...)'
                    : '留空將使用伺服器預設金鑰，或貼上自訂 AI Studio 金鑰 (如 AIzaSy...)'
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            {/* GCP Project ID and Location (Shown when Agent Platform is chosen or in Auto) */}
            {(selectedPlatform === 'agent_platform' || selectedPlatform === 'auto') && (
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                      <span>GCP 專案 ID (Project ID)</span>
                      <span className="text-[10px] text-amber-400 font-normal">*Vertex AI 模型建議</span>
                    </label>
                    <input
                      type="text"
                      value={gcpProjectId}
                      onChange={(e) => setGcpProjectId(e.target.value)}
                      placeholder="例如: my-cloud-ai-project"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                      <Globe className="w-3.5 h-3.5 text-purple-400" />
                      <span>GCP 部署區域 (Location)</span>
                    </label>
                    <select
                      value={gcpLocation}
                      onChange={(e) => setGcpLocation(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                    >
                      {GCP_REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  💡 <strong className="text-slate-300">提示：</strong>Vertex AI 語音轉錄與生成模型支援 Google Cloud 區域端點（推薦 <span className="text-purple-300">us-central1</span> 或 <span className="text-purple-300">asia-east1</span>）。若使用的是 Google AI Studio 普及金鑰（以 <code className="text-indigo-300 font-mono">AIza...</code> 開頭），建議切換至 <strong className="text-indigo-300">「Google AI Studio」</strong> 享有最佳連線效率。
                </p>
              </div>
            )}

            {/* Advanced Custom Base URL Accordion */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1.5 py-1"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                <span>進階自訂端點 / API Proxy Gateway</span>
              </button>

              {showAdvanced && (
                <div className="mt-2 space-y-1.5 animate-fadeIn">
                  <input
                    type="text"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                    placeholder="例如: https://my-custom-proxy.internal.net"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-[11px] text-slate-500">
                    若您的組織使用專屬 API 反向代理或私有 VPC Gateway，可在此指定自訂 Host URL。
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Target Endpoint URL Preview with 1-Click Ping */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>即時連線端點 (Target Endpoint URL)</span>
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
                  {selectedPlatform === 'agent_platform' ? 'Vertex AI' : selectedPlatform === 'gemini_api' ? 'AI Studio' : 'Auto Routing'}
                </span>
                <button
                  type="button"
                  onClick={() => runProbeValidation(false)}
                  disabled={isValidating}
                  className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 flex items-center space-x-1 transition-all"
                  title="隨時測試此端點連線延遲與健康度"
                >
                  <RefreshCw className={`w-3 h-3 ${isValidating ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{isValidating ? '測試中...' : '⚡ 隨時測試端點'}</span>
                </button>
              </div>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800/80 font-mono text-[11px] text-cyan-300 break-all select-all">
              {getPreviewEndpoint()}
            </div>
          </div>

          {/* Validation Feedback with Ping Latency */}
          {validationResult && (
            <div
              className={`p-4 rounded-xl border text-sm transition-all animate-fadeIn ${
                validationResult.valid
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {validationResult.valid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center space-x-2">
                      <span>{validationResult.valid ? '端點連線正常' : '端點驗證失敗'}</span>
                      {validationResult.label && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-normal">
                          {validationResult.label}
                        </span>
                      )}
                    </span>
                    {typeof validationResult.latencyMs === 'number' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-900/60 text-emerald-300 font-mono flex items-center space-x-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>{validationResult.latencyMs}ms</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-90 leading-relaxed">
                    {validationResult.message || validationResult.error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Current Saved Config Status */}
          {apiConfig && (
            <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-slate-300 flex-wrap gap-y-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>目前啟用平台：</span>
                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  apiConfig.platform === 'agent_platform'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : apiConfig.platform === 'gemini_api'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}>
                  {apiConfig.platform === 'agent_platform' ? 'Vertex AI' : apiConfig.platform === 'gemini_api' ? 'Google AI Studio' : '智慧自動判斷'}
                </span>
                {apiConfig.apiKey ? (
                  <span className="font-mono text-cyan-300 text-[11px]">
                    (自訂金鑰: {apiConfig.apiKey.slice(0, 6)}••••)
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">(系統預設金鑰)</span>
                )}
                {apiConfig.latencyMs && (
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/40">
                    {apiConfig.latencyMs}ms
                  </span>
                )}
              </div>
              {apiConfig.apiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-rose-400 hover:text-rose-300 flex items-center space-x-1 shrink-0 ml-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清除自訂金鑰</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => runProbeValidation(false)}
              disabled={isValidating}
              className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center space-x-1.5 py-1 px-2.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>隨時檢測端點連線</span>
            </button>
          </div>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              關閉
            </button>
            <button
              type="button"
              onClick={handleDirectSave}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              直接儲存切換
            </button>
            <button
              id="save-api-key-button"
              type="button"
              onClick={() => runProbeValidation(true)}
              disabled={isValidating}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isValidating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>端點測試中...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>已成功切換平台！</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>測試連線並切換平台</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
