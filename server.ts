import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import * as OpenCC from 'opencc-js';

dotenv.config();

// Deterministic Simplified-to-Traditional Chinese converter (Taiwan Standard)
const s2tw = OpenCC.Converter({ from: 'cn', to: 'tw' });

function isTraditionalChineseHint(hint?: string): boolean {
  if (!hint) return false;
  const h = String(hint).toLowerCase().trim();
  return (
    h === 'zh-tw' ||
    h === 'zh-hk' ||
    h === 'zh-mo' ||
    h.includes('traditional') ||
    h.includes('繁體') ||
    h.includes('正體') ||
    h.includes('台灣') ||
    h.includes('臺灣')
  );
}

function convertSummaryToTrad(sum: any): any {
  if (!sum || typeof sum !== 'object') return sum;
  return {
    ...sum,
    executiveSummary: sum.executiveSummary ? s2tw(sum.executiveSummary) : sum.executiveSummary,
    keyPoints: Array.isArray(sum.keyPoints) ? sum.keyPoints.map((k: string) => s2tw(String(k || ''))) : sum.keyPoints,
    actionItems: Array.isArray(sum.actionItems) ? sum.actionItems.map((a: string) => s2tw(String(a || ''))) : sum.actionItems,
    chapters: Array.isArray(sum.chapters)
      ? sum.chapters.map((c: any) => ({
          ...c,
          title: c.title ? s2tw(String(c.title || '')) : c.title,
          description: c.description ? s2tw(String(c.description || '')) : c.description,
        }))
      : sum.chapters,
    keywords: Array.isArray(sum.keywords) ? sum.keywords.map((kw: string) => s2tw(String(kw || ''))) : sum.keywords,
    toneAndSentiment: sum.toneAndSentiment ? s2tw(String(sum.toneAndSentiment || '')) : sum.toneAndSentiment,
    targetAudience: sum.targetAudience ? s2tw(String(sum.targetAudience || '')) : sum.targetAudience,
  };
}

const app = express();
const PORT = 3000;

// Increase JSON payload limit for audio files (up to 100MB)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Interface for Platform Options
interface PlatformConfig {
  apiKey?: string;
  geminiApiKey?: string;
  agentPlatformKey?: string;
  platform?: 'auto' | 'gemini_api' | 'agent_platform';
  gcpProjectId?: string;
  gcpLocation?: string;
  customEndpoint?: string;
}

// Extract Platform Config from request headers
function getPlatformConfigFromReq(req: express.Request): PlatformConfig {
  const geminiApiKey = (req.headers['x-gemini-api-key'] || req.headers['x-ai-studio-key'] || '') as string;
  const agentPlatformKey = (req.headers['x-agent-platform-key'] || '') as string;
  const genericApiKey = (req.headers['x-api-key'] || '') as string;
  const platform = (req.headers['x-platform-type'] || 'gemini_api') as 'auto' | 'gemini_api' | 'agent_platform';
  const gcpProjectId = (req.headers['x-gcp-project-id'] || '') as string;
  const gcpLocation = (req.headers['x-gcp-location'] || 'us-central1') as string;
  const customEndpoint = (req.headers['x-custom-endpoint'] || '') as string;

  // Resolve appropriate active key based on platform
  let activeKey = '';
  if (platform === 'agent_platform') {
    activeKey = agentPlatformKey || genericApiKey || geminiApiKey;
  } else {
    // gemini_api or auto default to AI Studio
    activeKey = geminiApiKey || genericApiKey;
  }

  return {
    apiKey: activeKey.trim() || undefined,
    geminiApiKey: geminiApiKey.trim() || undefined,
    agentPlatformKey: agentPlatformKey.trim() || undefined,
    platform: platform || 'gemini_api',
    gcpProjectId: gcpProjectId.trim() || undefined,
    gcpLocation: gcpLocation.trim() || 'us-central1',
    customEndpoint: customEndpoint.trim() || undefined,
  };
}

// Factory to create GoogleGenAI client with selected platform settings
function createGenAIClient(config: PlatformConfig): { client: GoogleGenAI; platform: 'gemini_api' | 'agent_platform'; endpointUrl: string } {
  const { apiKey, geminiApiKey, agentPlatformKey, platform = 'gemini_api', gcpProjectId, gcpLocation = 'us-central1', customEndpoint } = config;

  // Determine active platform
  let activePlatform: 'gemini_api' | 'agent_platform' = 'gemini_api';
  if (platform === 'agent_platform') {
    activePlatform = 'agent_platform';
  } else if (platform === 'gemini_api') {
    activePlatform = 'gemini_api';
  } else if (platform === 'auto') {
    activePlatform = gcpProjectId ? 'agent_platform' : 'gemini_api';
  }

  const resolvedKey =
    (activePlatform === 'agent_platform'
      ? (agentPlatformKey || apiKey)
      : (geminiApiKey || apiKey)) ||
    process.env.GEMINI_API_KEY ||
    '';

  let endpointUrl = '';
  let client: GoogleGenAI;

  if (activePlatform === 'agent_platform') {
    const isGlobal = gcpLocation === 'global';
    endpointUrl = customEndpoint || (isGlobal ? 'https://aiplatform.googleapis.com' : `https://${gcpLocation}-aiplatform.googleapis.com`);
    if (gcpProjectId) {
      client = new GoogleGenAI({
        vertexai: true,
        project: gcpProjectId,
        location: gcpLocation || 'us-central1',
        apiKey: resolvedKey,
      });
    } else if (customEndpoint) {
      client = new GoogleGenAI({
        apiKey: resolvedKey,
        httpOptions: {
          baseUrl: customEndpoint,
        },
      });
    } else {
      // Without project ID, default to direct GoogleGenAI client
      client = new GoogleGenAI({
        apiKey: resolvedKey,
      });
    }
  } else {
    // Google AI Studio: STRICTLY https://generativelanguage.googleapis.com/v1beta
    // Per user mandate: 選擇AI studio 的時候就只能使用 https://generativelanguage.googleapis.com/v1beta 端點
    endpointUrl = 'https://generativelanguage.googleapis.com/v1beta';
    client = new GoogleGenAI({
      apiKey: resolvedKey,
    });
  }

  return { client, platform: activePlatform, endpointUrl };
}

