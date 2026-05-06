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
- `BUILTIN` — hardcoded array of ~100 shifts embedded in the JS (from Excel 114/03/30). Used as fallback when Supabase has no shift data.

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

`parseXLSX` (line ~1079) uses dynamic column detection — it scans the header row for column names rather than fixed offsets, so it handles files with extra leading columns (e.g., 1150323公告資料.xlsx). Required columns: `工作班`、`上班時間`、`下班時間`. Missing required columns show an error and abort without overwriting existing data.

## Collaboration Rules

**Before writing any code**, discuss the change direction with the user and get explicit approval. Only start generating code when the user says "開始生成" or equivalent confirmation. Do not implement speculatively.

## Deployment

Push to GitHub → GitHub Pages auto-deploys. No CI, no build step.

```bash
git add index.html images/
git commit -m "your message"
git push
```
