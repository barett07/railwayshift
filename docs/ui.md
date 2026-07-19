# UI 規範與各頁面細節

## 設計語言（2026-07-19 Apple Design 改版）

整體改用 Apple 設計語言（參考 emilkowalski/skills 的 apple-design skill）：

- **字體**：系統字體 SF Pro／PingFang TC（`-apple-system` 開頭的 font stack），**已移除 Google Fonts CDN**（Noto Sans TC、DM Mono 都不再載入）。數字對齊一律用 `font-variant-numeric:tabular-nums`，不要再引入 mono 字體
- **深淺雙主題**：色彩全部走 `:root` CSS 變數，`@media (prefers-color-scheme: light)` 內只重定義變數。**新增顏色一律加變數、兩個主題都要定義**，不要寫死色碼
- **毛玻璃**：頂欄與底部 Tab Bar 用 `backdrop-filter:blur+saturate`；已有 `prefers-reduced-transparency` 降級處理
- **動畫**：只動 `transform`/`opacity`；`prefers-reduced-motion` 會全域停用
- **按壓回饋**：按鈕類 `:active{transform:scale(.96)}`（集中在一條規則，新增按鈕類元素時把 selector 加進去）

## UI Color System（iOS 系統色）

| 用途 | 變數 | 深色 | 淺色 |
|---|---|---|---|
| 品牌 / 工作班 | `--acc` | `#FF9F0A` | `#FF9500` |
| 例假 | `--r` | `#FF453A` | `#FF3B30` |
| 休班 | `--g` | `#30D158` | `#34C759` |
| 特休 | `--b` | `#0A84FF` | `#007AFF` |
| 備勤 | `--p` | `#BF5AF2` | `#AF52DE` |
| 已臨時修改 / 例外標記 | `--cyan` | `#64D2FF` | `#32ADE6` |
| 背景 / 卡片 | `--bg` `--s1` `--s2` `--s3` | `#000`/`#1C1C1E`/`#2C2C2E`/`#3A3A3C` | `#F2F2F7`/`#FFF`/`#F2F2F7`/`#E5E5EA` |
| 玻璃 | `--glass` `--glass-lq` `--glass-edge` | 見 `:root` | 見 light 區塊 |

## 導覽結構（底部液態玻璃 Tab Bar）

- 頁籤在**底部浮動 Tab Bar**（`.tabbar`），頂欄只剩品牌＋時鐘＋連線燈
- 選中膠囊是獨立的 `.tab-lens` 透鏡層，由 `_moveTabLens()` 用 JS 定位（帶回彈 transition）
- **⚠️ 坑：任何手動切換分頁的程式碼（不走 `showPage()`）必須同步做三件事**：更新 `_pageIdx`、呼叫 `_slideIn()` 播轉場、`requestAnimationFrame(_moveTabLens)` — 否則透鏡會停在舊位置（`goToDate()` 就踩過這個坑，可參考其寫法）
- 分頁轉場有方向性：`_slideIn(el,dir)`，dir>0 從右滑入、dir<0 從左滑入
- `.main` 底部有預留 Tab Bar 的 padding；compact 模式隱藏 `.tabbar`

## 手勢

- 首頁左右滑切日期（`homeMove`）、月曆左右滑切月份（`calMove`），由 `_addSwipe()` 綁 touch 事件：門檻 60px、水平位移需 > 2 倍垂直位移、600ms 內
- 只綁 touch，desktop 滑鼠不觸發

## Modal（手機 = 彈簧底部面板）

- ≤640px 時 `.modal` 變成底部面板：毛玻璃、頂部把手（`#modalGrab`）可拖曳關閉，彈簧物理（damping 0.8 / response 0.3）在 `_shSpring()` 
- **新增 modal 一律走 `setModal()` / `closeM()`**，面板動畫已在裡面處理；不要自己對 overlay 加減 `open` class
- 桌面（>640px）維持置中對話框，行為不變

## UI/UX 行動裝置規範(重要)

修改 CSS 前務必遵守以下規則,否則 mobile Safari 體驗會嚴重劣化:

### 1. 表單輸入框字體 ≥ 16px
所有 `.fi, .fs, .fta, .srch` 字體**必須 ≥ 16px**。iOS Safari 對字體 < 16px 的 input 會自動放大頁面,造成體驗破壞。

### 2. 觸控目標 ≥ 36-40px
按鈕類元素需要 `min-height`:`.nav-tab`、`.btn`、`.btn-sm` ≥ 40px(nav-tab 現為 44px);`.filter-btn` ≥ 36px。

### 3. 鍵盤焦點外框(`:focus-visible`)
全域 `:focus-visible` 規則只在鍵盤導航時顯示橘色外框,不影響滑鼠/觸控 — **不要用 `:focus` 設外框**(會被觸控觸發殘留)。

### 4. 觸控裝置 `:hover` 殘留(最易踩雷)

mobile Safari 點完按鈕後 `:hover` 狀態會「卡住」(觸控裝置無「滑鼠離開」事件)。修法:CSS 末尾的 `@media (hover: none)` 區塊把所有 `:hover` 規則 reset 到「未 hover」狀態。

**🚨 必讀規則**:
- reset 區塊**必須放在所有 `:hover` 規則之後**(CSS「後者勝出」原則),否則被原本的 `:hover` 規則覆蓋
- 目前位置:CSS 末尾、`@media(max-width:580px)` 之前
- **新增任何 `:hover` 規則時**,必須同時在 reset 區塊內加對應的 reset 行(reset 為該元素的「未 hover」狀態值)

