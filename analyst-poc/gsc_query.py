"""
② GSC API 疎通確認 — PoC実装
gsc_auth.py の get_credentials(), get_gsc_service() を再利用します。
実行前に gsc_auth.py と同じディレクトリに置いてください。

使い方:
  python gsc_query.py
"""

from datetime import date, timedelta
from gsc_auth import get_credentials, get_gsc_service

# =====================
# 設定
# =====================
# GSCに登録済みのサイトURLに書き換えてください
# 例: "https://example.com/" or "sc-domain:example.com"
SITE_URL = "https://shintairiku.jp/"

# 集計期間（直近30日）
END_DATE = date.today() - timedelta(days=3)   # GSCは3日前までのデータ
START_DATE = END_DATE - timedelta(days=29)


def query_search_analytics(service, dimensions: list[str], row_limit: int = 10) -> list[dict]:
    """
    searchanalytics.query を呼び出してデータを返す。

    dimensions の指定例:
      ["query"]          → キーワード別
      ["page"]           → ページURL別
      ["query", "page"]  → キーワード × ページ別
      ["date"]           → 日別推移
      ["country"]        → 国別
      ["device"]         → デバイス別
    """
    request_body = {
        "startDate": START_DATE.isoformat(),
        "endDate": END_DATE.isoformat(),
        "dimensions": dimensions,
        "rowLimit": row_limit,
        "orderBy": [{"fieldName": "clicks", "sortOrder": "DESCENDING"}],
    }
    response = service.searchanalytics().query(siteUrl=SITE_URL, body=request_body).execute()
    return response.get("rows", [])


def print_rows(title: str, rows: list[dict], dimensions: list[str]) -> None:
    print(f"\n{'='*50}")
    print(f"  {title}")
    print(f"  期間: {START_DATE} 〜 {END_DATE}")
    print(f"{'='*50}")
    if not rows:
        print("  データなし")
        return

    header = " | ".join(f"{d:<30}" for d in dimensions) + " | clicks | impressions |   CTR  | position"
    print(header)
    print("-" * len(header))

    for row in rows:
        keys = " | ".join(f"{k:<30}" for k in row["keys"])
        clicks      = row["clicks"]
        impressions = row["impressions"]
        ctr         = row["ctr"] * 100
        position    = row["position"]
        print(f"{keys} | {clicks:>6} | {impressions:>11} | {ctr:>5.1f}% | {position:>8.1f}")


if __name__ == "__main__":
    print("[STEP 1] 認証...")
    creds = get_credentials()
    service = get_gsc_service(creds)
    print(f"[STEP 2] サイト: {SITE_URL}")

    # --- ① キーワード別 TOP10 ---
    rows = query_search_analytics(service, dimensions=["query"])
    print_rows("キーワード別 TOP10（クリック数順）", rows, ["query"])

    # --- ② ページ別 TOP10 ---
    rows = query_search_analytics(service, dimensions=["page"])
    print_rows("ページ別 TOP10（クリック数順）", rows, ["page"])

    # --- ③ 日別推移（直近30日）---
    rows = query_search_analytics(service, dimensions=["date"], row_limit=30)
    print_rows("日別推移", rows, ["date"])

    # --- ④ デバイス別 ---
    rows = query_search_analytics(service, dimensions=["device"], row_limit=5)
    print_rows("デバイス別", rows, ["device"])

    print("\n[DONE] 疎通確認完了")