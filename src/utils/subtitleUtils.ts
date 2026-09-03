import JSZip from 'jszip';
import { SubtitleSegment, AIAnalysisSummary, TranscriptionProject } from '../types';

/**
 * Format seconds to SRT format: HH:MM:SS,mmm
 */
export function secondsToSrtTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  const pad = (num: number, size = 2) => String(num).padStart(size, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

/**
 * Format seconds to WebVTT format: HH:MM:SS.mmm
 */
export function secondsToVttTime(seconds: number): string {
  return secondsToSrtTime(seconds).replace(',', '.');
}

/**
 * Format seconds to human readable time: MM:SS or HH:MM:SS
 */
export function secondsToDisplayTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num: number) => String(num).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Parse SRT timestamp to seconds
 */
export function srtTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const normalized = timeStr.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Generate SRT content from segments
 */
export function generateSrtContent(
  segments: SubtitleSegment[],
  options?: {
    useTranslated?: boolean;
    bilingual?: boolean;
    bilingualOrder?: 'originalFirst' | 'translatedFirst';
  }
): string {
  if (!segments || segments.length === 0) return '';

  return segments
    .map((seg, index) => {
      const id = index + 1;
      const startStr = seg.startTimeStr || secondsToSrtTime(seg.start);
      const endStr = seg.endTimeStr || secondsToSrtTime(seg.end);

      let text = seg.text;
      if (options?.bilingual && seg.translatedText) {
        if (options.bilingualOrder === 'translatedFirst') {
          text = `${seg.translatedText}\n${seg.text}`;
        } else {
          text = `${seg.text}\n${seg.translatedText}`;
        }
      } else if (options?.useTranslated && seg.translatedText) {
        text = seg.translatedText;
      }

      return `${id}\n${startStr} --> ${endStr}\n${text}\n`;
    })
    .join('\n');
}

/**
 * Generate WebVTT content from segments
 */
export function generateVttContent(
  segments: SubtitleSegment[],
  options?: {
    useTranslated?: boolean;
    bilingual?: boolean;
  }
): string {
  if (!segments || segments.length === 0) return 'WEBVTT\n\n';

  let vtt = 'WEBVTT\n\n';
  vtt += segments
    .map((seg, index) => {
      const id = index + 1;
      const startStr = secondsToVttTime(seg.start);
      const endStr = secondsToVttTime(seg.end);

      let text = seg.text;
      if (options?.bilingual && seg.translatedText) {
        text = `${seg.text}\n${seg.translatedText}`;
      } else if (options?.useTranslated && seg.translatedText) {
        text = seg.translatedText;
      }

      return `${id}\n${startStr} --> ${endStr}\n${text}\n`;
    })
    .join('\n');

  return vtt;
}

/**
 * Generate TXT plain transcript
 */
export function generateTxtTranscript(
  segments: SubtitleSegment[],
  includeTimestamps = false
): string {
  if (!segments || segments.length === 0) return '';

  if (includeTimestamps) {
    return segments
      .map((seg) => {
        const time = `[${secondsToDisplayTime(seg.start)} - ${secondsToDisplayTime(seg.end)}]`;
        const speaker = seg.speaker ? `${seg.speaker}: ` : '';
        return `${time} ${speaker}${seg.text}`;
      })
      .join('\n\n');
  }

  return segments.map((seg) => seg.text).join('\n\n');
}

/**
 * Generate comprehensive Markdown document
 */