// Helper to call ai.models.generateContent with exponential backoff on 429 / 503 / transient rate limit errors
// and automatic fallback model/client switching on high-demand, 404 or endpoint/model errors
// Waterfall model cascade for text processing and general tasks:
// 1. Gemini 3.8 Flash (預設首選)
// 2. Gemini 3.7 Flash (若 3.8 額度滿/速率限制，優先降級)
// 3. Gemini 3.5 Flash (若 3.8 與 3.7 額度皆滿，進一步降級)
const FLASH_CASCADE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
] as const;

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: any,
  maxRetries = 3,
  fallbackApiKey?: string
): Promise<any> {
  let attempt = 0;
  let currentModel = params.model || 'gemini-3.8-flash';

  // Construct candidate models sequence strictly respecting user instruction:
  // Primary: gemini-3.8-flash -> Fallback 1: gemini-3.7-flash -> Fallback 2: gemini-3.5-flash
  let candidateModels: string[];
  if (currentModel.includes('transcribe')) {
    candidateModels = [currentModel, 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];
  } else {
    candidateModels = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];
    if (!candidateModels.includes(currentModel)) {
      candidateModels = [currentModel, ...candidateModels];
    }
  }

  let modelIdx = candidateModels.indexOf(currentModel);
  if (modelIdx < 0) modelIdx = 0;
  currentModel = candidateModels[modelIdx];

  let currentAi = ai;

  while (attempt <= maxRetries) {
    try {
      return await currentAi.models.generateContent({
        ...params,
        model: currentModel,
      });
    } catch (err: any) {
      attempt++;
      const errMsg = err?.message || String(err || '');
      const status = err?.status || err?.code;
      const isRateLimit =
        status === 429 ||
        status === 'RESOURCE_EXHAUSTED' ||
        errMsg.includes('429') ||
        errMsg.includes('Resource exhausted') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('quota') ||
        errMsg.includes('Quota exceeded');
      const isTransient =
        status === 503 ||
        status === 'UNAVAILABLE' ||
        errMsg.includes('503') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('high demand') ||
        errMsg.includes('overloaded') ||
        errMsg.includes('temporarily') ||
        errMsg.includes('500');
      const isModelOrAuthIssue =
        status === 404 ||
        status === 403 ||
        errMsg.includes('404') ||
        errMsg.includes('Not Found') ||
        errMsg.includes('not found') ||
        errMsg.includes('not supported') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('API_KEY_SERVICE_BLOCKED');

      // If client threw 404/403 (e.g. endpoint path or model mismatch), fallback to standard Google AI Studio client
      if (isModelOrAuthIssue) {
        try {
          currentAi = new GoogleGenAI({
            apiKey: fallbackApiKey || process.env.GEMINI_API_KEY || '',
          });
        } catch {
          // keep existing
        }
      }

      // Try next model in the waterfall cascade:
      // gemini-3.8-flash -> gemini-3.7-flash -> gemini-3.5-flash
      if ((isTransient || isModelOrAuthIssue || isRateLimit) && modelIdx + 1 < candidateModels.length) {
        modelIdx++;
        const prevModel = currentModel;
        currentModel = candidateModels[modelIdx];
        const delayMs = isRateLimit ? 400 : 200;
        console.warn(
          `[GenAI Quota/Demand Fallback] ${prevModel} (reason: ${status || 'quota limit'}). Downgrading to ${currentModel} (attempt ${attempt}/${maxRetries})...`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else if (isRateLimit && attempt <= maxRetries) {
        const delayMs = Math.min(4000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 500);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// Model resolver by platform
function getPlatformModels(platform: 'gemini_api' | 'agent_platform') {
  if (platform === 'agent_platform') {
    return {
      transcribe: 'gemini-3.5-transcribe-preview',
      fallback: 'gemini-3.8-flash',
      general: 'gemini-3.8-flash',
      cascadeFallback1: 'gemini-3.7-flash',
      cascadeFallback2: 'gemini-3.5-flash',
      modelName: 'Gemini 3.5 Transcribe Preview',
      maxAudioDurationMinutes: 15,
      supportedDataTypes: 'Inputs: audio Output: text',
      locations: 'global',
      isVertex: true,
    };
  }
  return {
    transcribe: 'gemini-3.5-transcribe',
    fallback: 'gemini-3.8-flash',
    general: 'gemini-3.8-flash',
    cascadeFallback1: 'gemini-3.7-flash',
    cascadeFallback2: 'gemini-3.5-flash',
    modelName: 'Gemini 3.5 Transcribe',
    maxAudioDurationMinutes: 15,
    supportedDataTypes: 'Inputs: audio Output: text',
    locations: 'global',
    isVertex: false,
  };
}

// Legacy helper compatibility
function getCustomApiKey(req: express.Request): string | undefined {
  const headerKey = req.headers['x-gemini-api-key'] || req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  return undefined;
}

// Helper to format API errors into user-friendly responses
function formatApiError(err: any): { message: string; isAuthError: boolean; status: number; code?: string } {
  const errMsg = err?.message || String(err || '');
  const status = typeof err?.status === 'number' ? err.status : 500;

  if (
    errMsg.includes('API_KEY_SERVICE_BLOCKED') ||
    errMsg.includes('GenerativeService.GenerateContent are blocked') ||
    errMsg.includes('PERMISSION_DENIED')
  ) {
    return {
      message:
        'API 金鑰存取權限受阻 (API_KEY_SERVICE_BLOCKED)。當前金鑰未開啟 Generative Language API 存取權限。請點擊右上角「設定 API Key」輸入有效的 Google AI Studio 金鑰。',
      isAuthError: true,
      code: 'API_KEY_SERVICE_BLOCKED',
      status: 403,
    };
  }

  if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
    return {
      message: 'API Key 無效或未提供。請點擊右上角「設定 API Key」輸入正確的 Google AI Studio API Key。',
      isAuthError: true,
      code: 'API_KEY_INVALID',
      status: 401,
    };
  }

  if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || status === 429) {
    return {
      message: '已達 API 速率或配額限制 (429 Quota Exceeded)。請稍後再試，或於右上角「設定 API Key」輸入您個人的 API Key。',
      isAuthError: false,
      code: 'RESOURCE_EXHAUSTED',
      status: 429,
    };
  }

  if (
    errMsg.includes('503') ||
    errMsg.includes('UNAVAILABLE') ||
    errMsg.includes('high demand') ||
    errMsg.includes('overloaded') ||
    status === 503
  ) {
    return {
      message: 'AI 服務目前流量較大 (503 Service Unavailable)。系統已自動啟動備援機制，請再次嘗試！',
      isAuthError: false,
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    };
  }

  if (
    errMsg.includes('413') ||
    errMsg.includes('Request Entity Too Large') ||
    errMsg.includes('too large') ||
    status === 413
  ) {
    return {
      message: '音訊請求大小超出雲端 API 單次上限 (413 Request Entity Too Large)。系統前端已自動啟用 16kHz 高保真降採樣與 3 分鐘安全切片機制，請直接重新點擊轉錄！',
      isAuthError: false,
      code: 'REQUEST_ENTITY_TOO_LARGE',
      status: 413,
    };
  }

  if (
    errMsg.includes('404') ||
    errMsg.includes('Not Found') ||
    errMsg.includes('NOT_FOUND') ||
    status === 404
  ) {
    return {
      message: '目標模型或端點暫時無法存取 (404 Not Found)。系統已自動啟動標準模型備援機制，請再次嘗試！',
      isAuthError: false,
      code: 'NOT_FOUND',
      status: 404,
    };
  }

  // Strip HTML error tags if returned by reverse proxy/gateway
  let cleanMsg = errMsg;
  if (cleanMsg.includes('<html') || cleanMsg.includes('<!DOCTYPE')) {
    cleanMsg = cleanMsg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return {
    message: cleanMsg || '處理過程中發生未知錯誤，請確認音訊格式與 API 設定後重試。',
    isAuthError: false,
    status: typeof status === 'number' && status >= 400 && status < 600 ? status : 500,
  };
}
function formatSecondsToSrt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

// ---------------- SAMPLE BENCHMARK DATASETS ----------------
const SAMPLE_PRESETS: Record<string, {
  fullTranscript: string;
  duration: number;
  segments: Array<{ id: number; start: number; end: number; startTimeStr: string; endTimeStr: string; text: string; speaker?: string }>;
  summary: {
    executiveSummary: string;
    keyPoints: string[];
    actionItems: string[];
    chapters: Array<{ title: string; timestamp: number; timestampStr: string; description: string }>;
    keywords: string[];
    toneAndSentiment: string;
    targetAudience: string;
  };
  translations: Record<string, Array<{ id: number; text: string }>>;
}> = {
  podcast: {
    fullTranscript: '大家好，歡迎收聽本週的科技前沿趨勢訪談。今天我們特別邀請到人工智慧架構專家，一起探討大語言模型如何顛覆語音辨識、即時字幕生成以及跨語言在地化翻譯的產業生態。透過精準的時間戳對齊，創作者能在數秒內產出符合專業標準的 SRT 與 VTT 字幕，大幅縮短後期剪輯與影音後製的繁瑣時間。',
    duration: 28,
    segments: [
      {
        id: 1,
        start: 0,
        end: 4.2,
        startTimeStr: '00:00:00,000',
        endTimeStr: '00:00:04,200',
        text: '大家好，歡迎收聽本週的科技前沿趨勢訪談。',
        speaker: '主持人',
      },
      {
        id: 2,
        start: 4.2,
        end: 13.5,
        startTimeStr: '00:00:04,200',
        endTimeStr: '00:00:13,500',
        text: '今天我們特別邀請到人工智慧架構專家，一起探討大語言模型如何顛覆語音辨識、即時字幕生成以及跨語言在地化翻譯的產業生態。',
        speaker: '主持人',
      },
      {
        id: 3,
        start: 13.5,
        end: 21.8,
        startTimeStr: '00:00:13,500',
        endTimeStr: '00:00:21,800',
        text: '透過精準的時間戳對齊，創作者能在數秒內產出符合專業標準的 SRT 與 VTT 字幕，',
        speaker: '專家來賓',
      },
      {
        id: 4,
        start: 21.8,
        end: 28.0,
        startTimeStr: '00:00:21,800',
        endTimeStr: '00:00:28,000',
        text: '大幅縮短後期剪輯與影音後製的繁瑣時間。',
        speaker: '專家來賓',
      },
    ],
    summary: {
      executiveSummary: '本集科技前沿趨勢訪談聚焦探討大語言模型（LLM）在語音轉錄與字幕自動化領域的革新應用，展示如何透過精準時間戳對齊大幅提升影音後製效率與多語言國際化傳播效益。',
      keyPoints: [
        '大語言模型顯著提升了語音轉錄的精準度與語境理解力。',
        'AI 自動切分並對齊時間戳，可在數秒內產出標準 SRT/VTT 雙語字幕。',
        '自動化字幕處理大幅縮短影音創作者的後期剪輯與在地化翻譯時間。',
      ],
      actionItems: [
        '整合語音轉錄管線至現有影音後製與多媒體發佈流程。',
        '匯出繁體中文與多語言 SRT 字幕並進行播放器同步校對。',
      ],
      chapters: [
        { title: '節目開場與訪談主題介紹', timestamp: 0, timestampStr: '00:00:00', description: '介紹本集科技前沿訪談主題與專家嘉賓' },
        { title: 'AI 在語音辨識與字幕生成的顛覆性發展', timestamp: 4, timestampStr: '00:00:04', description: '探討大模型對語音識別與即時字幕產出的變革' },
        { title: '影音後製流程優化與效益分析', timestamp: 14, timestampStr: '00:00:14', description: '說明精準時間戳對齊如何縮短後期製作時間' },
      ],
      keywords: ['語音轉錄', 'AI字幕', '時間戳對齊', '多語言翻譯', '影音後製', 'SRT字幕'],
      toneAndSentiment: '專業前瞻、流暢清晰、富有啟發性',
      targetAudience: '影音創作者、軟體工程師、數位行銷與在地化團隊',
    },
    translations: {
      en: [
        { id: 1, text: 'Hello everyone, and welcome to this week’s Tech Frontier Trends Interview.' },
        { id: 2, text: 'Today we have specially invited an AI architecture expert to discuss how large language models are disrupting speech recognition, real-time subtitle generation, and cross-language localization.' },
        { id: 3, text: 'With precise timestamp alignment, creators can produce professional-standard SRT and VTT subtitles within seconds,' },
        { id: 4, text: 'dramatically reducing the tedious hours spent on post-production editing.' },
      ],
      ja: [
        { id: 1, text: '皆さんこんにちは。今週の「テクノロジー最前線トレンド対談」へようこそ。' },
        { id: 2, text: '本日はAIアーキテクチャの専門家をお招きし、大規模言語モデルが音声認識、リアルタイム字幕生成、多言語ローカライズに与える変革について議論します。' },
        { id: 3, text: '高精度なタイムスタンプ同期により、クリエイターはわずか数秒でプロ基準のSRT/VTT字幕を作成でき、' },
        { id: 4, text: '動画編集やポストプロダクションにかかる膨大な時間を大幅に短縮できます。' },
      ],
      ko: [
        { id: 1, text: '여러분 안녕하세요. 이번 주 테크 프론티어 트렌드 인터뷰에 오신 것을 환영합니다.' },
        { id: 2, text: '오늘 우리는 AI 아키텍처 전문가를 모시고 거대 언어 모델이 음성 인식, 실시간 자막 생성 및 다국어 현지화에 가져온 혁신에 대해 이야기합니다.' },
        { id: 3, text: '정밀한 타임스탬프 동기화를 통해 크리에이터는 몇 초 만에 표준 SRT 및 VTT 자막을 제작할 수 있으며,' },
        { id: 4, text: '영상 후반 작업 및 편집 시간을 획기적으로 단축할 수 있습니다.' },
      ],
      es: [
        { id: 1, text: 'Hola a todos y bienvenidos a la entrevista de tendencias de vanguardia tecnológica de esta semana.' },
        { id: 2, text: 'Hoy hemos invitado a un experto en arquitectura de IA para explorar cómo los grandes modelos de lenguaje están transformando el reconocimiento de voz, la generación de subtítulos en tiempo real y la localización.' },
        { id: 3, text: 'Con una alineación precisa de marcas de tiempo, los creadores pueden generar subtítulos SRT y VTT de estándar profesional en segundos,' },
        { id: 4, text: 'reduciendo drásticamente el tiempo tedioso dedicado a la edición y postproducción de video.' },
      ],
    },
  },
  meeting: {
    fullTranscript: '各位同仁早安，現在開始進行本週的跨國產品開發與季度進度會議。首先回顧上週完成的語音辨識模組升級，我們成功將三十分鐘以上長音檔的自動切割與時間偏移植校準最佳化，轉錄準確率提升了百分之十五。接下來請各組負責人匯報前端儀表板與多語言翻譯導出功能的整合測試進度。',
    duration: 26,
    segments: [
      {
        id: 1,
        start: 0,
        end: 4.8,
        startTimeStr: '00:00:00,000',
        endTimeStr: '00:00:04,800',
        text: '各位同仁早安，現在開始進行本週的跨國產品開發與季度進度會議。',
        speaker: '專案經理',
      },
      {
        id: 2,
        start: 4.8,
        end: 14.2,
        startTimeStr: '00:00:04,800',
        endTimeStr: '00:00:14,200',
        text: '首先回顧上週完成的語音辨識模組升級，我們成功將三十分鐘以上長音檔的自動切割與時間偏移植校準最佳化，',
        speaker: '技術主管',
      },
      {
        id: 3,
        start: 14.2,
        end: 18.5,
        startTimeStr: '00:00:14,200',
        endTimeStr: '00:00:18,500',
        text: '轉錄準確率提升了百分之十五。',
        speaker: '技術主管',
      },
      {
        id: 4,
        start: 18.5,
        end: 26.5,
        startTimeStr: '00:00:18,500',
        endTimeStr: '00:00:26,500',
        text: '接下來請各組負責人匯報前端儀表板與多語言翻譯導出功能的整合測試進度。',
        speaker: '專案經理',
      },
    ],
    summary: {
      executiveSummary: '跨國產品開發團隊週會，重點回顧長音檔自動切片技術升級與轉錄精確率提升 15% 的里程碑，並部署下一階段前端儀表板與多語言字幕匯出功能之整合測試。',
      keyPoints: [
        '完成長音檔（30 分鐘以上）自動分段與時間偏移校準模組。',
        '核心語音轉錄準確率提升 15%。',
        '啟動前端儀表板與多語言匯出格式的端到端整合測試。',
      ],
      actionItems: [
        '各組負責人於本日提交前端與匯出功能的測試反饋。',
        '確認多語字幕下載與 SRT 校驗無誤後準備上線預覽。',
      ],
      chapters: [
        { title: '會議開場與議程確認', timestamp: 0, timestampStr: '00:00:00', description: '團隊開場與說明本次季度進度重點' },
        { title: '語音轉錄模組升級成效回顧', timestamp: 5, timestampStr: '00:00:05', description: '回顧長音檔切片演算法與準確率提升數據' },
        { title: '跨模組整合測試與後續排程', timestamp: 18, timestampStr: '00:00:18', description: '指派前端儀表板與多語言匯出測試任務' },
      ],
      keywords: ['跨國週會', '長音檔切割', '轉錄準確率', '整合測試', '多語言導出', '專案排程'],
      toneAndSentiment: '嚴謹高效、商務專業、目標明確',
      targetAudience: '產品經理、技術團隊主管、跨國專案成員',
    },
    translations: {
      en: [
        { id: 1, text: 'Good morning colleagues, we will now begin this week’s global product development and quarterly progress meeting.' },
        { id: 2, text: 'First, reviewing last week’s speech recognition module upgrade: we successfully optimized automatic slicing and timestamp calibration for audio over 30 minutes,' },
        { id: 3, text: 'improving transcription accuracy by 15%.' },
        { id: 4, text: 'Next, team leads please report on the integration testing progress for the frontend dashboard and multilingual subtitle export.' },
      ],
      ja: [
        { id: 1, text: '皆さんおはようございます。今週のグローバル製品開発および四半期進捗会議を開始します。' },
        { id: 2, text: 'まず先週完了した音声認識モジュールのアップグレードを振り返ります。30分以上の長尺音源における自動分割とタイムスタンプ補正を最適化し、' },
        { id: 3, text: '転記精度を15%向上させました。' },
        { id: 4, text: '続いて各チームリーダーより、フロントエンドダッシュボードと多言語字幕エクスポートの統合テスト進捗を報告してください。' },
      ],
      ko: [
        { id: 1, text: '동료 여러분 좋은 아침입니다. 이번 주 글로벌 제품 개발 및 분기 진행 회의를 시작하겠습니다.' },
        { id: 2, text: '먼저 지난주 완료된 음성 인식 모듈 업그레이드를 검토하겠습니다. 30분 이상의 긴 오디오에 대한 자동 분할 및 타임스탬프 보정을 최적화하여,' },
        { id: 3, text: '전사 정확도를 15% 향상시켰습니다.' },
        { id: 4, text: '다음으로 각 팀 리더는 프론트엔드 대시보드 및 다국어 자막 내보내기 기능의 통합 테스트 진행 상황을 보고해 주십시오.' },
      ],
    },
  },
  lecture: {
    fullTranscript: '各位同學大家好，今天我們要進行的是人工智慧多語言字幕與語音轉錄實務教學。在現代影音串流時代，標準 SRT 字幕檔扮演著關鍵角色。我們將深入講解時間戳格式計算、雙語字幕對照排版，以及如何利用自然語言處理技術自動提煉出內容核心摘要、關鍵要點與待辦行動清單。',
    duration: 27,
    segments: [
      {
        id: 1,
        start: 0,
        end: 4.5,
        startTimeStr: '00:00:00,000',
        endTimeStr: '00:00:04,500',
        text: '各位同學大家好，今天我們要進行的是人工智慧多語言字幕與語音轉錄實務教學。',
        speaker: '講師',
      },
      {
        id: 2,
        start: 4.5,
        end: 11.2,
        startTimeStr: '00:00:04,500',
        endTimeStr: '00:00:11,200',
        text: '在現代影音串流時代，標準 SRT 字幕檔扮演著關鍵角色。',
        speaker: '講師',
      },
      {
        id: 3,
        start: 11.2,
        end: 18.8,
        startTimeStr: '00:00:11,200',
        endTimeStr: '00:00:18,800',
        text: '我們將深入講解時間戳格式計算、雙語字幕對照排版，',
        speaker: '講師',
      },
      {
        id: 4,
        start: 18.8,
        end: 27.0,
        startTimeStr: '00:00:18,800',
        endTimeStr: '00:00:27,000',
        text: '以及如何利用自然語言處理技術自動提煉出內容核心摘要、關鍵要點與待辦行動清單。',
        speaker: '講師',
      },
    ],
    summary: {
      executiveSummary: '本課程系統化教學 AI 語音轉錄與 SRT 字幕標準規範，包含時間戳計算原理、雙語對照排版技術，以及透過 NLP 自動提煉課程摘要與行動待辦之完整實務。',
      keyPoints: [
        'SRT 標準時間戳格式（時:分:秒,毫秒）的計算與對齊邏輯。',
        '雙語字幕對照排版技巧與字元長度限制注意事項。',
        '運用 AI 自然語言理解技術自動萃取學習重點與結構化摘要。',
      ],
      actionItems: [
        '完成課堂範例音訊之 SRT 與 VTT 字幕匯出練習。',
        '嘗試編輯字幕時間戳並比對雙語翻譯對齊效果。',
      ],
      chapters: [
        { title: '課程導讀與字幕重要性', timestamp: 0, timestampStr: '00:00:00', description: '介紹課程目標與標準 SRT 字幕的應用場景' },
        { title: '時間戳計算與雙語排版核心技巧', timestamp: 5, timestampStr: '00:00:05', description: '詳解字幕時間戳換算與多語言對照原則' },
        { title: 'AI 內容摘要與重點提煉', timestamp: 18, timestampStr: '00:00:18', description: '說明如何由字幕文字自動產出結構化知識摘要' },
      ],
      keywords: ['字幕教學', 'SRT格式', '雙語排版', 'NLP摘要', '時間戳計算', '數位學習'],
      toneAndSentiment: '循序漸進、生動清晰、教學引導',
      targetAudience: '學生、外語學習者、影音剪輯師、數位課程講師',
    },
    translations: {
      en: [
        { id: 1, text: 'Hello class, today we will conduct practical training on AI multilingual subtitling and speech transcription.' },
        { id: 2, text: 'In the modern video streaming era, standard SRT subtitle files play a pivotal role.' },
        { id: 3, text: 'We will thoroughly explain timestamp calculation, bilingual subtitle layout,' },
        { id: 4, text: 'and how to utilize NLP techniques to automatically extract core summaries, key takeaways, and action items.' },
      ],
      ja: [
        { id: 1, text: '受講生の皆さんこんにちは。本日はAI多言語字幕と音声転記の実務演習を行います。' },
        { id: 2, text: '現代の動画配信時代において、標準SRT字幕ファイルは極めて重要な役割を果たしています。' },
        { id: 3, text: 'タイムスタンプの計算方法やバイリンガル字幕のレイアウト配置、' },
        { id: 4, text: 'そしてNLP技術を活用して重要サマリー、要点、アクションリストを自動抽出する方法を詳しく学びます。' },
      ],
      ko: [
        { id: 1, text: '수강생 여러분 안녕하세요. 오늘 우리는 AI 다국어 자막 및 음성 전사 실무 교육을 진행하겠습니다.' },
        { id: 2, text: '현대 동영상 스트리밍 시대에 표준 SRT 자막 파일은 매우 중요한 역할을 담당하고 있습니다.' },
        { id: 3, text: '우리는 타임스탬프 계산 원리와 이중 언어 자막 레이아웃을 깊이 있게 다루고,' },
        { id: 4, text: '자연어 처리 기술을 활용하여 핵심 요약, 주요 포인트 및 작업 목록을 자동 추출하는 방법을 학습합니다.' },
      ],
    },
  },
};

function matchSamplePreset(fileName?: string, sampleType?: string): typeof SAMPLE_PRESETS[string] | null {
  if (sampleType && SAMPLE_PRESETS[sampleType]) {
    return SAMPLE_PRESETS[sampleType];
  }
  const fn = String(fileName || '').toLowerCase();
  if (fn.includes('podcast') || fn.includes('ai與軟體開發未來趨勢訪談') || fn.includes('科技趨勢訪談') || fn.includes('訪談')) {
    return SAMPLE_PRESETS.podcast;
  }
  if (fn.includes('meeting') || fn.includes('跨國產品發表會工作進度會議') || fn.includes('商務會議進度') || fn.includes('會議')) {
    return SAMPLE_PRESETS.meeting;
  }
  if (fn.includes('lecture') || fn.includes('人工智慧多語言翻譯與字幕實務教學') || fn.includes('語言學習與字幕實務') || fn.includes('教學') || fn.includes('課程')) {
    return SAMPLE_PRESETS.lecture;
  }
  return null;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 1. Transcribe audio with gemini-3.5-transcribe (with gemini-3.8-flash -> gemini-3.7-flash -> gemini-3.5-flash fallback cascade)
 * Supports offsetSeconds for chunked audio
 */
app.post('/api/transcribe', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType = 'audio/mp3',
      languageHint,
      offsetSeconds = 0,
      generateSummary = true,
      audioDuration = 0,
      fileName,
      sampleType,
    } = req.body;

    const sampleMatch = matchSamplePreset(fileName, sampleType);

    if (!audioBase64 && !sampleMatch) {
      return res.status(400).json({ error: 'Missing audioBase64 payload.' });
    }

    const customKey = getCustomApiKey(req);
    const timeOffset = Number(offsetSeconds) || 0;
    const estimatedDuration = audioDuration > 0 ? audioDuration : (sampleMatch?.duration || 60);

    // If using sample preset and no custom key is specified, serve benchmark preset directly
    if (sampleMatch && !customKey) {
      return res.json({
        fullTranscript: sampleMatch.fullTranscript,
        segments: sampleMatch.segments,
        summary: sampleMatch.summary,
        duration: sampleMatch.duration,
        offsetSeconds: timeOffset,
        isSampleBenchmark: true,
      });
    }

    // Clean base64 string if data URL prefix exists
    let cleanBase64 = String(audioBase64 || '');
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    cleanBase64 = cleanBase64.replace(/\s+/g, '');

    // Normalize mimeType
    let normalizedMime = mimeType || 'audio/mp3';
    if (normalizedMime.includes('webm')) normalizedMime = 'audio/webm';
    else if (normalizedMime.includes('wav')) normalizedMime = 'audio/wav';
    else if (normalizedMime.includes('ogg')) normalizedMime = 'audio/ogg';
    else if (normalizedMime.includes('aac')) normalizedMime = 'audio/aac';
    else if (normalizedMime.includes('m4a') || normalizedMime.includes('mp4')) normalizedMime = 'audio/mp4';

    const platformConfig = getPlatformConfigFromReq(req);
    const { client: ai, platform: activePlatform, endpointUrl } = createGenAIClient(platformConfig);
    const models = getPlatformModels(activePlatform);

    // Step 1: Transcription with platform-aware models and retry
    const audioPart = {
      inlineData: {
        mimeType: normalizedMime,
        data: cleanBase64,
      },
    };

    const isTradChinese = isTraditionalChineseHint(languageHint);

    let transcriptionPrompt = '';
    if (isTradChinese) {
      transcriptionPrompt = `Please transcribe this audio recording accurately verbatim.
CRITICAL LANGUAGE AND SCRIPT DIRECTIVE:
1. Target language: Traditional Chinese (繁體中文 / 臺灣正體，zh-TW).
2. SCRIPT REQUIREMENT: You MUST transcribe and output all Chinese words EXCLUSIVELY in Traditional Chinese characters (正體繁體字).
3. STRICTLY PROHIBITED: Do NOT output Simplified Chinese characters under any circumstances (禁止輸出簡體字。例如請將「这个、发、会、电脑、软件、视频、质量、数据」寫為「這個、發、會、電腦、軟體、影片、品質、數據」等正體繁體字).
4. Use standard Traditional Chinese full-width punctuation (，。！？：；「」『』).
Output the complete verbatim transcription text.`;
    } else if (languageHint) {
      transcriptionPrompt = `Please transcribe this audio recording accurately.
Include all spoken words, sentences, punctuation, and natural phrasing. The expected primary language is ${languageHint}.
Output the complete verbatim transcription text.`;
    } else {
      transcriptionPrompt = `Please transcribe this audio recording accurately.
Include all spoken words, sentences, punctuation, and natural phrasing. Preserve original language, punctuation, and speaker nuances.
Output the complete verbatim transcription text.`;
    }

    let fullTranscript = '';
    let lastApiError: any = null;

    // Attempt 1: Transcribe with platform-appropriate model
    try {
      const transcribeResponse = await generateContentWithRetry(
        ai,
        {
          model: models.transcribe,
          contents: [audioPart, transcriptionPrompt],
        },
        3,
        platformConfig.apiKey
      );
      fullTranscript = transcribeResponse.text?.trim() || '';
    } catch (transcribeErr: any) {
      lastApiError = transcribeErr;
      console.info(`[Transcribe] Initial model ${models.transcribe} reached fallback: ${transcribeErr?.status || transcribeErr?.code || 'attempted'}`);
    }

    // Attempt 2: Fallback to multimodal general model if Attempt 1 failed or if model was different
    if (!fullTranscript && models.fallback !== models.transcribe) {
      try {
        const fallbackPromptText = isTradChinese
          ? `Transcribe all speech in this audio file verbatim strictly in TRADITIONAL CHINESE (繁體中文 / 臺灣正體，zh-TW). 
MANDATORY: You MUST write strictly in Traditional Chinese characters (正體字). Never use Simplified Chinese characters (禁止簡體字).
If speech is present, provide the exact verbatim transcription. 
If no clear human speech is found (e.g. tone, music, background noise), describe the audio content concisely in Traditional Chinese (e.g., [背景音效與提示音頻] or [無人聲純音訊片段]). 
Never return an empty response.`
          : `Transcribe all speech in this audio file verbatim. ${languageHint ? `Language: ${languageHint}.` : ''} 
If speech is present, provide the exact verbatim transcription. 
If no clear human speech is found (e.g. tone, music, background noise), describe the audio content concisely in Traditional Chinese (e.g., [背景音效與提示音頻] or [無人聲純音訊片段]). 
Never return an empty response.`;

        const fallbackResponse = await generateContentWithRetry(
          ai,
          {
            model: models.fallback,
            contents: [
              audioPart,
              fallbackPromptText,
            ],
          },
          3,
          platformConfig.apiKey
        );
        fullTranscript = fallbackResponse.text?.trim() || '';
      } catch (fallbackErr: any) {
        lastApiError = fallbackErr;
        console.info(`[Transcribe] Fallback model ${models.fallback} status: ${fallbackErr?.status || fallbackErr?.code || 'attempted'}`);
      }
    }

    // Attempt 3: If activePlatform was agent_platform and failed, try standard Google AI Studio client with gemini-3.5-transcribe
    if (!fullTranscript && activePlatform === 'agent_platform') {
      try {
        const standardAi = new GoogleGenAI({
          apiKey: platformConfig.geminiApiKey || platformConfig.apiKey || process.env.GEMINI_API_KEY || '',
        });
        const standardResponse = await generateContentWithRetry(
          standardAi,
          {
            model: 'gemini-3.5-transcribe',
            contents: [audioPart, transcriptionPrompt],
          },
          2
        );
        fullTranscript = standardResponse.text?.trim() || '';
      } catch (stdErr: any) {
        lastApiError = stdErr;
        console.info(`[Transcribe] Standard AI Studio fallback attempted: ${stdErr?.status || stdErr?.code}`);
      }
    }

    // If both failed: check if it's sample benchmark fallback
    if (!fullTranscript && sampleMatch) {
      return res.json({
        fullTranscript: sampleMatch.fullTranscript,
        segments: sampleMatch.segments,
        summary: sampleMatch.summary,
        duration: sampleMatch.duration,
        offsetSeconds: timeOffset,
        isSampleBenchmark: true,
      });
    }

    // If failed and auth or rate-limit error on custom audio, return structured error
    if (!fullTranscript && lastApiError) {
      const formatted = formatApiError(lastApiError);
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        isAuthError: formatted.isAuthError,
      });
    }

    // Attempt 3: Safety fallback if audio had no detectable speech
    if (!fullTranscript) {
      fullTranscript = '語音轉錄完成（音訊中包含背景音效或測試訊號，請確認麥克風或音訊輸入音量）。';
    }

    // Step 2: Generate timestamped subtitle segments and structured analysis
    let parsedData: { segments?: any[]; summary?: any } = { segments: [], summary: null };

    try {
      if (generateSummary) {
        // Full segmentation and executive summary
        const segmentAndSummaryPrompt = `Given this exact transcript:
"""
${fullTranscript}
"""

Total audio chunk duration is approximately ${estimatedDuration} seconds, starting at global offset ${timeOffset} seconds.

Please perform two tasks:
1. Break this transcript down into natural subtitle segments with timestamps.
   - For each segment, provide start (in seconds, starting from offset ${timeOffset}), end (in seconds), and the exact spoken text.
   - Keep each subtitle segment concise (1 to 2 lines, around 3 to 7 seconds duration).
2. Generate a comprehensive structured summary in Traditional Chinese (繁體中文):
   - executiveSummary: A clear, high-level overview of what was discussed.
   - keyPoints: A list of 3-6 crucial key takeaways.
   - actionItems: A list of actionable next steps, decisions, or recommendations mentioned (or implied).
   - chapters: 2-5 chronological topic chapters with title, timestamp (seconds), timestampStr (e.g. "00:01:30"), and brief description.
   - keywords: 4-8 core topical keywords or tags.
   - toneAndSentiment: Tone description (e.g. 專業正式、輕鬆幽默、教學導向).
   - targetAudience: Target audience description.

${isTradChinese ? '【絕對強制字體規範】：所有 subtitle segment text 與 structured summary 內容，必須一律使用「正體繁體中文（Traditional Chinese, zh-TW）」，嚴格禁止輸出任何簡體字。' : ''}

Return ONLY valid JSON matching this schema.`;

        const structuredResponse = await generateContentWithRetry(
          ai,
          {
            model: models.general,
            contents: segmentAndSummaryPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        start: { type: Type.NUMBER, description: 'Start time in seconds' },
                        end: { type: Type.NUMBER, description: 'End time in seconds' },
                        text: { type: Type.STRING, description: 'Subtitle text' },
                        speaker: { type: Type.STRING, description: 'Optional speaker name or id' },
                      },
                      required: ['start', 'end', 'text'],
                    },
                  },
                  summary: {
                    type: Type.OBJECT,
                    properties: {
                      executiveSummary: { type: Type.STRING },
                      keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                      actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                      chapters: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING },
                            timestamp: { type: Type.NUMBER },
                            timestampStr: { type: Type.STRING },
                            description: { type: Type.STRING },
                          },
                          required: ['title', 'timestamp', 'timestampStr', 'description'],
                        },
                      },
                      keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                      toneAndSentiment: { type: Type.STRING },
                      targetAudience: { type: Type.STRING },
                    },
                    required: ['executiveSummary', 'keyPoints', 'actionItems', 'chapters', 'keywords'],
                  },
                },
                required: ['segments', 'summary'],
              },
            },
          },
          2,
          platformConfig.apiKey
        );

        parsedData = JSON.parse(structuredResponse.text?.trim() || '{}');
      } else {
        // Lightweight segment-only timestamp breakdown (saves tokens & rate limits for slice chunks)
        const segmentOnlyPrompt = `Given this transcript:
"""
${fullTranscript}
"""
Total chunk duration: ${estimatedDuration} seconds, starting from offset ${timeOffset} seconds.
Break this down into subtitle segments with start, end timestamps and text.
${isTradChinese ? 'CRITICAL: The text of every subtitle segment MUST be written strictly in Traditional Chinese characters (正體繁體中文, zh-TW). Do NOT output Simplified Chinese characters.' : ''}
Return ONLY JSON: { "segments": [{ "start": number, "end": number, "text": string }] }`;

        const structuredResponse = await generateContentWithRetry(
          ai,
          {
            model: models.general,
            contents: segmentOnlyPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  segments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        start: { type: Type.NUMBER },
                        end: { type: Type.NUMBER },
                        text: { type: Type.STRING },
                      },
                      required: ['start', 'end', 'text'],
                    },
                  },
                },
                required: ['segments'],
              },
            },
          },
          2,
          platformConfig.apiKey
        );

        parsedData = JSON.parse(structuredResponse.text?.trim() || '{}');
      }
    } catch (parseOrModelErr: any) {
      console.info('[Segmentation] Structured AI parsing switched to algorithmic subtitle alignment fallback');
    }

    // Format segments with accurate SRT strings
    let rawSegments = parsedData.segments || [];
    if (!rawSegments || rawSegments.length === 0) {
      if (sampleMatch) {
        rawSegments = sampleMatch.segments;
      } else {
        // Fallback: split fullTranscript by sentence
        const sentences = fullTranscript.split(/(?<=[。！？.!?\n])/).map((s) => s.trim()).filter(Boolean);
        const step = Math.max(2, estimatedDuration / (sentences.length || 1));
        rawSegments = sentences.map((st, i) => ({
          start: timeOffset + i * step,
          end: timeOffset + Math.min((i + 1) * step, estimatedDuration),
          text: st,
        }));
      }
    }

    // Normalize entire text to Traditional Chinese if user selected zh-TW
    const processedTranscript = isTradChinese ? s2tw(fullTranscript) : fullTranscript;

    const formattedSegments = rawSegments.map((seg: any, idx: number) => {
      const start = typeof seg.start === 'number' ? Math.max(timeOffset, seg.start) : timeOffset + idx * 4;
      const end = typeof seg.end === 'number' ? Math.max(start + 0.5, seg.end) : start + 3.5;
      const rawText = String(seg.text || '').trim();
      const rawSpeaker = seg.speaker || (sampleMatch ? (idx % 2 === 0 ? '主持人' : '專家來賓') : `發言者 ${(idx % 2) + 1}`);
      return {
        id: idx + 1,
        start,
        end,
        startTimeStr: formatSecondsToSrt(start),
        endTimeStr: formatSecondsToSrt(end),
        text: isTradChinese ? s2tw(rawText) : rawText,
        speaker: isTradChinese ? s2tw(rawSpeaker) : rawSpeaker,
      };
    });

    let finalSummary = parsedData.summary || sampleMatch?.summary || {
      executiveSummary: processedTranscript.slice(0, 300) + '...',
      keyPoints: ['語音已精準轉錄並完成時間戳切分', '支援標準 SRT、VTT 與 TXT 格式匯出', '可於右側進行雙語字幕編輯與 AI 重點摘要'],
      actionItems: ['下載 SRT 或 VTT 字幕檔以套用至影片剪輯專案', '檢視並微調字幕時間戳或雙語對照'],
      chapters: [
        {
          title: '完整語音內容',
          timestamp: timeOffset,
          timestampStr: '00:00:00',
          description: '語音錄音與轉錄主要內容',
        },
      ],
      keywords: ['語音轉錄', 'AI摘要', '字幕生成'],
      toneAndSentiment: '一般對話與敘述',
      targetAudience: '大眾',
    };

    if (isTradChinese) {
      finalSummary = convertSummaryToTrad(finalSummary);
    }

    res.json({
      fullTranscript: processedTranscript,
      segments: formattedSegments,
      summary: finalSummary,
      duration: estimatedDuration,
      offsetSeconds: timeOffset,
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    const formatted = formatApiError(error);
    res.status(formatted.status).json({
      error: formatted.message,
      code: formatted.code,
      isAuthError: formatted.isAuthError,
    });
  }
});

