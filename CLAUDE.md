# CLAUDE.md — railwayshift

**鐵路輪班小幫手** — 台鐵司機員(Stan 本人用)的輪班追蹤網頁 App。GitHub Pages:`barett07.github.io/railwayshift/`。

## 架構速覽

- 整個 App 就一個 **`index.html`**(HTML + CSS + JS 全 inline),無 build tool、無 npm
- CDN 依賴:SheetJS(Excel)、Google Fonts(Noto Sans TC、DM Mono)
- 後端:Supabase REST API(無 SDK,raw `fetch`),offline-first:先讀 localStorage(`rw2_shifts`、`rw2_segments`、`rw2_exceptions`)→ 背景同步 Supabase
- Supabase 表 `app_data`(key/value):`shifts`、`segments`、`exceptions`、`commute_config`
- 管理模式:`?admin=1` + 後端密碼驗證(舊 `?edit=1` 已廢棄);Watch 精簡模式:`?compact=1`

## 先讀這些(動手前先查對應文件)

| 要動什麼 | 先讀 |
|---|---|
| CSS / 各頁面 UI / 色彩 / Compact 模式 | `docs/ui.md` |
| 通勤資訊、TDX、即時查車分頁 | `docs/tdx.md` |
| Excel 匯入(工作班 / 月班表核對 / 輪職表) | `docs/excel-import.md` |
| 資安、iCal 行事曆、Edge Function 部署 | `docs/backend.md` |
| 班卡圖片裁切(備用腳本) | `docs/auto-crop.md`(日常用 `shift-cropper` 專案) |

## 核心資料結構

```js
// Shift(ST.shifts;變體班次後綴:544V、510AV、575AV)
{ id, name, startTime, endTime, depTrain, depTime, arrTrain, arrTime,
  specialNote, isOvernight, boardTime, alightTime, imageUrl? }
// Segment(ST.segments)
{ id, type:'normal', startDate, endDate, cycle:[{type:'work'|'off'|'rest'|'leave', shiftId?},...] }
{ id, type:'standby', startDate, endDate, standbyData:{ 'YYYY-MM-DD': {shiftId?, note?} } }
// Exception(ST.exceptions)
{ 'YYYY-MM-DD': { type, shiftId?, note?, customStart?, customBoard?, customAlight? } }
```

- `getDayInfo(ds)`:exceptions → 找 active segment → `diffDays(seg.startDate, ds) % cycle.length`
- `buildShiftMap()`:建 `ST._shiftMap` 供 O(1) 查班次
- 班次資料完全來自 Supabase,無硬編碼預設值

## ⚠️ 紅線(不知道就會犯錯,細節在對應 docs)

1. **`depTrain` / `arrTrain` 是 Stan 要駕駛的車次,TDX 查詢絕對不可覆寫**;通勤時間只能寫 `boardTime` / `alightTime`(→ `docs/tdx.md`)
2. **TDX 免費版限 5 次/分鐘**(不是 5 次/秒);批次重抓整批只打 2 次(→ `docs/tdx.md`)
3. **新增任何 `:hover` 規則**,必須同步在 CSS 末尾 `@media (hover: none)` reset 區塊加對應行(→ `docs/ui.md`)
4. 表單輸入框字體 ≥ 16px、觸控目標 ≥ 40px、外框用 `:focus-visible` 不用 `:focus`(→ `docs/ui.md`)
5. **innerHTML 中所有使用者資料必須套 `escapeHtml()`**(→ `docs/backend.md`)
6. **`isOvernight` 欄位不可信**(匯入時一律 false),跨夜判斷用 `endTime <= startTime`
7. **部署 `calendar` function 必帶 `--no-verify-jwt`**;MCP 部署預設 verify_jwt=true 會靜默重置(→ `docs/backend.md`)
8. TDX 站名用「臺」不用「台」,必須與 `STATION_MAP` key 完全一致(→ `docs/tdx.md`)

## 協作規則

- **寫任何程式碼前**,先與 Stan 討論方向,等 Stan 說「開始生成」才動手,不可推測性實作
- **發布三步驟,不可跳過**:1. 網頁預覽讓 Stan 確認 → 2. Stan OK 後才 `git add` + `git commit` → 3. Stan 明確說「推上去」才 `git push`

## 部署

Push 到 GitHub → GitHub Pages 自動部署,無 CI、無 build。Edge Function 部署指令見 `docs/backend.md`。
