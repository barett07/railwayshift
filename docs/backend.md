# 後端:資安架構、iCal、部署

## 資安架構(重要)

### 管理員模式
- **網址**:`?admin=1`(舊的 `?edit=1` 已廢棄)
- 頁面載入時立即呼叫 `_initAdminAuth()`,透過後端驗證密碼後才套用 `edit-mode` class
- 密碼存在 `localStorage['rw_write_token']`;驗證失敗或 key 不存在則跳出密碼框(不可關閉)
- 密碼框期間 `_adminAuthPending = true`,overlay click 不關閉

### 寫入保護
- `app_data` 的 RLS:anon 只能 SELECT,**不能寫入**
- 所有寫入走 Edge Function `write-data`,帶 `X-Write-Token` header(Supabase Secret `WRITE_SECRET`)
- `dbSet()` 自動呼叫 `_requireWT()` 取得 token;若 Edge Function 回 401 → 清除 localStorage token + 拋出錯誤

### XSS 防護
- `escapeHtml()` 定義在 JS 頂部(STATE 區塊上方)
- **建立或修改任何 innerHTML 時,使用者資料(shift.name、shift.specialNote、info.note、info.shiftId)都必須套用 `escapeHtml()`**

### CORS
- `tdx-search`:限定 `https://barett07.github.io`
- `write-data`:限定 `https://barett07.github.io`
- `calendar`:保留 `*`(Apple / Google Calendar 訂閱用)
- **本機開發繞過**:`_verifyToken()` 在 `localhost` / `127.0.0.1` 時直接接受非空 token,不打 Supabase(寫入仍因 CORS 失敗,僅供 UI 測試用)

### Supabase Secret
- `WRITE_SECRET`:寫入密碼,Stan 自行設定,不在程式碼裡

## Apple Calendar Integration(iCal)

A Supabase Edge Function generates a live `.ics` feed for Apple Calendar subscription.

- **Source**: `supabase/functions/calendar/index.ts`
- **Endpoint**: `https://oqyjixphmdrhcmomskth.supabase.co/functions/v1/calendar` (public, no JWT)
- **Covers**: work days only, events span `startTime` → `endTime`, 30-min alarm

**Critical**: `isOvernight` on shift objects imported from Excel is always `false` (hardcoded in `parseXLSX`). Do NOT rely on this field to detect overnight shifts. Use time-string comparison instead: `endTime <= startTime` means the shift spans midnight.

**Variant shift fallback**: If a shiftId like `576V` is not found in the shift map, the Edge Function strips the suffix (`V`/`AV`) and retries with the base ID.

**iCal 格式注意事項(踩過的坑)**:
- `DTSTART;TZID=Asia/Taipei` 一定要搭配 `BEGIN:VTIMEZONE` 區塊,否則 Google Calendar 拒絕解析(顯示「無法新增日曆」)。calendar/index.ts 已在 VCALENDAR header 後面加入完整的 VTIMEZONE 區塊。
- `lines.join('\r\n')` 後要加 `+ '\r\n'`,最後一行才有正確結尾。

## 部署 Edge Function

**一律執行 `./deploy.sh`**——依 `supabase/config.toml` 的 verify_jwt 設定部署三個 function,並自動驗證(calendar 免 JWT 回 iCal、write-data/tdx-search 被閘道要求 JWT)。

手動部署(不建議)等同:
```bash
cd "/Users/stan/Claude Code/railwayshift"
supabase functions deploy write-data --project-ref oqyjixphmdrhcmomskth
supabase functions deploy tdx-search --project-ref oqyjixphmdrhcmomskth
supabase functions deploy calendar --project-ref oqyjixphmdrhcmomskth   # config.toml 已設 verify_jwt=false
```

⚠️ **verify_jwt 陷阱**(stock-tracker 曾因此連續失敗 6 週):`calendar` 必須 `verify_jwt = false`(Apple/Google 訂閱端不帶 JWT)。CLI 要帶 `--no-verify-jwt`;用 Supabase MCP `deploy_edge_function` 部署時**預設是 true**,必須明確傳 `verify_jwt: false`。`write-data`/`tdx-search` 則維持 true(前端帶 anon key 呼叫,多一層閘道保護)。

## 區網預覽的管理模式與存檔提示(2026-07-26)

**管理模式登入**:`_verifyToken()` 會打 `write-data` 的 `{verify:true}`,但 CORS 白名單只有
`https://barett07.github.io`。從區網 IP 預覽時 fetch 被擋 → 例外被 `catch` 吞掉 → 回傳 false
→ 畫面顯示**「密碼錯誤，請重試」**,密碼其實是對的。

`isPreviewHost()` 一度放行 localhost、`.local` 與三段私有 IP(`10/8`、`192.168/16`、`172.16/12`),
**同日稍晚收回成只認 `localhost` / `127.0.0.1`**——改用 iOS 模擬器測試後,模擬器開的是
`http://localhost:<port>/`,私有網段那幾段永遠不會執行,留著只是放著一段會放寬驗證的死碼。

要恢復手機區網預覽時,把私有網段加回 `isPreviewHost()`:
```js
|| h.endsWith('.local') || /^10\./.test(h) || /^192\.168\./.test(h)
|| /^172\.(1[6-9]|2\d|3[01])\./.test(h)
```

正式網域任何版本都不符合,線上不會觸發。旁路只放行 UI,寫入仍被 CORS 擋。
**不要放寬 `write-data` 的 CORS 白名單**來解這個問題。
同一套 `isPreviewHost()` 也用在 railwayroster 與 familycal,三者要一起改。

**存檔提示**:`push*()` 原本把 `dbSet()` 的錯誤 `catch` 起來只印 console,Promise 照樣 resolve,
呼叫端無條件顯示「已儲存」。實際上雲端寫入失敗(CORS、401 密碼過期、網路異常)時只寫進了
localStorage,下次 `initDB()` 的 `loadRemote()` 會用伺服器資料覆蓋掉,改動靜默消失。

已改為 `push*()` 回傳 `'synced'` / `'local'`,14 個呼叫端一律走 `toastSaved(st, okMsg)`:
同步成功顯示原訊息(綠),只存到本機顯示紅色警告。**新增 `push*()` 呼叫端時必須用 `toastSaved()`,
不要直接 `toast('...','ok')`。**
