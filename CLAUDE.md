# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**鐵路輪班小幫手** — A single-page web app for Taiwan railway workers to track shift schedules. Hosted on GitHub Pages at `barett07.github.io/railwayshift/`.

## Architecture

The entire app lives in one file: **`index.html`** (HTML + CSS + JS all inline). No build tools, no npm, no compilation step.

**External dependencies (CDN only):**
- `SheetJS (xlsx.full.min.js)` — Excel import/export
- `Google Fonts` — Noto Sans TC, DM Mono

**Backend: Supabase REST API** (no SDK, raw `fetch` calls). The app works offline-first:
1. Always loads from `localStorage` immediately (keys: `rw2_shifts`, `rw2_segments`, `rw2_exceptions`)
2. Then attempts to sync with Supabase in the background
3. Connection status shown as dot indicator in topbar

**Supabase table: `app_data`** — key/value store with three keys:
- `shifts` — array of shift objects
- `segments` — array of schedule segments (cycle or standby periods)
- `exceptions` — object mapping date strings (`YYYY-MM-DD`) to override day info

## Key Data Structures

**Shift object** (`ST.shifts`):
```js
{ id, name, startTime, endTime, depTrain, depTime, arrTrain, arrTime,
  specialNote, isOvernight, boardTime, alightTime, imageUrl? }
```
Variant shifts use suffix notation: `544V`, `510AV`, `575AV`.

**Segment object** (`ST.segments`):
```js
// Normal rotation:
{ id, type:'normal', startDate:'YYYY-MM-DD', endDate:'YYYY-MM-DD',
  cycle: [{ type:'work'|'off'|'rest'|'leave', shiftId? }, ...] }
// Standby month:
{ id, type:'standby', startDate, endDate,
  standbyData: { 'YYYY-MM-DD': { shiftId?, note? } } }
```

**Exception object** (`ST.exceptions`):
```js
{ 'YYYY-MM-DD': { type, shiftId?, note?, customStart?, customBoard?, customAlight? } }
```

## Core Logic

- `getDayInfo(ds)` — resolves a date string to day info. Checks exceptions first, then finds the active segment, then computes cycle position via `diffDays(seg.startDate, ds) % cycle.length`.
- `buildShiftMap()` — builds `ST._shiftMap` for O(1) shift lookup by id.

## UI Color System

| 用途 | 變數 | 色碼 |
|---|---|---|
| 品牌 / 工作班左色條 | `--acc` | `#f59e0b` |
| 例假左色條 | `--r` | `#ef4444` |
| 休班左色條 | `--g` | `#10b981` |
| 特休左色條 | `--b` | `#38bdf8`（天空藍） |
| 備勤左色條 | `--p` | `#a855f7` |
| 已臨時修改文字 | inline | `#22d3ee`（青藍） |

## UI/UX 行動裝置規範（重要）

修改 CSS 前務必遵守以下規則，否則 mobile Safari 體驗會嚴重劣化：

### 1. 表單輸入框字體 ≥ 16px
所有 `.fi, .fs, .fta, .srch` 字體**必須 ≥ 16px**。iOS Safari 對字體 < 16px 的 input 會自動放大頁面，造成體驗破壞。

### 2. 觸控目標 ≥ 36-40px
按鈕類元素需要 `min-height`：`.nav-tab`、`.btn`、`.btn-sm` ≥ 40px；`.filter-btn` ≥ 36px。

### 3. 鍵盤焦點外框（`:focus-visible`）
全域 `:focus-visible` 規則只在鍵盤導航時顯示橘色外框，不影響滑鼠/觸控 — **不要用 `:focus` 設外框**（會被觸控觸發殘留）。

### 4. 觸控裝置 `:hover` 殘留（最易踩雷）

mobile Safari 點完按鈕後 `:hover` 狀態會「卡住」（觸控裝置無「滑鼠離開」事件）。修法：CSS 末尾的 `@media (hover: none)` 區塊把所有 `:hover` 規則 reset 到「未 hover」狀態。