export function generateMarkdownReport(project: TranscriptionProject): string {
  const { title, fileName, duration, createdAt, summary, segments, translations } = project;

  let md = `# 🎙️ ${title || '語音轉錄與摘要報告'}\n\n`;
  md += `> **原始檔案**: ${fileName} | **時長**: ${secondsToDisplayTime(duration)} | **建立時間**: ${new Date(createdAt).toLocaleString('zh-TW')}\n\n`;
  md += `---\n\n`;

  if (summary) {
    md += `## 📋 AI 內容執行摘要\n\n`;
    md += `${summary.executiveSummary || '無摘要'}\n\n`;

    if (summary.keyPoints && summary.keyPoints.length > 0) {
      md += `### 💡 核心重點要項\n\n`;
      summary.keyPoints.forEach((point, i) => {
        md += `${i + 1}. ${point}\n`;
      });
      md += `\n`;
    }

    if (summary.actionItems && summary.actionItems.length > 0) {
      md += `### 🎯 待辦事項與行動建議\n\n`;
      summary.actionItems.forEach((action) => {
        md += `- [ ] ${action}\n`;
      });
      md += `\n`;
    }

    if (summary.chapters && summary.chapters.length > 0) {
      md += `### ⏱️ 主題章節時間軸\n\n`;
      summary.chapters.forEach((ch) => {
        md += `- **[${ch.timestampStr}] ${ch.title}**: ${ch.description}\n`;
      });
      md += `\n`;
    }

    if (summary.keywords && summary.keywords.length > 0) {
      md += `### 🏷️ 關鍵主題標籤\n\n`;
      md += summary.keywords.map((k) => `\`#${k}\``).join(' ') + `\n\n`;
    }
    md += `---\n\n`;
  }

  md += `## 📝 完整語音逐字稿 (含時間戳)\n\n`;
  if (segments && segments.length > 0) {
    segments.forEach((seg) => {
      const time = `\`[${secondsToDisplayTime(seg.start)}]\``;
      const speaker = seg.speaker ? `**${seg.speaker}**: ` : '';
      md += `${time} ${speaker}${seg.text}\n\n`;
    });
  } else {
    md += `${project.fullTranscript || '無逐字稿資料'}\n\n`;
  }

  const langKeys = Object.keys(translations || {});
  if (langKeys.length > 0) {
    md += `---\n\n## 🌐 多語言翻譯對照\n\n`;
    langKeys.forEach((key) => {
      const trans = translations[key];
      md += `### 語言: ${trans.languageName} (${key})\n\n`;
      segments.forEach((seg) => {
        const transSeg = trans.segments.find((s) => s.id === seg.id);
        const transText = transSeg ? transSeg.text : '(無翻譯)';
        md += `\`[${secondsToDisplayTime(seg.start)}]\` **原文**: ${seg.text}\n`;
        md += `> **譯文**: ${transText}\n\n`;
      });
    });
  }

  return md;
}

/**
 * Trigger file download directly in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generate ZIP containing all export formats
 */
export async function downloadAllInZip(project: TranscriptionProject) {
  const zip = new JSZip();
  const safeName = (project.title || project.fileName || 'transcript').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');

  // 1. SRT (Original)
  const srtOriginal = generateSrtContent(project.segments);
  zip.file(`${safeName}_original.srt`, srtOriginal);

  // 2. WebVTT (Original)
  const vttOriginal = generateVttContent(project.segments);
  zip.file(`${safeName}_original.vtt`, vttOriginal);

  // 3. Plain Text (with and without timestamps)
  const txtWithTime = generateTxtTranscript(project.segments, true);
  const txtPure = generateTxtTranscript(project.segments, false);
  zip.file(`${safeName}_with_timestamps.txt`, txtWithTime);
  zip.file(`${safeName}_clean_transcript.txt`, txtPure);

  // 4. Markdown Full Report
  const mdReport = generateMarkdownReport(project);
  zip.file(`${safeName}_report.md`, mdReport);

  // 5. JSON Raw Data
  const jsonData = JSON.stringify(project, null, 2);
  zip.file(`${safeName}_data.json`, jsonData);

  // 6. Translations if any
  if (project.translations) {
    const transFolder = zip.folder('translations');
    Object.entries(project.translations).forEach(([langCode, trans]) => {
      // Translated SRT
      const transSegments = project.segments.map((seg) => {
        const tSeg = trans.segments.find((s) => s.id === seg.id);
        return {
          ...seg,
          translatedText: tSeg?.text || '',
        };
      });

      const transSrt = generateSrtContent(transSegments, { useTranslated: true });
      transFolder?.file(`${safeName}_${langCode}.srt`, transSrt);

      // Bilingual SRT
      const bilingualSrt = generateSrtContent(transSegments, { bilingual: true });
      transFolder?.file(`${safeName}_bilingual_${langCode}.srt`, bilingualSrt);
    });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}_transcription_bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
