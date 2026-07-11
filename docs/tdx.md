# TDX 整合(通勤資訊 + 即時查車)

「臺鐵改點後自動更新搭車時間」功能。TDX 帳號於 2026-05-19 啟用,整合完成。

## 通勤資訊

### 資料結構

`ST.commuteConfig = { fromStation, toStation, bufferMin, earlyMin, trainTypes }`

- `bufferMin`(預設 6):上班抵達緩衝。App 用「上班時間 − bufferMin」當最晚抵達時間
- `earlyMin`(預設 40):下班可提早分鐘。App 從「下班時間 − earlyMin」開始找車
- **Supabase key**:`commute_config`(走 `app_data` 表)
- **localStorage key**:`rw2_commute_config`
- **車站清單**:`TRA_STATIONS` 常數(~200 個臺鐵營運站,按路線排列)供 `<datalist>` autocomplete
- **UI 位置**:工作班頁面頂部 `#commuteCard`(僅管理模式 `?admin=1` 看得到)
- **同步函式**:`pushCommuteConfig()`

### Edge Function `tdx-search`

- **路徑**:`supabase/functions/tdx-search/index.ts`
- **Endpoint**:`https://oqyjixphmdrhcmomskth.supabase.co/functions/v1/tdx-search`(需帶 anon key)
- **Secret**:`TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`(透過 `supabase secrets set` 設定,不在 git)
- **部署**:
  ```bash
  cd "/Users/stan/Claude Code/railwayshift"
  supabase functions deploy tdx-search --project-ref oqyjixphmdrhcmomskth
  ```

**Input**:
```json
{
  "fromStation": "彰化", "toStation": "員林",
  "mode": "before",        // before=上班(找最後能準時抵達);after=下班(找最早能搭)
  "time": "06:54",         // before=arriveBy;after=departAfter
  "date": "2026-05-20",
  "trainTypes": ["區間","區間快","自強"],
  "limit": 0               // 預設 5;傳 0 取得全日(批次模式用)
}
```

**Output**:`{ best, candidates, mode, date, from:{name,id}, to:{name,id} }`

### ⚠️ TDX 免費版速率限制:5 次/分鐘/金鑰

**不是 5 次/秒**,很容易誤判。設計時必須最小化 TDX 呼叫次數:

- ✅ 站號表 `STATION_MAP` 寫死在 Edge Function 內(245 站),不要動態抓 `/Station` API
- ✅ Edge Function 模組層快取 OAuth token(有效 1 天)
- ✅ 批次更新「整批只打 2 次 TDX」策略(見下)
- ✅ Edge Function 內建 429 退避重試(0.8s → 2s → 4s)

### 批次重抓策略(重要)

「🔄 全部重抓台鐵」絕對不能逐班查詢(30 班 × 2 方向 = 60 次,遠超 5/分限制)。

正確做法(`openTdxBatch`):
1. 對 OD 配對 home→work 打 1 次 TDX,`time="23:59"` `limit:0` 取得全日所有車次
2. 對 OD 配對 work→home 打 1 次 TDX,`time="00:00"` `limit:0` 取得全日所有車次
3. 兩次間隔 800ms(保險)
4. **前端在記憶體裡**為每個班次跑 `_pickBefore()` / `_pickAfter()` 篩出最佳車

整批永遠只 2 次 TDX 呼叫,與班次數無關。

### 🚨 `depTrain` / `arrTrain` 不是通勤車次

工作班物件有 4 個「車次/時間」相關欄位,語意完全不同:

| 欄位 | 用途 |
|---|---|
| `boardTime` | 通勤上班搭車時間(**TDX 查詢會更新**) |
| `alightTime` | 通勤下班搭車時間(**TDX 查詢會更新**) |
| `depTrain` | **Stan 上班要駕駛的首班車次**(TDX 查詢**絕對不可覆寫**) |
| `arrTrain` | **Stan 下班要駕駛的末班車次**(TDX 查詢**絕對不可覆寫**) |

`depTrain`/`arrTrain` 是 Stan 作為司機員實際駕駛的列車,與通勤搭車毫無關係。早期版本曾把 TDX 查到的通勤車次寫入這兩個欄位,是錯的。