**🚨 必讀規則**：
- reset 區塊**必須放在所有 `:hover` 規則之後**（CSS「後者勝出」原則），否則被原本的 `:hover` 規則覆蓋
- 目前位置：CSS 末尾、`@media(max-width:580px)` 之前
- **新增任何 `:hover` 規則時**，必須同時在 reset 區塊內加對應的 reset 行（reset 為該元素的「未 hover」狀態值）

範例：新增 `.foo:hover{color:var(--acc)}`（base 是 `color:var(--tx)`），就要在 reset 加 `.foo:hover{color:var(--tx)}`。

## Day Card（首頁班卡）

- **臨時修改**按鈕放在 `dc-head` 右欄（badge 下方），永遠顯示，無外框純文字
  - 未修改：`✏️ 臨時修改`（灰色）
  - 已修改：`✅ 已臨時修改`（青藍 `#22d3ee`）
- 點擊後開啟 `openExModal(ds)`
- Modal 有臨時修改時會額外出現「清除修改」按鈕（呼叫 `clearExFromModal`，無 confirm 對話框）
- `dc-foot` 已移除，`exTag`（「例外」標籤）已移除

## Calendar（月曆頁面）

- 今日格子：日期數字後墊橘色實心圓（`--acc`），不用外框
- 類型文字（`cc-type`）：一律純文字，無 emoji
  - `work` → 不顯示（班次號已在 `cc-shift` 顯示）
  - `off` → 例假、`rest` → 休班、`leave` → 特休、`standby` → 備勤

## Shift Data

班次資料完全來自 Supabase（無硬編碼預設值）。若 Supabase 與 localStorage 皆無資料，`ST.shifts` 為空陣列。

## Edit Mode

URL param `?edit=1` enables edit-only UI elements (`.edit-only` class). Edit mode shows "排班設定" and "工作班" nav tabs, and exposes day-card action buttons.

## Compact Mode（`?compact=1`）— Apple Watch 用

URL 參數 `?compact=1` 啟用「精簡模式」，給 Apple Watch 透過 iOS 捷徑開啟使用（Stan 主要在 Watch 上看當日/明日班次）。

- JS：`COMPACT_MODE` 常數，在 `showApp()` 中為 `#app` 加上 `.compact-mode` class
- CSS 規則放在 `/* COMPACT MODE */` 區塊
- 隱藏 `.topbar` 與所有 `.edit-only` 元素
- **關鍵規則**：`.compact-mode .dc-body > *:not(.shift-img):not(.day-note){display:none !important}` — 班卡只留圖片與備註，文字資訊（班號、時間、搭車時間）全部隱藏
- 隱藏 `.ex-toggle`（臨時修改按鈕）— Stan 不在 Watch 上操作
- 字體放大、強制單欄、`.cal-nav-btn` 加大到 44×44 便於切換前/後一天

部署用 URL：`https://barett07.github.io/railwayshift/?compact=1`

## 通勤資訊與 TDX 整合

「臺鐵改點後自動更新搭車時間」功能。TDX 帳號於 2026-05-19 啟用，整合完成。

### 資料結構

`ST.commuteConfig = { fromStation, toStation, bufferMin, earlyMin, trainTypes }`

- `bufferMin`（預設 6）：上班抵達緩衝。App 用「上班時間 − bufferMin」當最晚抵達時間
- `earlyMin`（預設 40）：下班可提早分鐘。App 從「下班時間 − earlyMin」開始找車
- **Supabase key**：`commute_config`（走 `app_data` 表）
- **localStorage key**：`rw2_commute_config`
- **車站清單**：`TRA_STATIONS` 常數（~200 個臺鐵營運站，按路線排列）供 `<datalist>` autocomplete
- **UI 位置**：工作班頁面頂部 `#commuteCard`（僅 `?edit=1` 看得到）
- **同步函式**：`pushCommuteConfig()`

### Edge Function `tdx-search`

