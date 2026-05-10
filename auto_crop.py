#!/usr/bin/env python3
"""
用圖像分析偵測格線，搭配 ocrmac 命名，裁切交番表 JPG 成個別班卡圖片。
輸出到 images_new/，確認沒問題後再手動覆蓋 images/。

用法：
  .venv/bin/python3 auto_crop.py
"""

import numpy as np
from ocrmac.ocrmac import text_from_image
from PIL import Image
import re, os

IMG1 = '/Users/stan/Claude Code/railwayshift/1150409班表/115年04月09日新彰機交番表1.jpg'
IMG2 = '/Users/stan/Claude Code/railwayshift/1150409班表/115年04月09日新彰機交番表2.jpg'
OUT  = '/Users/stan/Claude Code/railwayshift/images_new'

DARK_THRESHOLD  = 60    # 全圖垂直線 & 圖1 水平線偵測門檻
ROW_THRESHOLD   = 100   # 圖2 逐欄水平線偵測門檻（稍寬，抓較淡分隔線）
PAIR_MAX_GAP    = 200   # 兩條相鄰線距離小於此視為同一 narrow strip
MIN_CARD_H      = 280   # 最小格高（過濾底部圖例）
MIN_CARD_W      = 100   # 最小格寬（過濾零寬欄）


def detect_lines(signal, threshold, min_run=3):
    """在一維亮度向量中找暗線，回傳每條線的中心座標"""
    dark = np.where(signal < threshold)[0]
    if not len(dark):
        return []
    lines, run = [], [dark[0]]
    for x in dark[1:]:
        if x - run[-1] <= 3:
            run.append(x)
        else:
            if len(run) >= min_run:
                lines.append(int(np.mean(run)))
            run = [x]
    if len(run) >= min_run:
        lines.append(int(np.mean(run)))
    return lines


def find_dark_vlines(arr):
    """找全圖垂直黑線（欄邊界）"""
    h, w = arr.shape[:2]
    gray = arr.mean(axis=2)
    region = gray[int(h * 0.20):int(h * 0.80), :]
    return detect_lines(region.mean(axis=0), DARK_THRESHOLD)


def find_dark_hlines(arr, threshold=DARK_THRESHOLD):
    """找全圖水平黑線"""
    h, w = arr.shape[:2]
    gray = arr.mean(axis=2)
    region = gray[:, int(w * 0.05):int(w * 0.95)]
    return detect_lines(region.mean(axis=1), threshold)


def lines_to_bounds(lines, end_max):
    """把線座標轉成 [(start, end), ...]，成對窄條視為分隔線，MIN_CARD_H 過濾"""
    cell_starts = []
    i = 0
    while i < len(lines):
        cell_starts.append(lines[i])
        if i + 1 < len(lines) and lines[i + 1] - lines[i] < PAIR_MAX_GAP:
            i += 2
        else:
            i += 1
    bounds = []
    for j, start in enumerate(cell_starts):
        end = cell_starts[j + 1] if j + 1 < len(cell_starts) else end_max
        if end - start >= MIN_CARD_H:
            bounds.append((start, end))
    return bounds


def vlines_to_col_bounds(vlines, img_w):
    """把垂直線轉成欄邊界 [(x1, x2), ...]"""
    cell_starts = []
    i = 0
    while i < len(vlines):
        cell_starts.append(vlines[i])
        if i + 1 < len(vlines) and vlines[i + 1] - vlines[i] < PAIR_MAX_GAP:
            i += 2
        else:
            i += 1
    return [(cell_starts[j], cell_starts[j + 1] if j + 1 < len(cell_starts) else img_w)
            for j in range(len(cell_starts))]


