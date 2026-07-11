#!/bin/bash
# 部署 Edge Functions + 自動驗證
# verify_jwt 設定已寫死在 supabase/config.toml,CLI 會自動套用
set -e
cd "$(dirname "$0")"
REF="oqyjixphmdrhcmomskth"
BASE="https://$REF.supabase.co/functions/v1"

for fn in write-data tdx-search calendar; do
  supabase functions deploy "$fn" --project-ref "$REF"
done

echo ""
echo "===== 部署後驗證 ====="
FAIL=0

# calendar:免 JWT,必須直接回 iCal(壞掉 = 行事曆訂閱全滅)
if curl -s "$BASE/calendar" | head -1 | grep -q "BEGIN:VCALENDAR"; then
  echo "✅ calendar 正常(免 JWT 回傳 iCal)"
else
  echo "❌ calendar 異常:verify_jwt 可能被重置成 true,訂閱會壞掉!"
  FAIL=1
fi

# write-data / tdx-search:必須被閘道要求 JWT
for fn in write-data tdx-search; do
  if curl -s -X POST "$BASE/$fn" | grep -qi "authorization header"; then
    echo "✅ $fn 正常(閘道要求 JWT)"
  else
    echo "❌ $fn 未要求 JWT,verify_jwt 可能被改成 false!"
    FAIL=1
  fi
done

exit $FAIL