- **路徑**：`supabase/functions/tdx-search/index.ts`
- **Endpoint**：`https://oqyjixphmdrhcmomskth.supabase.co/functions/v1/tdx-search`（需帶 anon key）
- **Secret**：`TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`（透過 `supabase secrets set` 設定，不在 git）
- **部署**：
  ```bash
  cd "/Users/stan/Claude Code/railwayshift"
  supabase functions deploy tdx-search --project-ref oqyjixphmdrhcmomskth
  ```

**Input**：
```json
{
  "fromStation": "彰化", "toStation": "員林",
  "mode": "before",        // before=上班(找最後能準時抵達)；after=下班(找最早能搭)
  "time": "06:54",         // before=arriveBy；after=departAfter
  "date": "2026-05-20",
  "trainTypes": ["區間","區間快","自強"],
  "limit": 0               // 預設 5；傳 0 取得全日（批次模式用）
}
```

**Output**：`{ best, candidates, mode, date, from:{name,id}, to:{name,id} }`

### ⚠️ TDX 免費版速率限制：5 次/分鐘/金鑰

**不是 5 次/秒**，很容易誤判。設計時必須最小化 TDX 呼叫次數：

- ✅ 站號表 `STATION_MAP` 寫死在 Edge Function 內（245 站），不要動態抓 `/Station` API
- ✅ Edge Function 模組層快取 OAuth token（有效 1 天）
- ✅ 批次更新「整批只打 2 次 TDX」策略（見下）
- ✅ Edge Function 內建 429 退避重試（0.8s → 2s → 4s）

### 批次重抓策略（重要）

「🔄 全部重抓台鐵」絕對不能逐班查詢（30 班 × 2 方向 = 60 次，遠超 5/分限制）。

正確做法（`openTdxBatch`）：
1. 對 OD 配對 home→work 打 1 次 TDX，`time="23:59"` `limit:0` 取得全日所有車次
2. 對 OD 配對 work→home 打 1 次 TDX，`time="00:00"` `limit:0` 取得全日所有車次
3. 兩次間隔 800ms（保險）
4. **前端在記憶體裡**為每個班次跑 `_pickBefore()` / `_pickAfter()` 篩出最佳車

整批永遠只 2 次 TDX 呼叫，與班次數無關。

### 🚨 `depTrain` / `arrTrain` 不是通勤車次

工作班物件有 4 個「車次/時間」相關欄位，語意完全不同：

| 欄位 | 用途 |
|---|---|
| `boardTime` | 通勤上班搭車時間（**TDX 查詢會更新**） |
| `alightTime` | 通勤下班搭車時間（**TDX 查詢會更新**） |
| `depTrain` | **Stan 上班要駕駛的首班車次**（TDX 查詢**絕對不可覆寫**） |
| `arrTrain` | **Stan 下班要駕駛的末班車次**（TDX 查詢**絕對不可覆寫**） |

`depTrain`/`arrTrain` 是 Stan 作為司機員實際駕駛的列車，與通勤搭車毫無關係。早期版本曾把 TDX 查到的通勤車次寫入這兩個欄位，是錯的。

TDX picker 跟批次更新都只動 `boardTime` / `alightTime`，車次號僅作參考顯示。

### CSS Class 命名避坑

- **`.cc-type`**：月曆 cell 的類型文字（「例假」「休班」等），CSS 已定義樣式
- **`.commute-type-cb`**：通勤 Modal 的車種 checkbox（不可改用 `.cc-type`，會被月曆樣式污染）

## 即時查車分頁（livetrain）

獨立的 TDX 即時查詢工具，與通勤資訊**完全無關**（不共用 OD、不共用車種偏好）。

- **位置**：nav 第三個 tab「⇄ 即時查車」，全用戶可見（不限 edit mode）
- **頁面 id**：`page-livetrain`
- **三站固定**：松竹 / 臺中 / 彰化（pill 按鈕，硬編碼在 HTML 內，要改站名要兩個 row 都改）
- **showPage idx 對照**：`{home:0, calendar:1, livetrain:2, schedule:3, shifts:4}`

### 狀態變數

