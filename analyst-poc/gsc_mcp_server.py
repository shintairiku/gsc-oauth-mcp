"""
③ MCP サーバー骨格 — PoC実装
LLMがツールとして呼び出せる形にGSC APIをラップします。

必要なライブラリ:
  pip install mcp

使い方:
  python gsc_mcp_server.py
"""

import asyncio
from datetime import date, timedelta

import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from gsc_auth import get_credentials, get_gsc_service

# =====================
# 設定
# =====================
SITE_URL = "https://shintairiku.jp/"  # ご自身のサイトURLに変更

END_DATE = date.today() - timedelta(days=3)
START_DATE = END_DATE - timedelta(days=29)

# =====================
# GSCサービス初期化
# =====================
creds = get_credentials()
gsc = get_gsc_service(creds)

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