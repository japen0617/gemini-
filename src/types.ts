export interface SubtitleSegment {
  id: number;
  start: number; // in seconds (e.g. 12.35)
  end: number;   // in seconds (e.g. 15.80)
  startTimeStr: string; // "00:00:12,350"
  endTimeStr: string;   // "00:00:15,800"
  text: string;
  translatedText?: string;
  speaker?: string;
}

export interface ChapterMark {
  title: string;
  timestamp: number; // seconds
  timestampStr: string; // "00:05:20"
  description: string;
}

export interface AIAnalysisSummary {
  executiveSummary: string;
  keyPoints: string[];
  actionItems: string[];
  chapters: ChapterMark[];
  keywords: string[];
  toneAndSentiment: string;
  targetAudience: string;
}

export interface TranslationResult {
  languageCode: string;
  languageName: string;
  translatedAt: string;
  segments: {
    id: number;
    text: string;
  }[];
}

export interface AudioChunkMeta {
  chunkIndex: number;
  totalChunks: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface TranscriptionProject {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number; // in seconds
  createdAt: string;
  updatedAt: string;
  status: 'completed' | 'processing' | 'error';
  isChunked: boolean;
  chunksMeta?: AudioChunkMeta[];
  sourceLanguage?: string;
  fullTranscript: string;
  segments: SubtitleSegment[];
  summary: AIAnalysisSummary;
  translations: Record<string, TranslationResult>; // keyed by langCode, e.g. "en", "ja"
  audioBlobUrl?: string; // cached in memory or IndexedDB
  audioBase64?: string;
}

export type PlatformType = 'auto' | 'gemini_api' | 'agent_platform';

export interface ApiConfig {
  platform?: PlatformType;
  apiKey: string;
  keyType?: PlatformType; // for backward compatibility
  detectedType?: 'gemini_api' | 'agent_platform';
  gcpProjectId?: string;
  gcpLocation?: string;
  customEndpoint?: string;
  selectedModel?: string;
  testedAt?: string;
  status?: 'valid' | 'invalid' | 'untested';
  message?: string;
  latencyMs?: number;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'zh-TW', name: '繁體中文', nativeName: '繁體中文', flag: '🇹🇼' },
  { code: 'zh-CN', name: '簡體中文', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'en', name: '英文', nativeName: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日文', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '韓文', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'es', name: '西班牙文', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: '法文', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: '德文', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'vi', name: '越南文', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'id', name: '印尼文', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
];