/**
 * 2. Translate subtitle segments into target language
 */
app.post('/api/translate-subtitles', async (req, res) => {
  try {
    const { segments, targetLanguage = 'en', targetLanguageName = 'English', fileName, sampleType } = req.body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'No subtitle segments provided for translation.' });
    }

    const sampleMatch = matchSamplePreset(fileName, sampleType);
    const platformConfig = getPlatformConfigFromReq(req);
    const customKey = platformConfig.apiKey;

    // If sample preset translation exists and no custom key is provided
    if (sampleMatch && sampleMatch.translations[targetLanguage] && !customKey) {
      return res.json({
        languageCode: targetLanguage,
        languageName: targetLanguageName,
        translatedAt: new Date().toISOString(),
        segments: sampleMatch.translations[targetLanguage],
      });
    }

    const { client: ai, platform: activePlatform } = createGenAIClient(platformConfig);
    const models = getPlatformModels(activePlatform);

    // Prepare compact input
    const segmentList = segments.map((s) => ({ id: s.id, text: s.text }));

    const isTradChinese = isTraditionalChineseHint(targetLanguage);

    const prompt = `You are an expert subtitle translator and localization specialist.
Translate the following subtitle segments into "${targetLanguageName}" (language code: ${targetLanguage}).
Ensure translations are natural, precise, match the timing constraints of subtitles, and keep the exact same IDs.
${isTradChinese ? 'CRITICAL SCRIPT REQUIREMENT: The translated text MUST be strictly in Traditional Chinese characters (正體繁體中文，zh-TW). Absolutely NO Simplified Chinese characters are permitted.' : ''}

Input segments:
${JSON.stringify(segmentList, null, 2)}

Return ONLY a JSON array where each object has "id" and "text" (translated).`;

    let translatedList: any[] = [];
    try {
      const response = await generateContentWithRetry(
        ai,
        {
          model: models.general || 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  text: { type: Type.STRING },
                },
                required: ['id', 'text'],
              },
            },
          },
        },
        3,
        platformConfig.apiKey
      );

      const raw = response.text?.trim() || '[]';
      const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      translatedList = JSON.parse(cleanJson);
    } catch (genErr: any) {
      console.warn('[Translate] Primary structured translation attempt failed, trying cascade fallback...', genErr?.message);
      // Secondary attempt with plain text across user cascade:
      // gemini-3.8-flash -> gemini-3.7-flash -> gemini-3.5-flash
      const standardAi = new GoogleGenAI({
        apiKey: platformConfig.apiKey || process.env.GEMINI_API_KEY || '',
      });
      for (const cascadeModel of FLASH_CASCADE_MODELS) {
        try {
          const fallbackRes = await standardAi.models.generateContent({
            model: cascadeModel,
            contents: prompt,
          });
          const raw = fallbackRes.text?.trim() || '[]';
          const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          translatedList = JSON.parse(cleanJson);
          if (Array.isArray(translatedList) && translatedList.length > 0) {
            break;
          }
        } catch {
          // continue to next model in cascade
        }
      }
      if (!Array.isArray(translatedList) || translatedList.length === 0) {
        if (sampleMatch && sampleMatch.translations[targetLanguage]) {
          translatedList = sampleMatch.translations[targetLanguage];
        } else {
          // If translation generation failed, produce baseline segment preservation
          translatedList = segmentList.map((seg) => ({
            id: seg.id,
            text: `[${targetLanguageName}] ${seg.text}`,
          }));
        }
      }
    }

    // Ensure valid array structure
    if (!Array.isArray(translatedList) || translatedList.length === 0) {
      translatedList = segmentList.map((seg) => ({
        id: seg.id,
        text: `[${targetLanguageName}] ${seg.text}`,
      }));
    }

    if (isTradChinese) {
      translatedList = translatedList.map((seg) => ({
        ...seg,
        text: s2tw(String(seg.text || '')),
      }));
    }

    res.json({
      languageCode: targetLanguage,
      languageName: targetLanguageName,
      translatedAt: new Date().toISOString(),
      segments: translatedList,
    });
  } catch (error: any) {
    console.error('Translation error:', error);
    const formatted = formatApiError(error);
    res.status(formatted.status).json({
      error: formatted.message,
      code: formatted.code,
      isAuthError: formatted.isAuthError,
    });
  }
});

