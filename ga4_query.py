"""
GA4 API 疎通確認スクリプト — PoC実装
gsc_auth.py の get_credentials(), get_ga4_admin_service(), get_ga4_data_service() を再利用します。

使い方:
  export GA4_PROPERTY_ID="123456789"
  python ga4_query.py
"""

import os
from dotenv import load_dotenv
from datetime import date, timedelta

from gsc_auth import (
    get_credentials,
    get_ga4_admin_service,
    get_ga4_data_service,
)

# =====================
# 設定
# =====================
load_dotenv()
GA4_PROPERTY_ID = os.getenv("GA4_PROPERTY_ID", "").strip()

# 集計期間（直近30日）
END_DATE = date.today() - timedelta(days=1)  # GA4は前日分まで安定
START_DATE = END_DATE - timedelta(days=29)


def list_properties(admin_service) -> list[dict]:
    """参照可能なGA4プロパティ一覧を取得する"""
    response = admin_service.accountSummaries().list(pageSize=200).execute()
    account_summaries = response.get("accountSummaries", [])

    properties = []
    for account in account_summaries:
        account_name = account.get("account", "")
        account_display_name = account.get("displayName", "名称なし")
        for prop in account.get("propertySummaries", []):
            properties.append({
                "name": prop.get("property", ""),
                "displayName": prop.get("displayName", "名称なし"),
                "account": account_name,
                "accountDisplayName": account_display_name,
                "propertyType": prop.get("propertyType", "不明"),
            })

    return properties


def run_report(
    data_service,
    property_id: str,
    dimensions: list[str],
    metrics: list[str],
    row_limit: int = 10,
) -> list[dict]:
    """GA4 Data API runReport を呼び出して行データを返す"""
    body = {
        "dateRanges": [{"startDate": START_DATE.isoformat(), "endDate": END_DATE.isoformat()}],
        "dimensions": [{"name": d} for d in dimensions],
        "metrics": [{"name": m} for m in metrics],
        "orderBys": [{"metric": {"metricName": metrics[0]}, "desc": True}],
        "limit": min(row_limit, 10000),
    }
    response = data_service.properties().runReport(
        property=f"properties/{property_id}",
        body=body,
    ).execute()
    return response.get("rows", [])


def print_properties(properties: list[dict]) -> None:
    print(f"\n{'='*70}")
    print("  参照可能な GA4 プロパティ")
    print(f"{'='*70}")
    if not properties:
        print("  プロパティが見つかりませんでした")
        return

    for prop in properties:
        name = prop.get("name", "")
        prop_id = name.split("/")[-1] if "/" in name else name
        print(
            f"- property_id: {prop_id} | "
            f"display_name: {prop.get('displayName', '名称なし')} | "
            f"account: {prop.get('account', '不明')} | "
            f"property_type: {prop.get('propertyType', '不明')}"
        )


def print_rows(title: str, rows: list[dict], dimensions: list[str], metrics: list[str]) -> None:
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"  期間: {START_DATE} 〜 {END_DATE}")
    print(f"{'='*70}")
    if not rows:
        print("  データなし")
        return

    header = " | ".join(dimensions + metrics)
    print(header)
    print("-" * len(header))

    for row in rows:
        dim_values = [v.get("value", "") for v in row.get("dimensionValues", [])]
        metric_values = [v.get("value", "") for v in row.get("metricValues", [])]
        print(" | ".join(dim_values + metric_values))


if __name__ == "__main__":
    print("[STEP 1] 認証...")
    creds = get_credentials()
    admin_service = get_ga4_admin_service(creds)
    data_service = get_ga4_data_service(creds)

    print("[STEP 2] プロパティ一覧を取得...")
    properties = list_properties(admin_service)
    print_properties(properties)

    if not GA4_PROPERTY_ID:
        print(
            "\n[INFO] GA4_PROPERTY_ID が未設定です。"
            "上記一覧の property_id を環境変数に設定して再実行してください。"
        )
        print('例: export GA4_PROPERTY_ID="123456789"')
        raise SystemExit(0)

    print(f"\n[STEP 3] レポート疎通確認: property_id={GA4_PROPERTY_ID}")

    # --- ① 日別推移 ---
    rows = run_report(
        data_service,
        property_id=GA4_PROPERTY_ID,
        dimensions=["date"],
        metrics=["sessions", "activeUsers"],
        row_limit=30,
    )
    print_rows("日別推移（sessions / activeUsers）", rows, ["date"], ["sessions", "activeUsers"])

    # --- ② 国別 ---
    rows = run_report(
        data_service,
        property_id=GA4_PROPERTY_ID,
        dimensions=["country"],
        metrics=["sessions", "activeUsers"],
        row_limit=10,
    )
    print_rows("国別 TOP10（sessions 順）", rows, ["country"], ["sessions", "activeUsers"])

    # --- ③ デバイス別 ---
    rows = run_report(
        data_service,
        property_id=GA4_PROPERTY_ID,
        dimensions=["deviceCategory"],
        metrics=["sessions", "activeUsers"],
        row_limit=10,
    )
    print_rows("デバイス別（sessions 順）", rows, ["deviceCategory"], ["sessions", "activeUsers"])

    print("\n[DONE] GA4 疎通確認完了")