```js
let _liveFrom = '';      // 起站
let _liveTo = '';        // 迄站
let _liveResults = [];   // TDX 回傳的 candidates，過了現在時間的會被過濾掉
let _liveLoading = false;
let _liveTimer = null;   // 60 秒 setInterval，更新倒數
```

不持久化（不 localStorage、不 Supabase），純 module-scope。換頁回來會保留選擇，重新整理頁面則重置。

### 操作行為（重要）

- **進頁不自動查**，user 必須手動按「🔄 查詢」
- **改起/迄站、按交換**：只更新狀態 + 清空 `_liveResults`，**不打 TDX**
- **起=迄防呆**：選到一樣會把另一邊清空
- **過了現在時間的車自動消失**：`_renderLiveResults()` 每次都 filter `depMin >= nowMin`
- **倒數更新**：`_startLiveTimer()` setInterval 60 秒，page 不在 active 時自動清掉

### TDX 呼叫

直接打 `tdx-search` Edge Function，**不快取**：
```js
{ fromStation:_liveFrom, toStation:_liveTo, mode:'after', time:<現在 HH:MM>, date:<今天>, limit:5, includeDelay:true }
```

沒帶 `trainTypes` → 顯示全部車種。

⚠️ 每次查詢實際打 TDX **2 次**（時刻表 + TrainLiveBoard），仍受 5 次/分鐘限制，但這頁是「手動觸發」，user 自己掌控節奏，不太會撞牆。

### 誤點/準點顯示

`includeDelay:true` 會讓 Edge Function 加打 `/Rail/TRA/TrainLiveBoard`（不帶路徑參數，回**全臺鐵當下所有運行中車次** ~150 班），用 TrainNo 對齊候選車次，附上 `delayMin` 欄位。

前端顯示邏輯：
| `delayMin` | 顯示 |
|---|---|
| `> 0` | 紅色「誤點 N 分」（`#ef4444`，`.live-card-delay`） |
| `=== 0` | 綠色「準點」（`#10b981`，`.live-card-ontime`） |
| `undefined` | 不顯示（車次還沒進入運行範圍，無即時資料） |

**踩過的坑**：原本用 `StationLiveBoard/Station/{StationID}` 只回 ~2-5 班「即將進站」車次，且不分方向，跟我們 OD 候選車次幾乎沒交集。改用 `/TrainLiveBoard` 全臺鐵列表後才能對齊。

⚠️ **誤點/準點只適用即時查車**。工作班 picker 跟批次更新查的是「明天」的時刻，誤點資料是「今天即時」，意義不對 → 那兩處不傳 `includeDelay`。

### 站名「臺」vs「台」

TDX 用「**臺**中」（傳統字），UI pill 也用「臺中」。**Edge Function 不做 normalize**，所以前端傳入的站名必須跟 `STATION_MAP` key 完全一致。

如果之後想加更多站，記得查 `STATION_MAP` 的 key 是「臺」還是「台」（縱貫線多用「臺」）。

## Images

`images/` folder contains JPEG files named by shift number (e.g., `501.jpeg`, `544V.jpeg`, `575AV.jpeg`). Referenced as `images/{shiftId}.jpeg`. Missing images fail silently via `onerror="this.style.display='none'"`.

## Apple Calendar Integration

A Supabase Edge Function generates a live `.ics` feed for Apple Calendar subscription.

- **Source**: `supabase/functions/calendar/index.ts`
- **Endpoint**: `https://oqyjixphmdrhcmomskth.supabase.co/functions/v1/calendar` (public, no JWT)
- **Covers**: work days only, events span `startTime` → `endTime`, 30-min alarm
- **Deploy command**:
  ```bash
  cd "/Users/stan/Claude Code/railwayshift"
  supabase functions deploy calendar --project-ref oqyjixphmdrhcmomskth --no-verify-jwt
  ```

**Critical**: `isOvernight` on shift objects imported from Excel is always `false` (hardcoded in `parseXLSX`). Do NOT rely on this field to detect overnight shifts. Use time-string comparison instead: `endTime <= startTime` means the shift spans midnight.