TDX picker 跟批次更新都只動 `boardTime` / `alightTime`,車次號僅作參考顯示。

### CSS Class 命名避坑

- **`.cc-type`**:月曆 cell 的類型文字(「例假」「休班」等),CSS 已定義樣式
- **`.commute-type-cb`**:通勤 Modal 的車種 checkbox(不可改用 `.cc-type`,會被月曆樣式污染)

## 即時查車分頁(livetrain)

獨立的 TDX 即時查詢工具,與通勤資訊**完全無關**(不共用 OD、不共用車種偏好)。

- **位置**:nav 第三個 tab「⇄ 即時查車」,全用戶可見(不限 edit mode)
- **頁面 id**:`page-livetrain`
- **三站固定**:松竹 / 臺中 / 彰化(pill 按鈕,硬編碼在 HTML 內,要改站名要兩個 row 都改)
- **showPage idx 對照**:`{home:0, calendar:1, livetrain:2, schedule:3, shifts:4}`

### 狀態變數

```js
let _liveFrom = '';      // 起站
let _liveTo = '';        // 迄站
let _liveResults = [];   // TDX 回傳的 candidates,過了現在時間的會被過濾掉
let _liveLoading = false;
let _liveTimer = null;   // 60 秒 setInterval,更新倒數
```

不持久化(不 localStorage、不 Supabase),純 module-scope。換頁回來會保留選擇,重新整理頁面則重置。

### 操作行為(重要)

- **進頁不自動查**,user 必須手動按「🔄 查詢」
- **改起/迄站、按交換**:只更新狀態 + 清空 `_liveResults`,**不打 TDX**
- **起=迄防呆**:選到一樣會把另一邊清空
- **過了現在時間的車自動消失**:`_renderLiveResults()` 每次都 filter `depMin >= nowMin`
- **倒數更新**:`_startLiveTimer()` setInterval 60 秒,page 不在 active 時自動清掉

### TDX 呼叫

直接打 `tdx-search` Edge Function,**不快取**:
```js
{ fromStation:_liveFrom, toStation:_liveTo, mode:'after', time:<現在 HH:MM>, date:<今天>, limit:5, includeDelay:true }
```

沒帶 `trainTypes` → 顯示全部車種。

⚠️ 每次查詢實際打 TDX **2 次**(時刻表 + TrainLiveBoard),仍受 5 次/分鐘限制,但這頁是「手動觸發」,user 自己掌控節奏,不太會撞牆。

### 誤點/準點顯示

`includeDelay:true` 會讓 Edge Function 加打 `/Rail/TRA/TrainLiveBoard`(不帶路徑參數,回**全臺鐵當下所有運行中車次** ~150 班),用 TrainNo 對齊候選車次,附上 `delayMin` 欄位。

前端顯示邏輯:
| `delayMin` | 顯示 |
|---|---|
| `> 0` | 紅色「誤點 N 分」(`#ef4444`,`.live-card-delay`) |
| `=== 0` | 綠色「準點」(`#10b981`,`.live-card-ontime`) |
| `undefined` | 不顯示(車次還沒進入運行範圍,無即時資料) |

**踩過的坑**:原本用 `StationLiveBoard/Station/{StationID}` 只回 ~2-5 班「即將進站」車次,且不分方向,跟我們 OD 候選車次幾乎沒交集。改用 `/TrainLiveBoard` 全臺鐵列表後才能對齊。

⚠️ **誤點/準點只適用即時查車**。工作班 picker 跟批次更新查的是「明天」的時刻,誤點資料是「今天即時」,意義不對 → 那兩處不傳 `includeDelay`。

### 站名「臺」vs「台」

TDX 用「**臺**中」(傳統字),UI pill 也用「臺中」。**Edge Function 不做 normalize**,所以前端傳入的站名必須跟 `STATION_MAP` key 完全一致。

如果之後想加更多站,記得查 `STATION_MAP` 的 key 是「臺」還是「台」(縱貫線多用「臺」)。