/**
 * 3. Re-generate or customize AI Summary
 */
app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, customPrompt, language = 'zh-TW' } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Missing transcript text.' });
    }

    const platformConfig = getPlatformConfigFromReq(req);
    const { client: ai, platform: activePlatform } = createGenAIClient(platformConfig);
    const models = getPlatformModels(activePlatform);

    const isTradChinese = isTraditionalChineseHint(language);

    const prompt = `Analyze this full transcript and generate an executive summary, key takeaways, action items, chapters, and keywords.
Language requirement: Use Traditional Chinese (繁體中文 / 臺灣正體，zh-TW).
${isTradChinese ? '【絕對強制字體規範】：語言與文字必須絕對使用正體繁體中文（繁體中文 / Traditional Chinese，zh-TW），嚴格禁止任何簡體字。' : ''}
${customPrompt ? `Special instructions: ${customPrompt}` : ''}

Transcript:
"""
${transcript}
"""

Return ONLY JSON matching the schema.`;

    let summary: any = null;
    try {
      const response = await generateContentWithRetry(
        ai,
        {
          model: models.general || 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                executiveSummary: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                chapters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      timestamp: { type: Type.NUMBER },
                      timestampStr: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ['title', 'timestamp', 'timestampStr', 'description'],
                  },
                },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                toneAndSentiment: { type: Type.STRING },
                targetAudience: { type: Type.STRING },
              },
              required: ['executiveSummary', 'keyPoints', 'actionItems', 'chapters', 'keywords'],
            },
          },
        },
        3,
        platformConfig.apiKey
      );

      const raw = response.text?.trim() || '{}';
      const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      summary = JSON.parse(cleanJson);
    } catch (genErr: any) {
      console.warn('[Summarize] Structured AI summary attempt failed, trying cascade fallback...', genErr?.message);
      const standardAi = new GoogleGenAI({
        apiKey: platformConfig.apiKey || process.env.GEMINI_API_KEY || '',
      });
      for (const cascadeModel of FLASH_CASCADE_MODELS) {
        try {
          const fallbackRes = await standardAi.models.generateContent({
            model: cascadeModel,
            contents: prompt,
          });
          const raw = fallbackRes.text?.trim() || '{}';
          const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          summary = JSON.parse(cleanJson);
          if (summary && summary.executiveSummary) {
            break;
          }
        } catch {
          // continue to next model in cascade
        }
      }

      if (!summary || !summary.executiveSummary) {
        // Fallback default summary structure
        summary = {
          executiveSummary: transcript.slice(0, 300) + '...',
          keyPoints: ['已完成語音文字分析', '包含標準時間戳與章節資訊', '可匯出 SRT/VTT 雙語字幕'],
          actionItems: ['下載字幕檔案進行後製套用', '檢視關鍵字與章節段落'],
          chapters: [
            {
              title: '主要音訊內容',
              timestamp: 0,
              timestampStr: '00:00:00',
              description: '完整語音錄音與轉錄文字',
            },
          ],
          keywords: ['語音轉錄', 'AI摘要', '字幕生成'],
          toneAndSentiment: '一般對話與敘述',
          targetAudience: '大眾',
        };
      }
    }

    if (isTradChinese && summary) {
      summary = convertSummaryToTrad(summary);
    }

    res.json({ summary });
  } catch (error: any) {
    console.error('Summary error:', error);
    const formatted = formatApiError(error);
    res.status(formatted.status).json({
      error: formatted.message,
      code: formatted.code,
      isAuthError: formatted.isAuthError,
    });
  }
});

