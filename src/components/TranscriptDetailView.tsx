import React, { useState, useRef, useEffect } from 'react';
import * as OpenCC from 'opencc-js';
import {
  FileText,
  Languages,
  Sparkles,
  Download,
  Scissors,
  ArrowLeft,
  Copy,
  Check,
  Search,
  Edit3,
  Play,
  RotateCcw,
  Clock,
  Layers,
  Archive,
  FileCode,
  Share2,
  ListOrdered,
  CheckSquare,
  Bookmark,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  TranscriptionProject,
  SubtitleSegment,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  ApiConfig,
} from '../types';
import { AudioPlayer } from './AudioPlayer';
import { formatAudioTime } from '../utils/audioUtils';
import {
  generateSrtContent,
  generateVttContent,
  generateTxtTranscript,
  generateMarkdownReport,
  downloadFile,
  downloadAllInZip,
  secondsToDisplayTime,
} from '../utils/subtitleUtils';

interface TranscriptDetailViewProps {
  project: TranscriptionProject;
  audioBlob?: Blob | null;
  apiConfig?: ApiConfig;
  onBack: () => void;
  onUpdateProject: (updated: TranscriptionProject) => void;
}

export const TranscriptDetailView: React.FC<TranscriptDetailViewProps> = ({
  project,
  audioBlob,
  apiConfig,
  onBack,
  onUpdateProject,
}) => {
  const [activeTab, setActiveTab] = useState<'subtitles' | 'translation' | 'summary' | 'export' | 'chunks'>('subtitles');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Subtitle View Mode: cards vs continuous
  const [subtitleMode, setSubtitleMode] = useState<'cards' | 'continuous'>('cards');

  // Translation State
  const [selectedLangCode, setSelectedLangCode] = useState<string>('en');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationDisplayMode, setTranslationDisplayMode] = useState<'bilingual' | 'translatedOnly'>('bilingual');

  // Editing Segment
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [convertedFeedback, setConvertedFeedback] = useState<boolean>(false);

  // One-click convert all subtitles and summary to Traditional Chinese
  const handleConvertToTraditional = () => {
    try {
      const s2tw = OpenCC.Converter({ from: 'cn', to: 'tw' });
      const updatedSegments = project.segments.map((s) => ({
        ...s,
        text: s2tw(s.text),
        speaker: s.speaker ? s2tw(s.speaker) : s.speaker,
      }));
      const updatedFullTranscript = s2tw(project.fullTranscript || '');
      let updatedSummary = project.summary;
      if (project.summary) {
        updatedSummary = {
          ...project.summary,
          executiveSummary: project.summary.executiveSummary ? s2tw(project.summary.executiveSummary) : '',
          keyPoints: project.summary.keyPoints?.map((kp) => s2tw(kp)) || [],
          actionItems: project.summary.actionItems?.map((ai) => s2tw(ai)) || [],
          chapters:
            project.summary.chapters?.map((ch) => ({
              ...ch,
              title: s2tw(ch.title),
              description: s2tw(ch.description),
            })) || [],
          keywords: project.summary.keywords?.map((kw) => s2tw(kw)) || [],
          toneAndSentiment: project.summary.toneAndSentiment ? s2tw(project.summary.toneAndSentiment) : '',
          targetAudience: project.summary.targetAudience ? s2tw(project.summary.targetAudience) : '',
        };
      }

      onUpdateProject({
        ...project,
        fullTranscript: updatedFullTranscript,
        segments: updatedSegments,
        summary: updatedSummary,
      });

      setConvertedFeedback(true);
      setTimeout(() => setConvertedFeedback(false), 2500);
    } catch (err) {
      console.error('Failed to convert to Traditional Chinese:', err);
    }
  };
  const [editingSpeaker, setEditingSpeaker] = useState<string>('');

  const playerRef = useRef<HTMLAudioElement | null>(null);
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);

  // Active Subtitle Segment
  const activeSegmentIndex = project.segments.findIndex(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  // Auto scroll to active segment in card mode
  useEffect(() => {
    if (activeSegmentRef.current && subtitleMode === 'cards') {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeSegmentIndex, subtitleMode]);

  // Seek Audio
  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (playerRef.current) {
      playerRef.current.currentTime = time;
      playerRef.current.play().catch(() => {});
    }
  };

  // Copy with feedback
  const handleCopy = (text: string, typeKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(typeKey);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Trigger Translation
  const handleTranslate = async (langCode: string) => {
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    const langName = langObj ? langObj.name : langCode;

    setIsTranslating(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const activePlatform = apiConfig?.platform || 'gemini_api';
      const activeKey =
        activePlatform === 'agent_platform'
          ? (apiConfig?.agentPlatformKey || apiConfig?.apiKey || '')
          : (apiConfig?.geminiApiKey || apiConfig?.apiKey || '');

      if (activeKey.trim()) {
        headers['x-gemini-api-key'] = activeKey.trim();
      }
      if (apiConfig?.geminiApiKey?.trim()) {
        headers['x-ai-studio-key'] = apiConfig.geminiApiKey.trim();
      }
      if (apiConfig?.agentPlatformKey?.trim()) {
        headers['x-agent-platform-key'] = apiConfig.agentPlatformKey.trim();
      }
      headers['x-platform-type'] = activePlatform;

      if (activePlatform === 'agent_platform') {
        if (apiConfig?.gcpProjectId) {
          headers['x-gcp-project-id'] = apiConfig.gcpProjectId;
        }
        if (apiConfig?.gcpLocation) {
          headers['x-gcp-location'] = apiConfig.gcpLocation;
        }
        if (apiConfig?.customEndpoint) {
          headers['x-custom-endpoint'] = apiConfig.customEndpoint;
        }
      }

      const response = await fetch('/api/translate-subtitles', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          segments: project.segments,
          targetLanguage: langCode,
          targetLanguageName: langName,
          fileName: project.fileName,
        }),
      });

      const text = await response.text();
      let result: any = null;
      try {
        result = JSON.parse(text);
      } catch {
        // Not valid JSON
      }

      if (!response.ok || !result) {
        const errorMsg = result?.error || result?.message || (text.startsWith('<') ? `伺服器回應錯誤 (${response.status})` : text) || '字幕翻譯失敗';
        throw new Error(errorMsg);
      }

      const updatedTranslations = {
        ...(project.translations || {}),
        [langCode]: result,
      };

      const updatedProject: TranscriptionProject = {
        ...project,
        translations: updatedTranslations,
        updatedAt: new Date().toISOString(),
      };

      onUpdateProject(updatedProject);
    } catch (err: any) {
      console.error('Translation error:', err);
      alert(err.message || '字幕翻譯失敗，請確認 API 連線。');
    } finally {
      setIsTranslating(false);
    }
  };

  // Save edited segment
  const handleSaveSegment = (segId: number) => {
    const updatedSegments = project.segments.map((seg) => {
      if (seg.id === segId) {
        return {
          ...seg,
          text: editingText.trim(),
          speaker: editingSpeaker.trim(),
        };
      }
      return seg;
    });

    const updatedProject: TranscriptionProject = {
      ...project,
      segments: updatedSegments,
      fullTranscript: updatedSegments.map((s) => s.text).join('\n'),
      updatedAt: new Date().toISOString(),
    };

    onUpdateProject(updatedProject);
    setEditingSegmentId(null);
  };

  const currentTranslation = project.translations?.[selectedLangCode];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="返回儀表板"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight line-clamp-1">
                {project.title || project.fileName}
              </h1>
              {project.isChunked && (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>30分+ 分段轉錄</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
              <span>長度: {formatAudioTime(project.duration)}</span>
              <span>·</span>
              <span>{project.segments.length} 條 SRT 字幕句</span>
              <span>·</span>
              <span>建立時間: {new Date(project.createdAt).toLocaleString('zh-TW')}</span>
            </div>
          </div>
        </div>

        {/* Quick Export All */}
        <div className="flex items-center space-x-2 self-end md:self-auto">
          <button
            type="button"
            onClick={() => downloadAllInZip(project)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all"
          >
            <Archive className="w-4 h-4" />
            <span>一鍵打包下載全部 (.zip)</span>
          </button>
        </div>
      </div>

      {/* Sticky Audio Player Bar */}
      <div className="sticky top-20 z-30 shadow-2xl">
        <AudioPlayer
          audioBlob={audioBlob}
          audioSrc={project.audioBlobUrl}
          currentTime={currentTime}
          duration={project.duration}
          onTimeUpdate={(t) => setCurrentTime(t)}
          onSeek={handleSeek}
          playerRef={playerRef}
        />
      </div>

      {/* Studio Navigation Tabs */}
      <div className="flex p-1.5 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <button
          id="tab-subtitles"
          onClick={() => setActiveTab('subtitles')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'subtitles'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>逐字稿與 SRT 字幕</span>
        </button>

        <button
          id="tab-translation"
          onClick={() => setActiveTab('translation')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'translation'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Languages className="w-4 h-4" />
          <span>多語言翻譯字幕</span>
          {Object.keys(project.translations || {}).length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-indigo-200 text-[10px]">
              {Object.keys(project.translations).length}
            </span>
          )}
        </button>

        <button
          id="tab-summary"
          onClick={() => setActiveTab('summary')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'summary'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI 深度內容摘要</span>
        </button>

        <button
          id="tab-export"
          onClick={() => setActiveTab('export')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'export'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>多元匯出中心</span>
        </button>

        {project.isChunked && (
          <button
            id="tab-chunks"
            onClick={() => setActiveTab('chunks')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'chunks'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Scissors className="w-4 h-4 text-amber-400" />
            <span>分段切割紀錄</span>
          </button>
        )}
      </div>

      {/* ---------------- TAB 1: SUBTITLES & TRANSCRIPT ---------------- */}
      {activeTab === 'subtitles' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800">
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋逐字稿關鍵字..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Mode & Copy buttons */}
            <div className="flex items-center space-x-3 self-end sm:self-auto">
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setSubtitleMode('cards')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    subtitleMode === 'cards'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  字幕卡片模式
                </button>
                <button
                  type="button"
                  onClick={() => setSubtitleMode('continuous')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    subtitleMode === 'continuous'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  連續逐字稿模式
                </button>
              </div>

              <button
                type="button"
                onClick={handleConvertToTraditional}
                title="一鍵將所有簡體字幕及重點摘要轉換為標準正體繁體中文"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-300 text-xs transition-colors"
              >
                {convertedFeedback ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                )}
                <span>{convertedFeedback ? '已轉為正體！' : '一鍵轉正體繁體'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const srt = generateSrtContent(project.segments);
                  handleCopy(srt, 'srt');
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                {copiedType === 'srt' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>複製 SRT 內容</span>
              </button>
            </div>
          </div>

          {/* Cards Mode */}
          {subtitleMode === 'cards' ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {project.segments.map((seg, idx) => {
                const isActive = idx === activeSegmentIndex;
                const isEditing = editingSegmentId === seg.id;
                const matchesSearch =
                  !searchQuery || seg.text.toLowerCase().includes(searchQuery.toLowerCase());

                if (!matchesSearch) return null;

                return (
                  <div
                    key={seg.id}
                    ref={isActive ? activeSegmentRef : null}
                    onClick={() => handleSeek(seg.start)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative group ${
                      isActive
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-400/40'
                        : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[11px] text-slate-500 font-bold">
                          #{seg.id}
                        </span>
                        <span
                          className={`font-mono px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            isActive
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {seg.startTimeStr} → {seg.endTimeStr}
                        </span>
                        {seg.speaker && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px]">
                            {seg.speaker}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSegmentId(seg.id);
                            setEditingText(seg.text);
                            setEditingSpeaker(seg.speaker || '');
                          }}
                          className="p-1 hover:text-white text-slate-400"
                          title="編輯此句字幕"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeek(seg.start);
                          }}
                          className="p-1 hover:text-cyan-400 text-slate-400"
                          title="從此句開始播放"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    {isEditing ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="space-y-2 pt-1"
                      >
                        <textarea
                          rows={2}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full bg-slate-900 border border-indigo-500 rounded-lg p-2 text-sm text-white focus:outline-none"
                        />
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            placeholder="說話者標記 (例如: 主講人)"
                            value={editingSpeaker}
                            onChange={(e) => setEditingSpeaker(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 w-48"
                          />
                          <div className="flex space-x-2">
                            <button
                              type="button"
                              onClick={() => setEditingSegmentId(null)}
                              className="px-3 py-1 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveSegment(seg.id)}
                              className="px-3 py-1 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 font-semibold"
                            >
                              儲存
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p
                        className={`text-sm leading-relaxed ${
                          isActive ? 'text-white font-medium text-base' : 'text-slate-200'
                        }`}
                      >
                        {seg.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Continuous Text Mode */
            <div className="bg-slate-950/70 p-6 rounded-xl border border-slate-800 max-h-[600px] overflow-y-auto space-y-4">
              {project.segments.map((seg) => {
                const isActive = currentTime >= seg.start && currentTime <= seg.end;
                return (
                  <span
                    key={seg.id}
                    onClick={() => handleSeek(seg.start)}
                    className={`inline-block mr-2 cursor-pointer transition-all p-1 rounded ${
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-slate-500 mr-1 select-none">
                      [{secondsToDisplayTime(seg.start)}]
                    </span>
                    {seg.text}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 2: MULTI-LANGUAGE TRANSLATION ---------------- */}
      {activeTab === 'translation' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {/* Header & Language Select */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Languages className="w-5 h-5 text-indigo-400" />
                <span>AI 多語言字幕翻譯引擎</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                精確對齊 SRT 時間戳，並支援雙語字幕對照與獨立譯文字幕匯出。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedLangCode}
                onChange={(e) => setSelectedLangCode(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isTranslating}
                onClick={() => handleTranslate(selectedLangCode)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all ${
                  isTranslating
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {isTranslating
                    ? 'AI 翻譯處理中...'
                    : currentTranslation
                    ? '重新進行翻譯'
                    : '一鍵 AI 翻譯此語言'}
                </span>
              </button>
            </div>
          </div>

          {/* Translation View */}
          {currentTranslation ? (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex items-center justify-between text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">顯示模式:</span>
                  <button
                    type="button"
                    onClick={() => setTranslationDisplayMode('bilingual')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      translationDisplayMode === 'bilingual'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    雙語對照模式
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranslationDisplayMode('translatedOnly')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      translationDisplayMode === 'translatedOnly'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    純譯文字幕
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const transSegments = project.segments.map((seg) => {
                        const tSeg = currentTranslation.segments.find((s) => s.id === seg.id);
                        return { ...seg, translatedText: tSeg?.text || '' };
                      });
                      const transSrt = generateSrtContent(transSegments, { useTranslated: true });
                      downloadFile(
                        transSrt,
                        `${project.title || project.fileName}_${selectedLangCode}.srt`,
                        'text/plain'
                      );
                    }}
                    className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下載 {currentTranslation.languageName} SRT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const transSegments = project.segments.map((seg) => {
                        const tSeg = currentTranslation.segments.find((s) => s.id === seg.id);
                        return { ...seg, translatedText: tSeg?.text || '' };
                      });
                      const bilingualSrt = generateSrtContent(transSegments, { bilingual: true });
                      downloadFile(
                        bilingualSrt,
                        `${project.title || project.fileName}_bilingual_${selectedLangCode}.srt`,
                        'text/plain'
                      );
                    }}
                    className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下載雙語 SRT</span>
                  </button>
                </div>
              </div>

              {/* Translated Segments List */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {project.segments.map((seg) => {
                  const tSeg = currentTranslation.segments.find((s) => s.id === seg.id);
                  const translatedText = tSeg ? tSeg.text : '(翻譯處理中或未翻譯)';
                  const isActive = currentTime >= seg.start && currentTime <= seg.end;

                  return (
                    <div
                      key={seg.id}
                      onClick={() => handleSeek(seg.start)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-400/40'
                          : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span className="font-mono text-[11px] font-semibold text-cyan-400">
                          {seg.startTimeStr} → {seg.endTimeStr}
                        </span>
                        <span className="text-slate-500 font-mono text-[10px]">#{seg.id}</span>
                      </div>

                      {translationDisplayMode === 'bilingual' ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-400 leading-relaxed">
                            <strong className="text-slate-300 mr-1">原文:</strong>
                            {seg.text}
                          </p>
                          <p className="text-sm font-semibold text-indigo-200 leading-relaxed">
                            <strong className="text-indigo-400 mr-1 font-mono text-xs">譯文:</strong>
                            {translatedText}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-white leading-relaxed">
                          {translatedText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 rounded-xl p-10 border border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center">
                <Languages className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  尚未生成該語言的翻譯字幕
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  點擊右上角「一鍵 AI 翻譯此語言」，Gemini 將自動將所有 SRT 字幕句翻譯為目標語言。
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTranslate(selectedLangCode)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                <Sparkles className="w-4 h-4" />
                <span>立即開始翻譯</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 3: AI SUMMARY & INSIGHTS ---------------- */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {project.summary ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Executive Summary & Keypoints */}
              <div className="lg:col-span-2 space-y-6">
                {/* Executive Summary */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-cyan-400" />
                      <span>📋 核心內容執行摘要</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(project.summary.executiveSummary, 'exec_summary')
                      }
                      className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                    >
                      {copiedType === 'exec_summary' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>複製摘要</span>
                    </button>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    {project.summary.executiveSummary}
                  </p>
                </div>

                {/* Key Points */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <span>💡 關鍵核心要點 (Key Takeaways)</span>
                  </h3>
                  <div className="space-y-2.5">
                    {project.summary.keyPoints.map((point, i) => (
                      <div
                        key={i}
                        className="flex items-start space-x-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80"
                      >
                        <span className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-mono font-bold flex-shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-sm text-slate-200 leading-relaxed pt-0.5">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Items */}
                {project.summary.actionItems && project.summary.actionItems.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <CheckSquare className="w-5 h-5 text-emerald-400" />
                      <span>🎯 待辦事項與行動清單 (Action Items)</span>
                    </h3>
                    <div className="space-y-2">
                      {project.summary.actionItems.map((action, i) => (
                        <div
                          key={i}
                          className="flex items-start space-x-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-sm text-slate-200 leading-relaxed">{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Chapters, Keywords & Meta */}
              <div className="space-y-6">
                {/* Chapters with timestamp jumping */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Bookmark className="w-5 h-5 text-amber-400" />
                    <span>⏱️ 主題章節時間軸</span>
                  </h3>
                  <p className="text-xs text-slate-400">點擊章節即可跳轉至該音訊時間點：</p>
                  <div className="space-y-2.5">
                    {project.summary.chapters.map((ch, i) => (
                      <div
                        key={i}
                        onClick={() => handleSeek(ch.timestamp)}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500 hover:bg-indigo-950/20 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono text-cyan-400 font-semibold group-hover:text-cyan-300">
                            [{ch.timestampStr}]
                          </span>
                          <span className="text-[10px] text-slate-500 group-hover:text-slate-400">
                            跳轉播放 →
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white group-hover:text-indigo-200">
                          {ch.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                          {ch.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Keywords */}
                {project.summary.keywords && project.summary.keywords.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      關鍵主題標籤
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {project.summary.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-indigo-300 text-xs font-medium"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tone and Audience */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 text-xs">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    風格與受眾分析
                  </h3>
                  <div className="space-y-2 text-slate-300">
                    <div>
                      <span className="text-slate-500">語氣風格: </span>
                      <span className="font-medium text-white">
                        {project.summary.toneAndSentiment || '專業、清晰'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">目標受眾: </span>
                      <span className="font-medium text-white">
                        {project.summary.targetAudience || '大眾與相關領域專業人員'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              尚無 AI 摘要內容
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 4: EXPORT HUB ---------------- */}
      {activeTab === 'export' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Download className="w-5 h-5 text-indigo-400" />
              <span>多元格式匯出中心 (Export Hub)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              可個別下載 SRT 字幕、VTT、純文字逐字稿、完整 Markdown 報告，或一鍵打包 ZIP。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. SRT Subtitle */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs font-mono mb-3">
                  .SRT
                </div>
                <h3 className="text-sm font-bold text-white">標準 SRT 字幕檔</h3>
                <p className="text-xs text-slate-400 mt-1">
                  相容於 YouTube、Premiere Pro、Final Cut Pro、VLC 等剪輯與播放器。
                </p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const srt = generateSrtContent(project.segments);
                    downloadFile(srt, `${project.title || project.fileName}.srt`, 'text/plain');
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下載原始語言 SRT</span>
                </button>

                {Object.keys(project.translations || {}).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const firstLang = Object.keys(project.translations)[0];
                      const trans = project.translations[firstLang];
                      const transSegments = project.segments.map((seg) => {
                        const tSeg = trans.segments.find((s) => s.id === seg.id);
                        return { ...seg, translatedText: tSeg?.text || '' };
                      });
                      const bilingualSrt = generateSrtContent(transSegments, { bilingual: true });
                      downloadFile(
                        bilingualSrt,
                        `${project.title || project.fileName}_bilingual.srt`,
                        'text/plain'
                      );
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下載雙語對照 SRT</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. WebVTT */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs font-mono mb-3">
                  .VTT
                </div>
                <h3 className="text-sm font-bold text-white">WebVTT 網頁字幕檔</h3>
                <p className="text-xs text-slate-400 mt-1">
                  適用於 HTML5 字幕標籤、線上串流影片播放與網頁播放器。
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const vtt = generateVttContent(project.segments);
                  downloadFile(vtt, `${project.title || project.fileName}.vtt`, 'text/vtt');
                }}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下載 WebVTT (.vtt)</span>
              </button>
            </div>

            {/* 3. TXT Transcript */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs font-mono mb-3">
                  .TXT
                </div>
                <h3 className="text-sm font-bold text-white">純文字逐字稿</h3>
                <p className="text-xs text-slate-400 mt-1">
                  支援含時間戳標記或純淨文字段落匯出。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const txt = generateTxtTranscript(project.segments, true);
                    downloadFile(
                      txt,
                      `${project.title || project.fileName}_with_time.txt`,
                      'text/plain'
                    );
                  }}
                  className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold transition-colors text-center"
                >
                  含時間戳 TXT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const txt = generateTxtTranscript(project.segments, false);
                    downloadFile(
                      txt,
                      `${project.title || project.fileName}_clean.txt`,
                      'text/plain'
                    );
                  }}
                  className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold transition-colors text-center"
                >
                  純文字 TXT
                </button>
              </div>
            </div>

            {/* 4. Markdown Full Report */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs font-mono mb-3">
                  .MD
                </div>
                <h3 className="text-sm font-bold text-white">Markdown 完整報告</h3>
                <p className="text-xs text-slate-400 mt-1">
                  整合檔案資訊、AI 摘要、核心要點、主題章節與完整逐字稿。
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const md = generateMarkdownReport(project);
                  downloadFile(md, `${project.title || project.fileName}_report.md`, 'text/markdown');
                }}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下載 Markdown (.md)</span>
              </button>
            </div>

            {/* 5. JSON Raw Data */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs font-mono mb-3">
                  .JSON
                </div>
                <h3 className="text-sm font-bold text-white">結構化資料檔</h3>
                <p className="text-xs text-slate-400 mt-1">
                  完整包含時間數值、章節清單、翻譯陣列與語音中繼資料。
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const json = JSON.stringify(project, null, 2);
                  downloadFile(json, `${project.title || project.fileName}_data.json`, 'application/json');
                }}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下載 JSON 檔</span>
              </button>
            </div>

            {/* 6. One-Click Complete ZIP Bundle */}
            <div className="bg-gradient-to-br from-indigo-950/60 via-slate-950 to-indigo-950/40 border border-indigo-500/40 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-lg">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center mb-3 shadow-md">
                  <Archive className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">一鍵打包全部檔案</h3>
                <p className="text-xs text-indigo-200/80 mt-1">
                  一次下載包含 SRT、VTT、TXT、MD、JSON 與所有翻譯字幕的壓縮包。
                </p>
              </div>

              <button
                type="button"
                onClick={() => downloadAllInZip(project)}
                className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>下載完整 ZIP 壓縮包</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 5: CHUNK DETAILS (if >30m) ---------------- */}
      {activeTab === 'chunks' && project.isChunked && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Scissors className="w-5 h-5 text-amber-400" />
              <span>長音檔分段切割紀錄與時長監控</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              音訊總時長為 <span className="text-white font-mono">{formatAudioTime(project.duration)}</span>。系統已依據設定的 <span className="text-amber-300 font-semibold">{project.chunkDurationMinutes || 3} 分鐘</span> 切割週期將音訊切片轉錄，並進行全域時間戳無縫拼接。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(project.chunksMeta || []).map((chunk) => (
              <div
                key={chunk.chunkIndex}
                className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300">
                    片段 #{chunk.chunkIndex + 1}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">
                    轉錄完成
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-300">
                  {secondsToDisplayTime(chunk.startSeconds)} → {secondsToDisplayTime(chunk.endSeconds)}
                </div>
                <div className="text-xs text-slate-400">
                  片段長度: {formatAudioTime(chunk.durationSeconds)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