def find_row_bounds_in_col(arr, x1, x2, y_start, y_end, threshold=ROW_THRESHOLD):
    """在指定欄範圍內逐行掃描找水平分隔線，回傳列邊界"""
    col_gray = arr[y_start:y_end, x1:x2].mean(axis=2)
    row_avg = col_gray.mean(axis=1)
    lines_rel = detect_lines(row_avg, threshold)
    # 真正的分隔線會橫跨整欄；過濾掉卡片內容產生的假線（<80% 暗像素）
    lines_rel = [l for l in lines_rel if (col_gray[l] < threshold).mean() >= 0.80]
    abs_lines = [y_start + l for l in lines_rel]
    return lines_to_bounds(abs_lines, y_end)


def read_shift_numbers(narrow_crop):
    """對 narrow strip 裁圖用 ocrmac 讀出班次號（可能有多個，如 510 + 510AV）"""
    results = text_from_image(
        narrow_crop,
        recognition_level='accurate',
        language_preference=['zh-Hant', 'en-US'],
    )
    nums = []
    for text, conf, _ in results:
        clean = re.sub(r'\s', '', text)
        if re.fullmatch(r'5\d{2}[AV]*', clean) or \
           re.fullmatch(r'5R\d+', clean) or \
           re.fullmatch(r'X\d+[A-Z]*', clean):
            if conf >= 0.3 and clean not in nums:
                nums.append(clean)
    return nums


def process(img_path, label, row_threshold=ROW_THRESHOLD, ocr_top_only=False):
    print(f'\n=== {label} ===')
    img = Image.open(img_path).convert('RGB')
    arr = np.array(img)
    h, w = arr.shape[:2]

    vlines     = find_dark_vlines(arr)
    col_bounds = vlines_to_col_bounds(vlines, w)

    hlines_global = find_dark_hlines(arr, threshold=DARK_THRESHOLD)
    y_start = hlines_global[0]  if hlines_global else 0
    y_end   = hlines_global[-1] if hlines_global else h

    pairs    = [(vlines[i], vlines[i + 1]) for i in range(len(vlines) - 1)
                if vlines[i + 1] - vlines[i] < PAIR_MAX_GAP]
    narrow_w = (max(b - a for a, b in pairs) + 20) if pairs else 150

    print(f'  欄數={len(col_bounds)}，逐欄偵測（threshold={row_threshold}）')

    cells = []
    for cx, (x1, x2) in enumerate(col_bounds):
        if x2 - x1 < MIN_CARD_W:
            continue

        row_bounds = find_row_bounds_in_col(arr, x1, x2, y_start, y_end, threshold=row_threshold)

        for y1, y2 in row_bounds:
            # 圖2 的班次號在格頂 header strip；圖1 班次號在格中，需掃全高
            ocr_y2  = min(y1 + 200, y2) if ocr_top_only else y2
            ns_crop = img.crop((x1, y1, min(x1 + narrow_w, x2), ocr_y2))
            nums    = read_shift_numbers(ns_crop)
            if not nums:
                continue
            full_crop = img.crop((x1, y1, x2, y2))
            cells.append((nums, full_crop))
            print(f'  欄{cx + 1} y={y1}~{y2}: {nums}')

    return cells


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.jpeg'):
            os.remove(os.path.join(OUT, f))

    # 圖1 逐欄 threshold=60（含欄6特殊邊界），圖2 逐欄 threshold=100
    all_cells = process(IMG1, '圖1', row_threshold=DARK_THRESHOLD, ocr_top_only=False) + \
                process(IMG2, '圖2', row_threshold=ROW_THRESHOLD,  ocr_top_only=True)

    seen, saved, dup = set(), 0, 0
    print('\n=== 儲存 ===')
    for nums, crop in all_cells:
        for num in nums:
            if num in seen:
                print(f'  ! 重複 {num}，略過')
                dup += 1
                continue
            seen.add(num)
            crop.save(os.path.join(OUT, f'{num}.jpeg'), 'JPEG', quality=95)
            print(f'  ✓ {num}')
            saved += 1

    print(f'\n完成！共 {saved} 張存至 {OUT}，略過重複 {dup} 張')
    print('確認結果沒問題後，執行以下指令覆蓋正式資料夾：')
    print('  cp images_new/*.jpeg images/')


if __name__ == '__main__':
    main()
