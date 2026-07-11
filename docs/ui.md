# UI 規範與各頁面細節

## UI Color System

| 用途 | 變數 | 色碼 |
|---|---|---|
| 品牌 / 工作班左色條 | `--acc` | `#f59e0b` |
| 例假左色條 | `--r` | `#ef4444` |
| 休班左色條 | `--g` | `#10b981` |
| 特休左色條 | `--b` | `#38bdf8`(天空藍) |
| 備勤左色條 | `--p` | `#a855f7` |
| 已臨時修改文字 | inline | `#22d3ee`(青藍) |

## UI/UX 行動裝置規範(重要)

修改 CSS 前務必遵守以下規則,否則 mobile Safari 體驗會嚴重劣化:

### 1. 表單輸入框字體 ≥ 16px
所有 `.fi, .fs, .fta, .srch` 字體**必須 ≥ 16px**。iOS Safari 對字體 < 16px 的 input 會自動放大頁面,造成體驗破壞。

### 2. 觸控目標 ≥ 36-40px
按鈕類元素需要 `min-height`:`.nav-tab`、`.btn`、`.btn-sm` ≥ 40px;`.filter-btn` ≥ 36px。

### 3. 鍵盤焦點外框(`:focus-visible`)
全域 `:focus-visible` 規則只在鍵盤導航時顯示橘色外框,不影響滑鼠/觸控 — **不要用 `:focus` 設外框**(會被觸控觸發殘留)。

### 4. 觸控裝置 `:hover` 殘留(最易踩雷)

mobile Safari 點完按鈕後 `:hover` 狀態會「卡住」(觸控裝置無「滑鼠離開」事件)。修法:CSS 末尾的 `@media (hover: none)` 區塊把所有 `:hover` 規則 reset 到「未 hover」狀態。

**🚨 必讀規則**:
- reset 區塊**必須放在所有 `:hover` 規則之後**(CSS「後者勝出」原則),否則被原本的 `:hover` 規則覆蓋
- 目前位置:CSS 末尾、`@media(max-width:580px)` 之前
- **新增任何 `:hover` 規則時**,必須同時在 reset 區塊內加對應的 reset 行(reset 為該元素的「未 hover」狀態值)

範例:新增 `.foo:hover{color:var(--acc)}`(base 是 `color:var(--tx)`),就要在 reset 加 `.foo:hover{color:var(--tx)}`。

## Day Card(首頁班卡)

- **臨時修改**按鈕放在 `dc-head` 右欄(badge 下方),永遠顯示,無外框純文字
  - 未修改:`✏️ 臨時修改`(灰色)
  - 已修改:`✅ 已臨時修改`(青藍 `#22d3ee`)
- 點擊後開啟 `openExModal(ds)`
- Modal 有臨時修改時會額外出現「清除修改」按鈕(呼叫 `clearExFromModal`,無 confirm 對話框)
- `dc-foot` 已移除,`exTag`(「例外」標籤)已移除

## Calendar(月曆頁面)

- 今日格子:日期數字後墊橘色實心圓(`--acc`),不用外框
- 類型文字(`cc-type`):一律純文字,無 emoji
  - `work` → 不顯示(班次號已在 `cc-shift` 顯示)
  - `off` → 例假、`rest` → 休班、`leave` → 特休、`standby` → 備勤

## Compact Mode(`?compact=1`)— Apple Watch 用

URL 參數 `?compact=1` 啟用「精簡模式」,給 Apple Watch 透過 iOS 捷徑開啟使用(Stan 主要在 Watch 上看當日/明日班次)。

- JS:`COMPACT_MODE` 常數,在 `showApp()` 中為 `#app` 加上 `.compact-mode` class
- CSS 規則放在 `/* COMPACT MODE */` 區塊
- 隱藏 `.topbar` 與所有 `.edit-only` 元素
- **關鍵規則**:`.compact-mode .dc-body > *:not(.shift-img):not(.day-note){display:none !important}` — 班卡只留圖片與備註,文字資訊(班號、時間、搭車時間)全部隱藏
- 隱藏 `.ex-toggle`(臨時修改按鈕)— Stan 不在 Watch 上操作
- 字體放大、強制單欄、`.cal-nav-btn` 加大到 44×44 便於切換前/後一天

部署用 URL:`https://barett07.github.io/railwayshift/?compact=1`

## Images

`images/` folder contains JPEG files named by shift number (e.g., `501.jpeg`, `544V.jpeg`, `575AV.jpeg`). Referenced as `images/{shiftId}.jpeg`. Missing images fail silently via `onerror="this.style.display='none'"`.
