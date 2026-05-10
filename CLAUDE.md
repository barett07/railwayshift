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

## Edit Mode

URL param `?edit=1` enables edit-only UI elements (`.edit-only` class). Edit mode shows "排班設定" and "工作班" nav tabs, and exposes day-card action buttons.

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
