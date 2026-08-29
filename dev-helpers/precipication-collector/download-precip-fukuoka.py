#!/usr/bin/env python3
"""
tenki.jp 福岡県(pref-43) 雨雲レーダー画像 一括ダウンロードスクリプト

URL形式:
  https://storage.tenki.jp/archive/radar/YYYY/MM/DD/hh/00/00/pref-43-large.jpg

保存ファイル名:
  precip-43-YYYYMMDD-hh.jpg

使い方:
  python3 download_tenki_radar.py --start 2025-01-01 --end 2026-08-08 --outdir ./images

特徴:
  - 1時間ごとにダウンロード（mm/ss は 00/00 固定）
  - 既にダウンロード済みのファイルはスキップ（再実行で途中から再開可能）
  - 404 (その時刻の画像が存在しない) は失敗リストに記録して続行
  - サーバへの配慮のため、リクエスト間に待機時間を入れる（--delay で調整）
  - 一時的なエラーはリトライ（指数バックオフ）
  - 進捗と失敗ログをファイルに出力
"""

import argparse
import csv
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests

BASE_URL = "https://storage.tenki.jp/archive/radar/{y:04d}/{m:02d}/{d:02d}/{h:02d}/00/00/pref-43-large.jpg"
FILENAME_FMT = "precip-43-{y:04d}{m:02d}{d:02d}-{h:02d}.jpg"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; research-script/1.0)"
}


def daterange_hours(start: datetime, end: datetime):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(hours=1)


def download_one(session, dt: datetime, outdir: Path, delay: float,
                  max_retries: int = 3, timeout: float = 15.0):
    url = BASE_URL.format(y=dt.year, m=dt.month, d=dt.day, h=dt.hour)
    fname = FILENAME_FMT.format(y=dt.year, m=dt.month, d=dt.day, h=dt.hour)
    out_path = outdir / fname

    if out_path.exists() and out_path.stat().st_size > 0:
        return "skipped", fname

    backoff = 1.0
    for attempt in range(1, max_retries + 1):
        try:
            resp = session.get(url, headers=HEADERS, timeout=timeout)
        except requests.RequestException as e:
            if attempt == max_retries:
                return f"error:{e}", fname
            time.sleep(backoff)
            backoff *= 2
            continue

        if resp.status_code == 200 and resp.content:
            out_path.write_bytes(resp.content)
            return "ok", fname
        elif resp.status_code == 404:
            # その時刻の画像は存在しない（欠測）
            return "not_found", fname
        elif resp.status_code in (429, 500, 502, 503, 504):
            # レート制限・一時エラー -> リトライ
            if attempt == max_retries:
                return f"error:http{resp.status_code}", fname
            time.sleep(backoff)
            backoff *= 2
            continue
        else:
            return f"error:http{resp.status_code}", fname

    return "error:max_retries", fname


def main():
    ap = argparse.ArgumentParser(description="tenki.jp 雨雲レーダー画像 一括ダウンロード")
    ap.add_argument("--start", required=True, help="開始日 (YYYY-MM-DD, 00時から)")
    ap.add_argument("--end", required=True, help="終了日 (YYYY-MM-DD, 23時まで含む)")
    ap.add_argument("--outdir", default="./images", help="保存先ディレクトリ")
    ap.add_argument("--delay", type=float, default=0.5, help="リクエスト間隔（秒）")
    ap.add_argument("--log", default="download_log.csv", help="結果ログCSVのパス")
    args = ap.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d")
    end = datetime.strptime(args.end, "%Y-%m-%d").replace(hour=23)

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    hours = list(daterange_hours(start, end))
    total = len(hours)
    print(f"対象: {start} 〜 {end} ({total}件、1時間ごと)")

    session = requests.Session()
    log_path = Path(args.log)
    log_exists = log_path.exists()
    log_f = open(log_path, "a", newline="", encoding="utf-8")
    writer = csv.writer(log_f)
    if not log_exists:
        writer.writerow(["datetime", "filename", "result"])

    counts = {"ok": 0, "skipped": 0, "not_found": 0, "error": 0}

    try:
        for i, dt in enumerate(hours, 1):
            result, fname = download_one(session, dt, outdir, args.delay)
            writer.writerow([dt.isoformat(), fname, result])
            log_f.flush()

            if result == "ok":
                counts["ok"] += 1
            elif result == "skipped":
                counts["skipped"] += 1
            elif result == "not_found":
                counts["not_found"] += 1
            else:
                counts["error"] += 1

            if i % 50 == 0 or i == total:
                print(f"[{i}/{total}] ok={counts['ok']} skip={counts['skipped']} "
                      f"not_found={counts['not_found']} error={counts['error']}")

            # 既にファイルがある(skip)場合は待たずに次へ、実際に通信した場合のみ待機
            if result != "skipped":
                time.sleep(args.delay)
    except KeyboardInterrupt:
        print("\n中断されました。再度同じコマンドを実行すると、"
              "ダウンロード済みファイルはスキップして続きから再開します。")
    finally:
        log_f.close()

    print("\n=== 完了 ===")
    print(counts)
    print(f"保存先: {outdir.resolve()}")
    print(f"ログ: {log_path.resolve()}")


if __name__ == "__main__":
    main()

