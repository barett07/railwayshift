# CLAUDE.md — railwayshift

**鐵路輪班小幫手** — 台鐵司機員(Stan 本人用)的輪班追蹤網頁 App。GitHub Pages:`barett07.github.io/railwayshift/`。

## 架構速覽

- 整個 App 就一個 **`index.html`**(HTML + CSS + JS 全 inline),無 build tool、無 npm
- CDN 依賴:SheetJS(Excel);字體用系統字體(2026-07-19 Apple Design 改版時移除 Google Fonts)
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
7. **Edge Function 一律用 `./deploy.sh` 部署**(verify_jwt 已寫死在 `supabase/config.toml`,腳本含部署後自動驗證);避免用 MCP 部署,其 verify_jwt 預設 true 會靜默重置(→ `docs/backend.md`)
8. TDX 站名用「臺」不用「台」,必須與 `STATION_MAP` key 完全一致(→ `docs/tdx.md`)
9. **對比度須過 WCAG AA**(按鈕文字、表單標籤、placeholder、focus 框、錯誤訊息都算);**不要用 `vh`**:版面高度(`min-height`)用 `dvh`、彈窗/捲動區上限(`max-height`)用 `svh`(iOS Safari 網址列);**不用純黑 `#000` / 純白 `#fff`**,改用 off-black / off-white
10. **畫面上的數字一律來自真實資料**;示範/假資料必須明顯標示,不可混充真實數據。**空狀態、載入中、錯誤狀態都要有畫面**,不能空白

## ✅ 改完自檢(交付前逐條確認)

- 改了 CSS?→ 新增的 `:hover` 都加進 reset 區塊了;input 字體 ≥ 16px;觸控目標 ≥ 40px
- 改了畫面?→ 對比度過 WCAG AA;沒有裸 `vh`(min-height→`dvh`、max-height→`svh`);沒有純黑純白;空/載入中/錯誤狀態都有畫面;數字都是真的
- 改了 innerHTML?→ 使用者資料都套了 `escapeHtml()`
- 動了班次欄位?→ 沒碰 `depTrain` / `arrTrain`
- 改了 Edge Function?→ 用 `./deploy.sh` 部署且驗證全綠
- 在本地實際開啟頁面看過改動,不是只看程式碼

## 協作規則

- **寫任何程式碼前**,先與 Stan 討論方向,等 Stan 說「開始生成」才動手,不可推測性實作
- **發布三步驟,不可跳過**:1. 本地預覽讓 Stan 確認 → 2. Stan OK 後才 `git add` + `git commit` → 3. Stan 明確說「推上去」才 `git push`

## 部署

Push 到 GitHub → GitHub Pages 自動部署,無 CI、無 build。Edge Function 部署指令見 `docs/backend.md`。