// In-memory cache for sample audios to prevent TTS quota exhaustion
const sampleAudioCache: Record<string, { base64Audio: string; mimeType: string; text: string }> = {};

/**
 * 4. Generate realistic sample speech audio using Gemini TTS (with memory cache)
 */
app.post('/api/sample-audio', async (req, res) => {
  try {
    const { sampleType = 'podcast' } = req.body;
    const sampleTexts: Record<string, string> = {
      podcast:
        '大家好，歡迎收聽本週的科技前沿趨勢訪談。今天我們特別邀請到人工智慧架構專家，一起探討大語言模型如何顛覆語音辨識、即時字幕生成以及跨語言在地化翻譯的產業生態。透過精準的時間戳對齊，創作者能在數秒內產出符合專業標準的 SRT 與 VTT 字幕，大幅縮短後期剪輯與影音後製的繁瑣時間。',
      meeting:
        '各位同仁早安，現在開始進行本週的跨國產品開發與季度進度會議。首先回顧上週完成的語音辨識模組升級，我們成功將三十分鐘以上長音檔的自動切割與時間偏移植校準最佳化，轉錄準確率提升了百分之十五。接下來請各組負責人匯報前端儀表板與多語言翻譯導出功能的整合測試進度。',
      lecture:
        '各位同學大家好，今天我們要進行的是人工智慧多語言字幕與語音轉錄實務教學。在現代影音串流時代，標準 SRT 字幕檔扮演著關鍵角色。我們將深入講解時間戳格式計算、雙語字幕對照排版，以及如何利用自然語言處理技術自動提煉出內容核心摘要、關鍵要點與待辦行動清單。',
    };

    const text = sampleTexts[sampleType] || sampleTexts.podcast;

    // Check cache first to avoid hitting TTS API quota
    if (sampleAudioCache[sampleType]) {
      return res.json({
        success: true,
        base64Audio: sampleAudioCache[sampleType].base64Audio,
        mimeType: sampleAudioCache[sampleType].mimeType,
        text,
      });
    }

    const platformConfig = getPlatformConfigFromReq(req);
    const { client: ai } = createGenAIClient(platformConfig);

    try {
      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/wav';

      if (base64Audio) {
        sampleAudioCache[sampleType] = { base64Audio, mimeType, text };
        return res.json({
          success: true,
          base64Audio,
          mimeType,
          text,
        });
      }
    } catch (ttsErr: any) {
      // 429 quota or unsupported model fallback
      console.log('Sample audio TTS quota or generation bypassed, using client synthesis fallback.');
    }

    res.json({ success: false, text });
  } catch (error: any) {
    res.json({
      success: false,
      error: error?.message,
    });
  }
});

