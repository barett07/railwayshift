# 班卡圖片裁切腳本(auto_crop.py,備用)

> **日常裁切已改用獨立專案 `shift-cropper` 的 GUI App**(雙擊 `班表裁切工具.app`),核心邏輯即移植自本腳本。`auto_crop.py` 保留作為備用/參數校正參考。

**`auto_crop.py`** — 用 ocrmac (macOS Vision OCR) + numpy 偵測班表 JPG 格線,自動裁切成個別班卡 JPEG。

**執行環境:** `.venv/`(Python 3.13,已安裝 ocrmac、numpy、Pillow)

```bash
.venv/bin/python3 auto_crop.py
```

**使用流程:**
1. 把新班表 JPG 放進專案資料夾(例如 `1150509班表/`)
2. 修改 `auto_crop.py` 頂部的 `IMG1` / `IMG2` 路徑
3. 執行腳本 → 結果輸出到 `images_new/`
4. 確認裁切結果沒問題後,`cp images_new/*.jpeg images/`
5. `git add images/ && git commit && git push`

**關鍵參數:**
- 圖1(501–553):逐欄 `threshold=60`,欄6有獨立的水平分隔線位置
- 圖2(554–5R/X 系列):逐欄 `threshold=100` + 80% 暗像素過濾(排除卡片內容假線)
- 圖2 OCR 限制掃描格頂 200px(班次號在 header strip);圖1 掃全高(班次號在格中)
- 班次號 regex:`5\d{2}[AV]*`、`5R\d+`、`X\d+[A-Z]*`

**注意:** `576V` 未出現在 115/04/09 班表,保留自原手動截圖。若格式大改版需重新校正閾值。
