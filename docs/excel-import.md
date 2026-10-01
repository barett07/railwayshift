# Excel 匯入(三種流程)

There are **three distinct Excel import flows**:

## 1. Shift Definition Import(`parseXLSX`, line ~1079)

Imports shift *definitions*(工作班 database). Used in the 工作班 tab (edit mode only). Dynamic column detection scans for `工作班`、`上班時間`、`下班時間` headers. Missing required columns abort without overwriting. State: `parsedXLSX`.

⚠️ `parseXLSX` 匯入的 shift 物件 `isOvernight` 一律是 `false`(hardcoded)。**不要依賴這個欄位判斷跨夜班**,用時間比較:`endTime <= startTime` 即跨夜。

## 2. Monthly Schedule Verification(`parseCheckXLSX` / `openCheckSchedule` / `doCheckSchedule`)

Imports the company's monthly crew schedule Excel to verify against the app's computed schedule. UI button in calendar page (always visible, not edit-only). State: `_csData = { year, month, workers: [{name, id, days: {1:'550', 2:'休', ...}}] }`.

**Parsing logic:**
- Year/month auto-detected from title rows (民國 3-digit year → +1911; or Gregorian 4-digit; fallback: filename pattern)
- Date column map = row with the most cells containing integers 1–31 (threshold: ≥20 hits)
- Reading starts after the **first** row whose days 1–28 match that map; every page repeats the header, so all such rows (and `姓  名` rows) are skipped. ⚠️ 2026-09-30: 115 年 9 月第一頁表頭只到 30、第二頁到 31 → 舊邏輯從第二頁開始讀，第一頁（含本人）整頁漏掉，跳「找不到本人資料」
- Name in col 0; ID = col 1 when it is all digits, else the 2nd line of the name cell (that line can be a note like `R、PP`, so col 1 wins)
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

- **手動改過的日子（`ST.exceptions` 有該日，`getDayInfo` 回 `isEx:true`）與班表不同 → 一律列入「你自己調整過的日子（不算錯）」，不紅框**；只有沒手動改過的差異才紅框報錯（2026-10-01 Stan 定的規則）。休班 vs 特休/備勤：手動改過的列入調整清單，沒改過的照舊不報。 Card uses `--s2` bg + blue border: `--tx2` on `--b-d` is 4.47 in light mode, fails AA
- **套用按鈕（2026-10-01）**：管理模式（`#app.edit-mode`）下，紅框可一鍵改成班表上的班（`applyCsFix` / `applyCsAll`），存成 `ST.exceptions`，和日曆手動改班走同一條 `pushException`。只套班號（`/^\d+[A-Z]*$/`，如 513V）、例假、休班；國例/病假等不認得的字不給按鈕。custom 時間存空字串，顯示時自動帶工作班預設。批次套用：前幾筆先寫進 `ST.exceptions`，最後一筆用 `pushException` 一次同步。套用後該日與班表一致，紅藍兩區都不再出現
- ⚠️ 已知未處理：Excel 也會出現 `國例`、`休假`、`病假`、`日勤`、`日班`、`乙1`/`乙2` 等非班號值，目前都被當成班號比對，本人列出現時會誤報

## 3. Rotation Schedule Import(`openImportRotation`)

匯入公司「組別輪職表.xlsx」建立輪班循環段。UI 按鈕在排班設定分頁(admin 模式)。

**Excel 結構**(固定格式):
| Row (0-indexed) | 內容 |
|---|---|
| 3 | AB組,50 天循環,cols 2–51(第 1–49 天 + 第 0 天) |
| 4 | CD組,50 天循環,同上 |
| 5 | E組,20 天循環,cols 2–21 |
| 6 | F組,20 天循環,cols 2–21 |

- 每行最後一欄(標籤為「0」)= 循環位置 0;解析時移到陣列開頭
- **參考日**:`2025-09-08`(`_IRM_REF` 常數)= 所有組別的循環位置 0

**循環對齊邏輯**:
- 自動從參考日推算開始日期落在循環的第幾天(`offset`)
- UI 顯示「開始那天是循環第幾天」下拉選單供 Stan 核對;手動改選後預覽即時更新
- `offset` 決定 refCycle 的旋轉量:`rotated = [...refCycle.slice(offset), ...refCycle.slice(0, offset)]`
- `rotated[0]` = 開始日當天的班別 → `getDayInfo` 的 `diffDays(seg.startDate, ds) % len` 對齊正確

**值對應**:`例假` → `off`、`休` / `—` / null → `rest`、數字 → `work`(shiftId)

**右側「銜接」表**(同一 Excel):特殊交接符號(如 `586A`、`70例`),目前不解析,忽略即可。