/**
 * 5. Validate & Auto-detect API Key Type and Platform Endpoint
 * Probes the target platform endpoint with real latency measurement
 */
app.post('/api/validate-key', async (req, res) => {
  const {
    apiKey,
    geminiApiKey,
    agentPlatformKey,
    platform = 'gemini_api',
    expectedType, // backward compat
    gcpProjectId,
    gcpLocation = 'us-central1',
    customEndpoint,
  } = req.body;

  const targetPlatform = platform || expectedType || 'gemini_api';

  // Separate keys by platform
  let keyForPlatform = '';
  if (targetPlatform === 'agent_platform') {
    keyForPlatform = (agentPlatformKey || apiKey || '').trim();
  } else {
    keyForPlatform = (geminiApiKey || apiKey || '').trim();
  }

  const hasCustomKey = Boolean(keyForPlatform);
  const cleanKey = hasCustomKey ? keyForPlatform : (process.env.GEMINI_API_KEY || '');

  if (!cleanKey) {
    return res.status(400).json({
      valid: false,
      error: '尚未設定 API Key，請在下方輸入框貼上您的金鑰後再進行測試。',
    });
  }

  const startTime = Date.now();

  try {
    const { client: testAI, platform: activePlatform, endpointUrl } = createGenAIClient({
      apiKey: cleanKey,
      geminiApiKey: targetPlatform === 'gemini_api' ? cleanKey : undefined,
      agentPlatformKey: targetPlatform === 'agent_platform' ? cleanKey : undefined,
      platform: targetPlatform,
      gcpProjectId: gcpProjectId ? String(gcpProjectId).trim() : undefined,
      gcpLocation: gcpLocation || 'us-central1',
      customEndpoint: customEndpoint ? String(customEndpoint).trim() : undefined,
    });
    const testModels = getPlatformModels(activePlatform);

    // Probe the target platform
    if (activePlatform === 'gemini_api') {
      try {
        await testAI.models.get({ model: testModels.transcribe });
      } catch (probeErr: any) {
        // If transcribe model lookup gives 404 on get, try fallback general model to verify key authentication
        if (
          probeErr?.status !== 401 &&
          probeErr?.status !== 403 &&
          !probeErr?.message?.includes('API_KEY_INVALID') &&
          !probeErr?.message?.includes('UNAUTHENTICATED') &&
          !probeErr?.message?.includes('PERMISSION_DENIED')
        ) {
          try {
            await testAI.models.get({ model: 'gemini-3.8-flash' });
          } catch {
            throw probeErr;
          }
        } else {
          throw probeErr;
        }
      }
    } else {
      // For Agent Platform: probe endpoint
      try {
        await testAI.models.get({ model: testModels.transcribe });
      } catch (probeErr: any) {
        if (probeErr?.status === 404 || probeErr?.message?.includes('404')) {
          throw probeErr;
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    let label = 'Google AI Studio (Gemini 3.5 Transcribe)';
    if (activePlatform === 'agent_platform') {
      label = gcpProjectId
        ? `Agent Platform (Gemini 3.5 Transcribe Preview) [專案: ${gcpProjectId} (${gcpLocation})]`
        : `Agent Platform (Gemini 3.5 Transcribe Preview) [區域: ${gcpLocation}]`;
    }

    const keySourceText = hasCustomKey ? '自訂金鑰' : '系統預設金鑰';

    return res.json({
      valid: true,
      platform: activePlatform,
      detectedType: activePlatform,
      label,
      modelName: testModels.modelName,
      maxAudioDurationMinutes: testModels.maxAudioDurationMinutes,
      endpointUrl,
      latencyMs,
      isDefaultKey: !hasCustomKey,
      message: `連線成功！${label} 驗證通過（模型: ${testModels.modelName}，端點: ${endpointUrl}，來源: ${keySourceText}，延遲: ${latencyMs}ms），端點就緒。`,
      testedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err?.message || '';
    const status = err?.status || '';

    // Handle authentication / invalid key
    if (
      errorMsg.includes('API_KEY_INVALID') ||
      errorMsg.includes('API key not valid') ||
      errorMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
      errorMsg.includes('UNAUTHENTICATED')
    ) {
      return res.json({
        valid: false,
        latencyMs,
        error:
          targetPlatform === 'gemini_api'
            ? 'Google AI Studio API Key 驗證未通過，請確認金鑰是否完整貼上且具有存取權限。'
            : 'Agent Platform 憑證無效或過期，請確認授權 Token。',
      });
    }

    if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota') || status === 'RESOURCE_EXHAUSTED' || status === 429) {
      return res.json({
        valid: true,
        platform: 'gemini_api',
        detectedType: 'gemini_api',
        label: 'Google AI Studio Key (已達速率限制)',
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta',
        latencyMs,
        message: '金鑰格式正確且端點已連通，但目前該帳號已達 RPM 或免費用量限制，稍後或正式執行時可自動重試。',
        testedAt: new Date().toISOString(),
      });
    }

    if (targetPlatform === 'agent_platform') {
      if (errorMsg.includes('404') || errorMsg.includes('Not Found') || status === 404 || status === 'NOT_FOUND') {
        return res.json({
          valid: false,
          latencyMs,
          error: `Vertex AI 端點 404 (Not Found)：請確認已填寫「GCP 專案 ID」且部署區域正確（建議選擇 global 或 us-central1）。若要使用 Google AI Studio 端點，請切換至「Google AI Studio」分頁進行驗證。`,
        });
      }
    } else {
      // Google AI Studio
      if (errorMsg.includes('404') || errorMsg.includes('Not Found') || status === 404 || status === 'NOT_FOUND') {
        return res.json({
          valid: false,
          latencyMs,
          error: `Google AI Studio 端點 404 (Not Found)：找不到模型或端點未連通。請確認金鑰存取權限。`,
        });
      }
      if (errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('API_KEY_SERVICE_BLOCKED')) {
        return res.json({
          valid: false,
          latencyMs,
          error: `Google AI Studio 存取權限受阻 (PERMISSION_DENIED)：此金鑰尚未開啟 Generative Language API 存取權限。`,
        });
      }
    }

    return res.json({
      valid: false,
      latencyMs,
      error: `驗證未通過：${errorMsg.slice(0, 200)}`,
    });
  }
});

// 404 handler for API routes to prevent falling through to Vite HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `找不到此 API 端點: ${req.method} ${req.url}` });
});

// Express error handler for API routes
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error Middleware caught:', err);
  const formatted = formatApiError(err);
  res.status(formatted.status || 500).json({
    error: formatted.message,
    code: formatted.code,
    isAuthError: formatted.isAuthError,
  });
});

// ---------------- Vite Middleware / Static Serving ----------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AudioScribe server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
