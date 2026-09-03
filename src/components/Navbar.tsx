import React from 'react';
import {
  Mic,
  History,
  PlusCircle,
  Key,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ApiConfig } from '../types';

interface NavbarProps {
  currentTab: 'dashboard' | 'uploader' | 'detail';
  onNavigate: (tab: 'dashboard' | 'uploader') => void;
  totalProjectsCount: number;
  apiConfig: ApiConfig;
  onOpenApiSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onNavigate,
  totalProjectsCount,
  apiConfig,
  onOpenApiSettings,
}) => {
  const activePlatform = apiConfig.platform || apiConfig.keyType || 'auto';
  const isVertex = activePlatform === 'agent_platform' || (activePlatform === 'auto' && apiConfig.detectedType === 'agent_platform');
  const isAiStudio = activePlatform === 'gemini_api' || (activePlatform === 'auto' && apiConfig.detectedType === 'gemini_api');

  const getPlatformBadge = () => {
    if (activePlatform === 'agent_platform') {
      return {
        label: 'Vertex AI',
        subText: 'Agent Platform',
        badgeBg: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
        dotColor: 'bg-purple-400',
        icon: <Layers className="w-3.5 h-3.5 text-purple-400" />,
      };
    }
    if (activePlatform === 'gemini_api') {
      return {
        label: 'AI Studio',
        subText: 'Gemini API',
        badgeBg: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
        dotColor: 'bg-indigo-400',
        icon: <Cpu className="w-3.5 h-3.5 text-indigo-400" />,
      };
    }
    return {
      label: '智慧自動',
      subText: 'Auto Routing',
      badgeBg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
      dotColor: 'bg-cyan-400',
      icon: <Sparkles className="w-3.5 h-3.5 text-cyan-400" />,
    };
  };

  const platformInfo = getPlatformBadge();

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Logo */}
        <div 
          onClick={() => onNavigate('dashboard')}
          className="flex items-center space-x-3 cursor-pointer group"
          id="nav-brand-logo"
        >
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${
            isVertex
              ? 'from-purple-600 via-indigo-600 to-cyan-400 shadow-purple-500/20'
              : 'from-indigo-600 via-blue-600 to-cyan-400 shadow-indigo-500/20'
          } flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-200`}>
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                AudioScribe
              </span>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border transition-all ${platformInfo.badgeBg}`}>
                {platformInfo.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              AI 語音轉錄 · 摘要 · SRT字幕與多語言翻譯
            </p>
          </div>
        </div>

        {/* Navigation Tabs & Settings */}
        <nav className="flex items-center space-x-2">
          {/* API Key & Platform Switcher Button */}
          <button
            id="nav-api-settings-btn"
            onClick={onOpenApiSettings}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all group ${
              isVertex
                ? 'bg-purple-950/50 border-purple-500/40 text-purple-200 hover:bg-purple-900/60 hover:border-purple-400'
                : isAiStudio
                ? 'bg-indigo-950/50 border-indigo-500/40 text-indigo-200 hover:bg-indigo-900/60 hover:border-indigo-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title={`目前平台: ${platformInfo.label} (${platformInfo.subText}) - 點擊切換平台或測試連線`}
          >
            <div className="flex items-center space-x-1.5">
              {platformInfo.icon}
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="flex items-center space-x-1">
              <span className="hidden sm:inline text-slate-400 text-[11px]">平台:</span>
              <span className="font-semibold text-white">{platformInfo.label}</span>
            </div>

            {apiConfig.latencyMs && (
              <span className="hidden md:inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[10px] bg-slate-900/80 text-emerald-300 border border-emerald-500/30 font-mono">
                <Zap className="w-2.5 h-2.5 text-emerald-400" />
                <span>{apiConfig.latencyMs}ms</span>
              </span>
            )}

            <span className="text-[10px] text-indigo-300/80 group-hover:text-indigo-200 border-l border-slate-700 pl-1.5 ml-1">
              設定/測試
            </span>
          </button>

          <button
            id="nav-tab-dashboard"
            onClick={() => onNavigate('dashboard')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              currentTab === 'dashboard'
                ? 'bg-slate-800 text-indigo-300 border border-slate-700 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">儀表板歷史紀錄</span>
            {totalProjectsCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300 font-mono">
                {totalProjectsCount}
              </span>
            )}
          </button>

          <button
            id="nav-tab-new"
            onClick={() => onNavigate('uploader')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
              currentTab === 'uploader'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-indigo-500/25 ring-2 ring-indigo-400/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>新增轉錄</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
