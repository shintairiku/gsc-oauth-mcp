"""
③ MCP サーバー骨格 — PoC実装
LLMがツールとして呼び出せる形にGSC APIをラップします。

必要なライブラリ:
  pip install mcp

使い方:
  python gsc_mcp_server.py
"""

import asyncio
import os
from datetime import date, timedelta

import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from gsc_auth import (
    get_credentials,
    get_ga4_admin_service,
    get_ga4_data_service,
    get_gsc_service,
)

# =====================
# 設定
# =====================
SITE_URL = "https://shintairiku.jp/"  # ご自身のサイトURLに変更
GA4_PROPERTY_ID = os.getenv("GA4_PROPERTY_ID", "").strip()

END_DATE = date.today() - timedelta(days=3)
START_DATE = END_DATE - timedelta(days=29)
GA4_END_DATE = date.today() - timedelta(days=1)
GA4_START_DATE = GA4_END_DATE - timedelta(days=29)

# =====================
# GSC/GA4サービス初期化
# =====================
creds = get_credentials()
gsc = get_gsc_service(creds)
ga4_data = get_ga4_data_service(creds)
ga4_admin = get_ga4_admin_service(creds)

# =====================
# MCPサーバー定義
# =====================
server = Server("gsc-mcp-server")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    """LLMが呼び出せるツール一覧を返す"""
    return [
        types.Tool(
            name="list_sites",
            description="Google Search Consoleで管理しているサイト一覧を返す",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": [],
            },
        ),
        types.Tool(
            name="get_search_analytics",
            description=(
                "指定したdimensionでGSCのパフォーマンスデータ（クリック数・表示回数・CTR・掲載順位）を取得する。"
                "dimensionには query / page / date / device / country のいずれかを指定。"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "dimension": {
                        "type": "string",
                        "enum": ["query", "page", "date", "device", "country"],
                        "description": "集計軸",
                    },
                    "row_limit": {
                        "type": "integer",
                        "default": 10,
                        "description": "取得件数（最大25000）",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "集計開始日 YYYY-MM-DD（省略時: 直近30日）",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "集計終了日 YYYY-MM-DD（省略時: 3日前）",
                    },
                },
                "required": ["dimension"],
            },
        ),
        types.Tool(
            name="inspect_url",
            description="指定URLのインデックス状況をGoogle Search Consoleで確認する",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "調査対象のページURL",
                    },
                },
                "required": ["url"],
            },
        ),
        types.Tool(
            name="list_ga4_properties",
            description="Google Analytics 4 の参照可能なプロパティ一覧を返す",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": [],
            },
        ),
        types.Tool(
            name="get_ga4_report",
            description=(
                "GA4 Data APIでレポートを取得する。"
                "metrics/dimensions は GA4 API の正式名を指定する。"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "property_id": {
                        "type": "string",
                        "description": "GA4プロパティID（省略時は環境変数 GA4_PROPERTY_ID）",
                    },
                    "metrics": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "指標名配列（例: ['sessions', 'activeUsers']）",
                    },
                    "dimensions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "ディメンション名配列（例: ['date']）",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "集計開始日 YYYY-MM-DD（省略時: 直近30日）",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "集計終了日 YYYY-MM-DD（省略時: 昨日）",
                    },
                    "row_limit": {
                        "type": "integer",
                        "default": 10,
                        "description": "取得件数（最大10000）",
                    },
                    "order_by_metric": {
                        "type": "string",
                        "description": "降順ソートする指標名（省略時は metrics の先頭）",
                    },
                },
                "required": ["metrics"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    """ツール呼び出しのハンドラー"""

    if name == "list_sites":
        result = gsc.sites().list().execute()
        sites = result.get("siteEntry", [])
        text = "\n".join(
            f"- {s['siteUrl']} (権限: {s['permissionLevel']})" for s in sites
        ) or "サイトが見つかりませんでした"

    elif name == "get_search_analytics":
        dimension = arguments["dimension"]
        row_limit = arguments.get("row_limit", 10)
        start = arguments.get("start_date", START_DATE.isoformat())
        end = arguments.get("end_date", END_DATE.isoformat())

        body = {
            "startDate": start,
            "endDate": end,
            "dimensions": [dimension],
            "rowLimit": row_limit,
            "orderBy": [{"fieldName": "clicks", "sortOrder": "DESCENDING"}],
        }
        response = gsc.searchanalytics().query(siteUrl=SITE_URL, body=body).execute()
        rows = response.get("rows", [])

        lines = [f"期間: {start} 〜 {end} / dimension: {dimension}\n"]
        for row in rows:
            key = row["keys"][0]
            lines.append(
                f"{key} | clicks:{row['clicks']} impressions:{row['impressions']} "
                f"ctr:{row['ctr']*100:.1f}% position:{row['position']:.1f}"
            )
        text = "\n".join(lines) if rows else "データなし"

    elif name == "inspect_url":
        url = arguments["url"]
        body = {"inspectionUrl": url, "siteUrl": SITE_URL}
        response = gsc.urlInspection().index().inspect(body=body).execute()
        result = response.get("inspectionResult", {})
        index_status = result.get("indexStatusResult", {})
        text = (
            f"URL: {url}\n"
            f"インデックス状況: {index_status.get('verdict', '不明')}\n"
            f"最終クロール: {index_status.get('lastCrawlTime', '不明')}\n"
            f"クロール許可: {index_status.get('robotsTxtState', '不明')}\n"
            f"インデックス許可: {index_status.get('indexingState', '不明')}"
        )

    elif name == "list_ga4_properties":
        response = ga4_admin.accountSummaries().list(pageSize=200).execute()
        account_summaries = response.get("accountSummaries", [])
        lines = []
        for account in account_summaries:
            account_name = account.get("account", "不明")
            for prop in account.get("propertySummaries", []):
                prop_name = prop.get("property", "")
                prop_id = prop_name.split("/")[-1] if "/" in prop_name else prop_name
                lines.append(
                    f"- property_id:{prop_id} display_name:{prop.get('displayName', '名称なし')} "
                    f"account:{account_name} property_type:{prop.get('propertyType', '不明')}"
                )
        text = "\n".join(lines) if lines else "GA4プロパティが見つかりませんでした"

    elif name == "get_ga4_report":
        metrics = arguments["metrics"]
        dimensions = arguments.get("dimensions", [])
        row_limit = min(int(arguments.get("row_limit", 10)), 10000)
        start = arguments.get("start_date", GA4_START_DATE.isoformat())
        end = arguments.get("end_date", GA4_END_DATE.isoformat())

        property_id = str(arguments.get("property_id", GA4_PROPERTY_ID)).strip()
        if not property_id:
            text = (
                "GA4 property_id が未指定です。"
                "ツール引数 property_id か環境変数 GA4_PROPERTY_ID を設定してください。"
            )
            return [types.TextContent(type="text", text=text)]

        body = {
            "dateRanges": [{"startDate": start, "endDate": end}],
            "metrics": [{"name": m} for m in metrics],
            "dimensions": [{"name": d} for d in dimensions],
            "limit": row_limit,
        }

        order_metric = arguments.get("order_by_metric") or metrics[0]
        body["orderBys"] = [
            {"metric": {"metricName": order_metric}, "desc": True},
        ]

        response = ga4_data.properties().runReport(
            property=f"properties/{property_id}",
            body=body,
        ).execute()
        rows = response.get("rows", [])

        lines = [
            (
                f"property_id: {property_id} / 期間: {start} 〜 {end}\n"
                f"dimensions: {dimensions if dimensions else 'なし'} / metrics: {metrics}"
            )
        ]
        for row in rows:
            dim_values = [v.get("value", "") for v in row.get("dimensionValues", [])]
            metric_values = [v.get("value", "") for v in row.get("metricValues", [])]

            dim_text = ", ".join(
                f"{k}:{v}" for k, v in zip(dimensions, dim_values, strict=False)
            ) or "(dimensionなし)"
            metric_text = ", ".join(
                f"{k}:{v}" for k, v in zip(metrics, metric_values, strict=False)
            )
            lines.append(f"{dim_text} | {metric_text}")
        text = "\n".join(lines) if rows else "GA4データなし"

    else:
        text = f"未知のツール: {name}"

    return [types.TextContent(type="text", text=text)]


# =====================
# エントリーポイント
# =====================
async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


asyncio.run(main())
