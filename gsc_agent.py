"""
④ MCP クライアント + Claude LLM 接続 — PoC実装
gsc_mcp_server.py を子プロセスとして起動し、Claude がツールを呼び出せるようにします。

必要なライブラリ:
  pip install mcp anthropic

使い方:
  export ANTHROPIC_API_KEY="sk-ant-..."
  python gsc_agent.py
"""

import asyncio
import os
from dotenv import load_dotenv
import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# =====================
# 設定
# =====================
# ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
load_dotenv()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """
あなたはGoogle Search Console(GSC) と Google Analytics 4(GA4) のデータアナリストです。
ユーザーの質問に答えるために、利用可能なツールを積極的に呼び出してください。

利用可能なツール:
- list_sites: GSC管理サイト一覧を取得
- get_search_analytics: GSCのキーワード・ページ・日別・デバイス・国別データを取得
- inspect_url: GSCで特定URLのインデックス状況を確認
- list_ga4_properties: GA4プロパティ一覧を取得
- get_ga4_report: GA4レポートを取得

データを取得したら、数字を引用しながら日本語で分かりやすく回答してください。
"""

# =====================
# MCPツールをAnthropicのtool形式に変換
# =====================
def mcp_tools_to_anthropic(mcp_tools) -> list[dict]:
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.inputSchema,
        }
        for tool in mcp_tools
    ]


# =====================
# エージェントのメインループ
# =====================
async def run_agent(session: ClientSession, user_message: str) -> str:
    # 利用可能なツール一覧をMCPサーバーから取得
    tools_response = await session.list_tools()
    tools = mcp_tools_to_anthropic(tools_response.tools)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    messages = [{"role": "user", "content": user_message}]

    print(f"\n[USER] {user_message}")
    print("-" * 50)

    # ツール呼び出しが完結するまでループ
    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        )

        # アシスタントの返答をメッセージ履歴に追加
        messages.append({"role": "assistant", "content": response.content})

        # ツール呼び出しがなければ終了
        if response.stop_reason != "tool_use":
            break

        # ツール呼び出しを処理
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            print(f"[TOOL CALL] {block.name}({block.input})")

            # MCPサーバーにツール実行を依頼
            result = await session.call_tool(block.name, block.input)
            result_text = result.content[0].text if result.content else "結果なし"

            print(f"[TOOL RESULT] {result_text[:200]}{'...' if len(result_text) > 200 else ''}")

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result_text,
            })

        # ツール結果をメッセージ履歴に追加して次のループへ
        messages.append({"role": "user", "content": tool_results})

    # 最終テキスト応答を抽出
    final_text = "\n".join(
        block.text for block in response.content if hasattr(block, "text")
    )
    return final_text


# =====================
# CLIチャットループ
# =====================
async def main():
    server_params = StdioServerParameters(
        command="python",
        args=["gsc_mcp_server.py"],
    )

    print("[INFO] MCPサーバーを起動中...")
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("[INFO] MCPサーバーに接続しました")
            print("[INFO] 'quit' で終了\n")

            while True:
                user_input = input("質問を入力 > ").strip()
                if user_input.lower() in ("quit", "exit", "q"):
                    break
                if not user_input:
                    continue

                answer = await run_agent(session, user_input)
                print(f"\n[CLAUDE]\n{answer}\n")


if __name__ == "__main__":
    asyncio.run(main())