**Variant shift fallback**: If a shiftId like `576V` is not found in the shift map, the Edge Function strips the suffix (`V`/`AV`) and retries with the base ID.

## Excel Import

There are **two distinct Excel import flows**:

### 1. Shift Definition Import (`parseXLSX`, line ~1079)
Imports shift *definitions* (工作班 database). Used in the 工作班 tab (edit mode only). Dynamic column detection scans for `工作班`、`上班時間`、`下班時間` headers. Missing required columns abort without overwriting. State: `parsedXLSX`.

### 2. Monthly Schedule Verification (`parseCheckXLSX` / `openCheckSchedule` / `doCheckSchedule`)
Imports the company's monthly crew schedule Excel to verify against the app's computed schedule. UI button in calendar page (always visible, not edit-only). State: `_csData = { year, month, workers: [{name, id, days: {1:'550', 2:'休', ...}}] }`.

**Parsing logic:**
- Year/month auto-detected from title rows (民國 3-digit year → +1911; or Gregorian 4-digit; fallback: filename pattern)
- Date header row = row with the most cells containing integers 1–31 (threshold: ≥20 hits)
- Name in col 0 (may include `\n` + ID in same cell), ID in col 1
- Skips rows with no shift data (weekday sub-headers, ID-only rows)
- Stops at footer notes matching `/^[123][\.\、]|^注意/`
- 衛接 (carry-over) column excluded automatically (non-numeric label)

**Comparison rules:**
| Excel value | Treated as | Flags mismatch when app says |
|---|---|---|
| 班次號 (e.g. `550`) | work, shiftId must match exactly | not 'work', or different shiftId |
| `例假` | off | not 'off' |
| `休` or `—` or blank | rest | 'work' or 'off' |
| App type `leave`/`rest`/`standby` (no shift) | — | never flagged for rest/off Excel days |

## 班卡圖片裁切工具

**`auto_crop.py`** — 用 ocrmac (macOS Vision OCR) + numpy 偵測班表 JPG 格線，自動裁切成個別班卡 JPEG。

**執行環境：** `.venv/`（Python 3.13，已安裝 ocrmac、numpy、Pillow）

```bash
.venv/bin/python3 auto_crop.py
```

**使用流程：**
1. 把新班表 JPG 放進專案資料夾（例如 `1150509班表/`）
2. 修改 `auto_crop.py` 頂部的 `IMG1` / `IMG2` 路徑
3. 執行腳本 → 結果輸出到 `images_new/`
4. 確認裁切結果沒問題後，`cp images_new/*.jpeg images/`
5. `git add images/ && git commit && git push`

**關鍵參數：**
- 圖1（501–553）：逐欄 `threshold=60`，欄6有獨立的水平分隔線位置
- 圖2（554–5R/X 系列）：逐欄 `threshold=100` + 80% 暗像素過濾（排除卡片內容假線）
- 圖2 OCR 限制掃描格頂 200px（班次號在 header strip）；圖1 掃全高（班次號在格中）
- 班次號 regex：`5\d{2}[AV]*`、`5R\d+`、`X\d+[A-Z]*`

**注意：** `576V` 未出現在 115/04/09 班表，保留自原手動截圖。若格式大改版需重新校正閾值。

## Collaboration Rules

**Before writing any code**, discuss the change direction with the user and get explicit approval. Only start generating code when the user says "開始生成" or equivalent confirmation. Do not implement speculatively.

## Deployment

Push to GitHub → GitHub Pages auto-deploys. No CI, no build step.

```bash
git add index.html images/
git commit -m "your message"
git push
```

## 發布流程（三步驟，不可跳過）

程式碼完成後，**依序執行以下三步**，不可合併或跳過：

1. **網頁預覽確認** — 先讓 Stan 在瀏覽器中預覽變更，確認畫面與行為符合預期
2. **git commit** — Stan 確認沒問題後，才進行版本控制（`git add` + `git commit`）
3. **git push** — commit 完成後，再由 Stan 明確說「推上去」才執行 `git push`
