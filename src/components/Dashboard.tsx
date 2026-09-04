import React, { useState, useMemo } from 'react';
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
  CheckSquare,
  Square,
  AlertTriangle,
  X,
  LayoutGrid,
  List,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  ArrowUpDown,
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
  onDeleteMultipleProjects?: (ids: string[]) => void;
  onClearAllProjects?: () => void;
  onNewTranscription: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  projects,
  onOpenProject,
  onDeleteProject,
  onDeleteMultipleProjects,
  onClearAllProjects,
  onNewTranscription,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'chunked' | 'translated'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'duration_desc' | 'duration_asc'>('newest');
  const [viewLayout, setViewLayout] = useState<'grid' | 'table'>('grid');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Deletion Modal states
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<TranscriptionProject | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success Notification toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Calculate statistics
  const totalDuration = projects.reduce((acc, p) => acc + (p.duration || 0), 0);
  const totalSegments = projects.reduce((acc, p) => acc + (p.segments?.length || 0), 0);
  const totalChunked = projects.filter((p) => p.isChunked).length;
  const allTranslationsCount = projects.reduce(
    (acc, p) => acc + Object.keys(p.translations || {}).length,
    0
  );

  // Filter & Sort projects
  const filteredAndSortedProjects = useMemo(() => {
    let result = projects.filter((p) => {
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchesSearch =
          (p.title || '').toLowerCase().includes(query) ||
          (p.fileName || '').toLowerCase().includes(query) ||
          (p.fullTranscript || '').toLowerCase().includes(query) ||
          (p.summary?.keywords || []).some((k) => k.toLowerCase().includes(query));

        if (!matchesSearch) return false;
      }

      if (filterType === 'chunked') return p.isChunked;
      if (filterType === 'translated')
        return Object.keys(p.translations || {}).length > 0;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'duration_desc') {
        return (b.duration || 0) - (a.duration || 0);
      }
      if (sortBy === 'duration_asc') {
        return (a.duration || 0) - (b.duration || 0);
      }
      return 0;
    });

    return result;
  }, [projects, searchQuery, filterType, sortBy]);

  // Handle Multi-Selection
  const allFilteredSelected =
    filteredAndSortedProjects.length > 0 &&
    filteredAndSortedProjects.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      // Unselect all current filtered
      const filteredIdSet = new Set(filteredAndSortedProjects.map((p) => p.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      // Select all current filtered
      const filteredIds = filteredAndSortedProjects.map((p) => p.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Execution: Single Delete
  const handleConfirmSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    setIsDeleting(true);
    try {
      const title = singleDeleteTarget.title || singleDeleteTarget.fileName;
      await onDeleteProject(singleDeleteTarget.id);
      setSelectedIds((prev) => prev.filter((id) => id !== singleDeleteTarget.id));
      setSingleDeleteTarget(null);
      showToast(`已成功刪除轉錄紀錄「${title}」`);
    } catch (err: any) {
      showToast(`刪除失敗：${err.message}`, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  // Execution: Batch Delete
  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      const count = selectedIds.length;
      if (onDeleteMultipleProjects) {
        await onDeleteMultipleProjects(selectedIds);
      } else {
        for (const id of selectedIds) {
          await onDeleteProject(id);
        }
      }
      setSelectedIds([]);
      setIsBatchDeleteModalOpen(false);
      showToast(`已成功批次刪除 ${count} 筆選取的轉錄紀錄`);
    } catch (err: any) {
      showToast(`批次刪除失敗：${err.message}`, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  // Execution: Clear All
  const handleConfirmClearAll = async () => {
    setIsDeleting(true);
    try {
      if (onClearAllProjects) {
        await onClearAllProjects();
      } else {
        for (const p of projects) {
          await onDeleteProject(p.id);
        }
      }
      setSelectedIds([]);
      setIsClearAllModalOpen(false);
      showToast('已清空全部歷史紀錄與音訊快取');
    } catch (err: any) {
      showToast(`清空失敗：${err.message}`, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  // Batch Export ZIP
  const handleBatchExportZip = async () => {
    const selectedProjects = projects.filter((p) => selectedIds.includes(p.id));
    if (selectedProjects.length === 0) return;

    showToast(`正在打包 ${selectedProjects.length} 筆專案字幕與逐字稿...`, 'info');
    for (const p of selectedProjects) {
      await downloadAllInZip(p);
    }
    showToast(`已完成 ${selectedProjects.length} 筆專案匯出`);
  };

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
    <div className="max-w-7xl mx-auto space-y-7 relative pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md animate-fadeIn transition-all ${
            toastMessage.type === 'success'
              ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-200'
              : 'bg-slate-900/95 border-indigo-500/50 text-indigo-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-medium">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 text-slate-400 hover:text-white rounded-lg ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            語音轉錄歷史紀錄與管理儀表板
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            即時檢閱、搜尋、二次編輯、批次管理與多格式匯出音訊逐字稿與 SRT 字幕。
          </p>
        </div>

        <div className="flex items-center space-x-2.5 self-start md:self-auto flex-wrap gap-y-2">
          {projects.length > 0 && (
            <button
              id="btn-clear-all-history"
              type="button"
              onClick={() => setIsClearAllModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-xs font-medium transition-all"
              title="清空所有歷史轉錄紀錄與本地暫存音訊"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>清空全部紀錄</span>
            </button>
          )}

          <button
            id="btn-new-transcription-dashboard"
            onClick={onNewTranscription}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>新增語音轉錄</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
              份譯本 · {totalChunked} 筆分段
            </span>
          </div>
        </div>
      </div>

      {/* Filter, Search & Layout Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-md">
        {/* Left: Search Input & Multi-select all */}
        <div className="flex items-center space-x-3 flex-1">
          {projects.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className={`p-2 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                allFilteredSelected
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
              title={allFilteredSelected ? '取消全選' : '全選目前篩選項目'}
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          )}

          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋標題、檔名、逐字稿、標籤關鍵字..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Filter Pills, Sort Dropdown & Layout Switcher */}
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {/* Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              全部 ({projects.length})
            </button>
            <button
              onClick={() => setFilterType('chunked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center space-x-1 ${
                filterType === 'chunked'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Scissors className="w-3 h-3 text-amber-400" />
              <span>&gt;30分長檔 ({totalChunked})</span>
            </button>
            <button
              onClick={() => setFilterType('translated')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center space-x-1 ${
                filterType === 'translated'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Languages className="w-3 h-3 text-cyan-400" />
              <span>含譯本</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none text-xs cursor-pointer"
            >
              <option value="newest" className="bg-slate-900 text-white">最新建立</option>
              <option value="oldest" className="bg-slate-900 text-white">最舊建立</option>
              <option value="duration_desc" className="bg-slate-900 text-white">時長最長</option>
              <option value="duration_asc" className="bg-slate-900 text-white">時長最短</option>
            </select>
          </div>

          {/* Layout Toggle */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewLayout('grid')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewLayout === 'grid'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="卡片網格視圖"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('table')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewLayout === 'table'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="清單列表視圖"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Projects Display */}
      {filteredAndSortedProjects.length === 0 ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">尚無符合條件的轉錄紀錄</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? '找不到符合關鍵字的項目，請嘗試更換搜尋條件或清除篩選。'
                : '開始上傳您的音訊檔、錄音或視訊檔案，系統將自動為您轉錄與生成 SRT 字幕。'}
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
      ) : viewLayout === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAndSortedProjects.map((project) => {
            const isSelected = selectedIds.includes(project.id);
            const hasTranslations = Object.keys(project.translations || {}).length > 0;
            const keywords = project.summary?.keywords || [];

            return (
              <div
                key={project.id}
                onClick={() => onOpenProject(project)}
                className={`bg-slate-900 border rounded-2xl p-5 shadow-xl transition-all cursor-pointer flex flex-col justify-between group space-y-4 relative ${
                  isSelected
                    ? 'border-indigo-500/80 ring-2 ring-indigo-500/30 bg-slate-900/95'
                    : 'border-slate-800 hover:border-indigo-500/50 hover:shadow-indigo-500/10'
                }`}
              >
                {/* Card Top: Checkbox & Title */}
                <div className="space-y-2">
                  <div className="flex items-start space-x-3">
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => toggleSelectItem(project.id, e)}
                      className={`mt-0.5 p-1 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      title={isSelected ? '取消選取' : '選取此項目'}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-white text-sm sm:text-base group-hover:text-indigo-300 transition-colors line-clamp-1">
                          {project.title || project.fileName}
                        </h3>

                        {project.isChunked && (
                          <span
                            title="音訊超過 30 分鐘，已自動分段切割處理"
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold shrink-0"
                          >
                            <Scissors className="w-3 h-3" />
                            <span>已分段</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
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

                {/* Card Actions Footer */}
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
                    {/* Delete Trigger Button */}
                    <button
                      type="button"
                      title="刪除此筆紀錄"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSingleDeleteTarget(project);
                      }}
                      className="p-2 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenProject(project)}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-all"
                    >
                      <span>開啟</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950/80 text-slate-400 text-xs border-b border-slate-800">
                <tr>
                  <th className="p-4 w-12 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-white"
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-4 font-semibold text-slate-300">專案標題與檔名</th>
                  <th className="p-4 font-semibold text-slate-300">音訊長度</th>
                  <th className="p-4 font-semibold text-slate-300">字幕句數</th>
                  <th className="p-4 font-semibold text-slate-300">建立日期</th>
                  <th className="p-4 font-semibold text-slate-300">多語言 / 標籤</th>
                  <th className="p-4 font-semibold text-slate-300 text-right">操作管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredAndSortedProjects.map((project) => {
                  const isSelected = selectedIds.includes(project.id);
                  const hasTranslations = Object.keys(project.translations || {}).length > 0;

                  return (
                    <tr
                      key={project.id}
                      onClick={() => onOpenProject(project)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td
                        className="p-4 text-center"
                        onClick={(e) => toggleSelectItem(project.id, e)}
                      >
                        <button
                          type="button"
                          className="text-slate-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-4 font-medium text-white max-w-xs">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold line-clamp-1">
                            {project.title || project.fileName}
                          </span>
                          {project.isChunked && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              分段
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {project.fileName}
                        </p>
                      </td>
                      <td className="p-4 font-mono text-cyan-300 text-xs">
                        {formatAudioTime(project.duration)}
                      </td>
                      <td className="p-4 text-slate-300 text-xs">
                        {project.segments?.length || 0} 句
                      </td>
                      <td className="p-4 text-slate-400 text-xs">
                        {new Date(project.createdAt).toLocaleDateString('zh-TW')}
                      </td>
                      <td className="p-4 text-xs">
                        <div className="flex items-center space-x-2">
                          {hasTranslations && (
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px]">
                              {Object.keys(project.translations).length} 種語言
                            </span>
                          )}
                          {(project.summary?.keywords || []).slice(0, 2).map((k, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]"
                            >
                              #{k}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            title="下載 SRT"
                            onClick={(e) => handleQuickSrtDownload(e, project)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                          >
                            SRT
                          </button>
                          <button
                            type="button"
                            title="下載 ZIP"
                            onClick={(e) => handleQuickZipDownload(e, project)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          {/* Delete */}
                          <button
                            type="button"
                            title="刪除"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSingleDeleteTarget(project);
                            }}
                            className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenProject(project)}
                            className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating Bottom Batch Toolbar (When 1 or more items selected) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-indigo-500/50 shadow-2xl rounded-2xl px-5 py-3.5 backdrop-blur-md flex items-center space-x-4 animate-slideUp">
          <div className="flex items-center space-x-2 text-xs sm:text-sm font-semibold text-white">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span>已選取 {selectedIds.length} 筆專案紀錄</span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleBatchExportZip}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>批次匯出 ZIP</span>
            </button>

            <button
              id="btn-batch-delete-trigger"
              type="button"
              onClick={() => setIsBatchDeleteModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/30 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>批次刪除 ({selectedIds.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors text-xs"
              title="取消選取"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* 1. Single Project Delete Modal */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">確認刪除這筆轉錄紀錄？</h3>
                <p className="text-xs text-slate-400">
                  此操作將永久移除逐字稿、時間軸字幕與本地音訊快取。
                </p>
              </div>
            </div>

            {/* Target Item Summary */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">專案名稱：</span>
                <span className="font-semibold text-white truncate max-w-[200px]">
                  {singleDeleteTarget.title || singleDeleteTarget.fileName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">音訊檔案：</span>
                <span className="font-mono text-slate-300 truncate max-w-[200px]">
                  {singleDeleteTarget.fileName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">音訊長度：</span>
                <span className="font-mono text-cyan-300">
                  {formatAudioTime(singleDeleteTarget.duration)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">字幕句數：</span>
                <span className="text-emerald-300">
                  {singleDeleteTarget.segments?.length || 0} 句
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">建立時間：</span>
                <span className="text-slate-400">
                  {new Date(singleDeleteTarget.createdAt).toLocaleString('zh-TW')}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSingleDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button
                id="btn-confirm-single-delete"
                type="button"
                onClick={handleConfirmSingleDelete}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? '正在刪除...' : '確認刪除'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Batch Delete Modal */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">確認批次刪除選取的紀錄？</h3>
                <p className="text-xs text-slate-400">
                  即將永久刪除 <strong className="text-rose-400">{selectedIds.length}</strong> 筆選取的語音轉錄專案與快取。
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 max-h-40 overflow-y-auto space-y-1.5 text-xs">
              <span className="text-slate-400 font-medium">選取的專案列表：</span>
              {projects
                .filter((p) => selectedIds.includes(p.id))
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-slate-300">
                    <span className="truncate max-w-[240px]">{p.title || p.fileName}</span>
                    <span className="font-mono text-[10px] text-cyan-300">
                      {formatAudioTime(p.duration)}
                    </span>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button
                id="btn-confirm-batch-delete"
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? '正在刪除...' : `確認批次刪除 (${selectedIds.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Clear All Modal */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">確認清空所有轉錄紀錄？</h3>
                <p className="text-xs text-rose-300/90 leading-relaxed">
                  警告：此操作將清除資料庫中全部共 <strong>{projects.length}</strong> 筆音訊轉錄歷史、SRT 字幕及音訊檔快取，此動作無法復原。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button
                id="btn-confirm-clear-all"
                type="button"
                onClick={handleConfirmClearAll}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? '正在清空...' : '確認清空全部'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
