import React, { useState } from 'react';
import {
  Search,
  Clock,
  FileText,
  Download,
  Trash2,
  ExternalLink,
  Sparkles,
  Layers,
  Scissors,
  Calendar,
  Languages,
  PlusCircle,
  Archive,
  BarChart3,
  FileSpreadsheet,
} from 'lucide-react';
import { TranscriptionProject } from '../types';
import { formatAudioTime } from '../utils/audioUtils';
import {
  generateSrtContent,
  generateTxtTranscript,
  downloadFile,
  downloadAllInZip,
} from '../utils/subtitleUtils';

interface DashboardProps {
  projects: TranscriptionProject[];
  onOpenProject: (project: TranscriptionProject) => void;
  onDeleteProject: (id: string) => void;
  onNewTranscription: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projects,
  onOpenProject,
  onDeleteProject,
  onNewTranscription,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'chunked' | 'translated'>('all');
  const [viewLayout, setViewLayout] = useState<'grid' | 'table'>('grid');

  // Calculate statistics
  const totalDuration = projects.reduce((acc, p) => acc + (p.duration || 0), 0);
  const totalSegments = projects.reduce((acc, p) => acc + (p.segments?.length || 0), 0);
  const totalChunked = projects.filter((p) => p.isChunked).length;
  const allTranslationsCount = projects.reduce(
    (acc, p) => acc + Object.keys(p.translations || {}).length,
    0
  );

  // Filter projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.fullTranscript.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.summary?.keywords || []).some((k) =>
        k.toLowerCase().includes(searchQuery.toLowerCase())
      );

    if (!matchesSearch) return false;

    if (filterType === 'chunked') return p.isChunked;
    if (filterType === 'translated')
      return Object.keys(p.translations || {}).length > 0;

    return true;
  });

  const handleQuickSrtDownload = (e: React.MouseEvent, project: TranscriptionProject) => {
    e.stopPropagation();
    const srt = generateSrtContent(project.segments);
    const safeName = (project.title || project.fileName).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
    downloadFile(srt, `${safeName}.srt`, 'text/plain');
  };

  const handleQuickTxtDownload = (e: React.MouseEvent, project: TranscriptionProject) => {
    e.stopPropagation();
    const txt = generateTxtTranscript(project.segments, true);
    const safeName = (project.title || project.fileName).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
    downloadFile(txt, `${safeName}_transcript.txt`, 'text/plain');
  };

  const handleQuickZipDownload = async (e: React.MouseEvent, project: TranscriptionProject) => {
    e.stopPropagation();
    await downloadAllInZip(project);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            語音轉錄歷史紀錄與管理儀表板
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            即時檢閱、搜尋、二次編輯與多格式批次匯出所有音訊逐字稿與 SRT 字幕。
          </p>
        </div>

        <button
          onClick={onNewTranscription}
          className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>新增語音轉錄</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              已處理專案總數
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {projects.length}
            </span>
            <span className="text-xs text-slate-400">筆紀錄</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              累計音訊總時長
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {formatAudioTime(totalDuration)}
            </span>
            <span className="text-xs text-slate-400">時:分:秒</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              產出字幕句數
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {totalSegments}
            </span>
            <span className="text-xs text-slate-400">條時間軸字幕</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              多語言翻譯 / 切割
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Languages className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {allTranslationsCount}
            </span>
            <span className="text-xs text-slate-400">
              份譯本 · {totalChunked} 筆長檔切割
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜尋標題、逐字稿、關鍵字..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            全部紀錄 ({projects.length})
          </button>
          <button
            onClick={() => setFilterType('chunked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center space-x-1 ${
              filterType === 'chunked'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Scissors className="w-3 h-3 text-amber-400" />
            <span>&gt;30分長音檔 ({totalChunked})</span>
          </button>
          <button
            onClick={() => setFilterType('translated')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center space-x-1 ${
              filterType === 'translated'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Languages className="w-3 h-3 text-cyan-400" />
            <span>含多語言翻譯</span>
          </button>
        </div>
      </div>

      {/* Projects Display */}
      {filteredProjects.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">尚無符合條件的轉錄紀錄</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? '找不到符合關鍵字的項目，請嘗試更換搜尋條件。'
                : '開始上傳您的第一個音訊檔或使用麥克風錄音，系統將自動為您轉錄與生成 SRT 字幕。'}
            </p>
          </div>
          <button
            onClick={onNewTranscription}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            <PlusCircle className="w-4 h-4" />
            <span>立即建立新轉錄</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const hasTranslations = Object.keys(project.translations || {}).length > 0;
            const keywords = project.summary?.keywords || [];

            return (
              <div
                key={project.id}
                onClick={() => onOpenProject(project)}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 shadow-xl transition-all hover:shadow-indigo-500/10 cursor-pointer flex flex-col justify-between group space-y-4"
              >
                {/* Card Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-white text-base group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {project.title || project.fileName}
                    </h3>

                    {project.isChunked && (
                      <span
                        title="音訊超過 30 分鐘，已自動分段切割處理"
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold flex-shrink-0"
                      >
                        <Scissors className="w-3 h-3" />
                        <span>已分段</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>{formatAudioTime(project.duration)}</span>
                    </span>
                    <span>·</span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{new Date(project.createdAt).toLocaleDateString('zh-TW')}</span>
                    </span>
                    <span>·</span>
                    <span>{project.segments?.length || 0} 句字幕</span>
                  </div>
                </div>

                {/* Summary Snippet */}
                <p className="text-xs text-slate-300/80 line-clamp-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 leading-relaxed">
                  {project.summary?.executiveSummary || project.fullTranscript.slice(0, 100) + '...'}
                </p>

                {/* Tags / Language Badges */}
                <div className="space-y-2">
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.slice(0, 3).map((kw, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px]"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {hasTranslations && (
                    <div className="flex items-center space-x-1 text-[11px] text-indigo-400">
                      <Languages className="w-3 h-3" />
                      <span>已支援 {Object.keys(project.translations).length} 種語言字幕</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      title="下載 SRT 字幕檔"
                      onClick={(e) => handleQuickSrtDownload(e, project)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-mono"
                    >
                      .SRT
                    </button>
                    <button
                      type="button"
                      title="下載 TXT 逐字稿"
                      onClick={(e) => handleQuickTxtDownload(e, project)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-mono"
                    >
                      .TXT
                    </button>
                    <button
                      type="button"
                      title="一鍵打包全部檔案 (.zip)"
                      onClick={(e) => handleQuickZipDownload(e, project)}
                      className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white transition-colors text-xs flex items-center space-x-1"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span className="text-[10px]">ZIP</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      title="刪除紀錄"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`確定要刪除「${project.title || project.fileName}」嗎？`)) {
                          onDeleteProject(project.id);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenProject(project)}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-all"
                    >
                      <span>開啟工作室</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
