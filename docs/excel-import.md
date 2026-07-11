# Excel 匯入(三種流程)

There are **three distinct Excel import flows**:

## 1. Shift Definition Import(`parseXLSX`, line ~1079)

Imports shift *definitions*(工作班 database). Used in the 工作班 tab (edit mode only). Dynamic column detection scans for `工作班`、`上班時間`、`下班時間` headers. Missing required columns abort without overwriting. State: `parsedXLSX`.

⚠️ `parseXLSX` 匯入的 shift 物件 `isOvernight` 一律是 `false`(hardcoded)。**不要依賴這個欄位判斷跨夜班**,用時間比較:`endTime <= startTime` 即跨夜。

## 2. Monthly Schedule Verification(`parseCheckXLSX` / `openCheckSchedule` / `doCheckSchedule`)

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
