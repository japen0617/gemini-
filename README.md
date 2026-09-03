# AudioScribe & Subtitle Studio

AudioScribe & Subtitle Studio 是一個以 React、Vite、Express 與 Google Gemini 建立的瀏覽器語音工作室。它可以將音訊或影片轉成逐字稿，產生時間軸字幕、AI 摘要與多語言翻譯，並匯出常見字幕及報告格式。

## 功能

- 上傳音訊或影片，或使用瀏覽器麥克風錄音。
- 支援 MP3、WAV、M4A、AAC、OGG、FLAC、WebM、MP4、MOV、M4V 等常見格式（實際可解碼格式取決於瀏覽器）。
- 長檔案自動以約 3 分鐘為單位切割，並重新取樣為 16 kHz、單聲道 WAV，以降低 API payload 大小。
- 使用 Gemini 進行逐字稿、SRT/VTT 時間軸、繁體中文摘要、章節、關鍵字與行動項目產生。
- 將字幕翻譯成繁體中文、簡體中文、英文、日文、韓文、西班牙文、法文、德文、越南文或印尼文。
- 編輯逐字稿與字幕、播放音訊、搜尋歷史專案，以及匯出 SRT、WebVTT、TXT、Markdown、JSON 或 ZIP。
- 專案資料儲存在瀏覽器 IndexedDB；不支援 IndexedDB 時會退回 localStorage。
- 內建 Podcast、會議與課程範例，可在沒有自訂金鑰時使用預設基準資料測試流程。

## 技術架構

```text
瀏覽器 (React + Vite)
  ├─ 音訊分析、錄音、切割與匯出
  ├─ IndexedDB / localStorage 專案儲存
  └─ Express API (/api/*)
       └─ Google AI Studio Gemini API
          或 Vertex AI / Agent Platform
```

主要目錄：

- `src/App.tsx`：頁面狀態與轉錄處理流程。
- `src/components/`：儀表板、上傳、處理進度、設定與詳細檢視元件。
- `src/utils/audioUtils.ts`：格式判斷、metadata、音訊解碼、取樣與切割。
- `src/utils/subtitleUtils.ts`：字幕、報告與 ZIP 匯出。
- `src/utils/db.ts`：IndexedDB/localStorage 儲存層。
- `server.ts`：Express 伺服器與 Gemini 代理 API。

## 環境需求

- Node.js 18+（建議使用目前的 LTS 版本），或 Bun。
- 可存取 Google Gemini API 的 API key。
- 支援 Web Audio API、MediaRecorder 與 IndexedDB 的現代瀏覽器。

## 快速開始

```bash
git clone <repository-url>
cd gemini-
npm install
cp .env.example .env
```

編輯 `.env`：

```dotenv
GEMINI_API_KEY=你的_Gemini_API_Key
APP_URL=http://localhost:3000
```

啟動開發伺服器：

```bash
npm run dev
```

開啟 <http://localhost:3000>。`npm run dev` 會執行 `tsx server.ts`，Express 會在開發模式中掛載 Vite middleware。

### Bun

專案包含 `bun.lock`，也可以使用：

```bash
bun install
bun run dev
```

## 建置與啟動

```bash
npm run lint   # TypeScript 型別檢查
npm run build  # Vite 前端 + esbuild 後端
npm start      # 以 NODE_ENV=production 的方式啟動 dist/server.cjs
```

正式環境請設定 `NODE_ENV=production`，並在啟動前完成 `npm run build`。伺服器固定監聽 `0.0.0.0:3000`；目前埠號在 `server.ts` 中設定為 3000。

## 使用方式

1. 在首頁選擇「上傳檔案」、「麥克風錄音」或範例音訊。
2. 選擇原始語言、是否翻譯及是否產生摘要。
3. 若未使用環境變數金鑰，可在 API 設定中輸入自訂 Gemini/Vertex AI 設定並先執行連線測試。
4. 開始處理，等待轉錄、分段、摘要與翻譯完成。
5. 在詳細檢視中修訂文字或時間軸，然後下載單一格式或完整 ZIP 套件。

超過 180 秒或 8 MB 的檔案會啟用長檔切割。影片會先嘗試擷取音軌；瀏覽器不支援該影片編碼時，處理可能失敗。

## API 端點

所有端點由同一個 Express 伺服器提供，前端以相對路徑呼叫：

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康檢查 |
| `POST` | `/api/transcribe` | 轉錄音訊並產生字幕/摘要 |
| `POST` | `/api/translate-subtitles` | 翻譯字幕 segments |
| `POST` | `/api/summarize` | 重新產生或自訂摘要 |
| `POST` | `/api/sample-audio` | 產生或取得範例音訊 |
| `POST` | `/api/validate-key` | 驗證金鑰與目標端點 |

`/api/transcribe` 的主要 JSON 欄位包括 `audioBase64`、`mimeType`、`languageHint`、`offsetSeconds`、`audioDuration`、`fileName`、`sampleType` 與 `generateSummary`。自訂平台設定透過 `x-gemini-api-key`、`x-platform-type`、`x-gcp-project-id`、`x-gcp-location` 及 `x-custom-endpoint` headers 傳遞。

## 金鑰與資料安全

- `.env` 不應提交至版本庫；請使用 `.env.example` 作為範本。
- 預設 Gemini 金鑰只在伺服器端讀取。使用者在設定視窗輸入的自訂金鑰會以明文儲存在瀏覽器 localStorage，請只在受信任的裝置使用。
- 音訊、逐字稿、翻譯與 API 金鑰會送往所選 Gemini/Vertex AI 端點；請確認符合你的資料保護要求。
- Express 目前接受最多 100 MB JSON payload，仍應在反向代理、平台與 API 配額層設定適當限制。
- 此專案沒有內建登入、使用者隔離、速率限制或伺服器端持久化；公開部署前請加上適當的身份驗證、HTTPS、CORS/來源控管與監控。

## 儲存與清除

專案與音訊快取預設留在目前瀏覽器的 `AudioScribeStudioDB` IndexedDB。若瀏覽器不支援 IndexedDB，專案摘要會退回 `audioscribe_projects` localStorage，最多保留 30 筆。清除專案會同時嘗試刪除其 IndexedDB 音訊快取。

清除瀏覽器網站資料會移除本機歷史專案、快取音訊與自訂 API 設定；匯出 ZIP 可作為人工備份。

## 疑難排解

- **無法連線或 401/403**：確認 `GEMINI_API_KEY`、自訂金鑰、平台類型、GCP 專案 ID 與區域設定。
- **413 Entity Too Large**：確認長檔切割已完成；同時檢查反向代理與部署平台的 request body 限制。
- **無法讀取音訊/影片**：改用瀏覽器原生支援的格式（例如 MP3、WAV、WebM），或先轉檔。
- **麥克風無法使用**：允許瀏覽器麥克風權限；除 localhost 外通常需要 HTTPS。
- **歷史資料消失**：確認仍使用同一個瀏覽器來源（origin），且沒有清除網站資料或切換瀏覽器/無痕視窗。
- **摘要或翻譯失敗**：檢查 API 配額與模型權限；程式會對暫時性 429/503 錯誤重試並切換備援模型。

## 授權

本儲存庫目前未提供明確的 LICENSE 檔案。若要對外發布或重新使用，請先向儲存庫擁有者確認授權條款。