範例:新增 `.foo:hover{color:var(--acc)}`(base 是 `color:var(--tx)`),就要在 reset 加 `.foo:hover{color:var(--tx)}`。

**⚠️ 元素有 `.active` 之類的狀態 class 時,reset 要用 `:not(.active)` 排除**,否則 reset(在 CSS 末尾)會蓋掉 active 顏色,手機上會出現「點了分頁但顏色不變,要再點一下別處才變色」的 bug(2026-07-19 `.nav-tab` 踩過)。寫法:`.nav-tab:not(.active):hover{...}` ＋ `.nav-tab.active:hover{color:var(--acc)}`。

### 5. 頁面轉場動畫與水平捲軸

分頁轉場 `_slideIn` 會讓頁面短暫 `translateX(32px)` 超出視窗,`body` 必須保持 `overflow-x:hidden`,否則桌面會瞬間長出水平捲軸、把固定在底部的 Tab Bar 抬起來閃一下(2026-07-19 踩過)。

## 頂欄

- sticky;右側:即時時鐘(`#topClock`,每秒更新,tabular-nums)＋連線燈(`#statusDot`)
- **背景=不透明 `var(--bg)`(與頁面背景完全同色),不用毛玻璃**;捲動 >8px 加 `.scrolled` 只浮現底部細分隔線(scroll listener 在 `_moveTabLens` 的 resize 監聽旁)
- **為什麼不能用毛玻璃/半透明**(2026-07-19 兩次迭代的結論):iPhone(iOS 26 液態玻璃)會對狀態列區域自行取樣頁面內容做模糊,頂欄若是半透明毛玻璃,靜止/捲動/下拉回彈三種狀態會與系統效果不同步,出現黑-灰-黑色差割裂(Stan 附截圖反映過兩次)。**頂欄只能是與 `--bg` 同色的實色**,系統取樣永遠同色才無縫

## Day Card(首頁班卡)

- **臨時修改**按鈕放在 `dc-head` 右欄(badge 下方),永遠顯示,無外框純文字
  - 未修改:`✏️ 臨時修改`(灰色)
  - 已修改:`✅ 已臨時修改`(`var(--cyan)`)
- 點擊後開啟 `openExModal(ds)`
- Modal 有臨時修改時會額外出現「清除修改」按鈕(呼叫 `clearExFromModal`,無 confirm 對話框)
- badge 為 emoji＋文字膠囊,**不加額外圓點**(2026-07-19 曾加過 `::before` 圓點,Stan 要求移除)

## Calendar(月曆頁面)

- 整個月曆包在 `.cal-card` 大卡片內;格子**無框無底色**,置中直排:日期數字 → 班號(橘)或類型文字(對應色)。**不加小圓點**(加過 `.cc-dot`,Stan 嫌干擾已移除)
- 今日:日期數字墊橘色實心圓(`.cal-cell.today .cc-day`)
- 月初空格顯示**上月日期**(淡灰,`.cal-cell.empty`)
- 類型文字(`cc-type`):純文字無 emoji;`work` 直接顯示班號(`cc-shift`)
- 格子裡**不再顯示上班搭車時間**(`.cc-time` 已 `display:none`,markup 也移除)
- 例外修改標記:**該日日期數字改青藍色**(`.cal-cell.ex .cc-day{color:var(--cyan)}`);今日+例外時「今日」優先(白字橘圓)。圓環、角落小點兩案都被 Stan 否決過,別再提
- 切月按鈕 `.cal-nav-btn`:44px 圓形、SVG 箭頭(文字符號 ‹ › 會偏離圓心,已全面換 SVG,首頁切日期同)
- **首頁切日期鈕加 `.glass` 修飾**(毛玻璃+光邊,同 Tab Bar 質感;月曆切月鈕維持平面,Stan 指定);新增的 `:hover` 與 `prefers-reduced-transparency` 降級都已有對應行
- 即時查車 `.live-card` **無左側橘色帶**(2026-07-19 Stan 嫌與 Apple Design 不搭移除),四邊均勻細框
- 月份下拉:以**目前檢視月**為基準列「前 1～後 3 個月」,目前月橘色粗體;選項 `white-space:nowrap` 防兩位數月份折行

## Compact Mode(`?compact=1`)— Apple Watch 用

URL 參數 `?compact=1` 啟用「精簡模式」,給 Apple Watch 透過 iOS 捷徑開啟使用(Stan 主要在 Watch 上看當日/明日班次)。

- JS:`COMPACT_MODE` 常數,在 `showApp()` 中為 `#app` 加上 `.compact-mode` class
- CSS 規則放在 `/* COMPACT MODE */` 區塊
- 隱藏 `.topbar`、`.tabbar` 與所有 `.edit-only` 元素
- **關鍵規則**:`.compact-mode .dc-body > *:not(.shift-img):not(.day-note){display:none !important}` — 班卡只留圖片與備註,文字資訊(班號、時間、搭車時間)全部隱藏
- 隱藏 `.ex-toggle`(臨時修改按鈕)— Stan 不在 Watch 上操作
- 字體放大、強制單欄、`.cal-nav-btn` 加大到 44×44 便於切換前/後一天

部署用 URL:`https://barett07.github.io/railwayshift/?compact=1`

## Images

`images/` folder contains JPEG files named by shift number (e.g., `501.jpeg`, `544V.jpeg`, `575AV.jpeg`). Referenced as `images/{shiftId}.jpeg`. Missing images fail silently via `onerror="this.style.display='none'"`.
