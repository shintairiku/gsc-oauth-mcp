"""
⑤ Streamlit チャットUI — PoC実装

必要なライブラリ:
  pip install streamlit mcp anthropic

使い方:
  streamlit run gsc_chat_ui.py
"""

import asyncio
import os
import threading
from dotenv import load_dotenv
import anthropic
import streamlit as st
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# =====================
# 設定
# =====================
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
# MCPセッション管理（スレッドをまたいで保持）
# =====================
_mcp_session: ClientSession | None = None
_mcp_tools: list[dict] = []
_loop: asyncio.AbstractEventLoop | None = None
_ready_event = threading.Event()  # セッション確立完了の通知用


def mcp_tools_to_anthropic(mcp_tools) -> list[dict]:
    return [
        {
            "name": t.name,
            "description": t.description,
            "input_schema": t.inputSchema,
        }
        for t in mcp_tools
    ]


async def _mcp_worker():
    """
    stdio_client と ClientSession を同一タスク内で保持し続けるワーカー。
    anyio の cancel scope 制約を守るため、コンテキストマネージャを with で正しく使う。
    セッション確立後は _ready_event でメインスレッドに通知し、
    shutdown_event が立つまで待機し続ける。
    """
    global _mcp_session, _mcp_tools

    server_params = StdioServerParameters(
        command="python",
        args=["gsc_mcp_server.py"],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools_resp = await session.list_tools()
            _mcp_session = session
            _mcp_tools = mcp_tools_to_anthropic(tools_resp.tools)

            # メインスレッドに「準備完了」を通知
            _ready_event.set()

            # セッションをアプリ終了まで保持し続ける
            await asyncio.get_event_loop().create_future()  # 永久に待機


def _start_background_loop():
    """バックグラウンドスレッドでイベントループを起動し、_mcp_worker を実行する"""
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop.run_until_complete(_mcp_worker())


def get_mcp_session() -> tuple[ClientSession, list[dict]]:
    """MCPセッションを返す（初回のみバックグラウンド起動）"""
    if "mcp_started" not in st.session_state:
        st.session_state["mcp_started"] = True
        t = threading.Thread(target=_start_background_loop, daemon=True)
        t.start()
        # サーバー起動完了をイベントで待つ（タイムアウト10秒）
        _ready_event.wait(timeout=10)
    return _mcp_session, _mcp_tools


# =====================
# エージェント呼び出し（同期ラッパー）
# =====================
async def _run_agent(session: ClientSession, tools: list[dict], messages: list[dict]) -> tuple[str, list[dict]]:
    """Claudeにメッセージを送り、ツール呼び出しを処理して最終回答を返す"""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    tool_calls_log = []

    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        )

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            break

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            result = await session.call_tool(block.name, block.input)
            result_text = result.content[0].text if result.content else "結果なし"

            tool_calls_log.append({"name": block.name, "input": block.input, "result": result_text})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    final_text = "\n".join(
        block.text for block in response.content if hasattr(block, "text")
    )
    return final_text, tool_calls_log


def run_agent_sync(user_message: str, history: list[dict]) -> tuple[str, list[dict]]:
    """非同期エージェントを同期的に実行する"""
    session, tools = get_mcp_session()
    messages = history + [{"role": "user", "content": user_message}]

    future = asyncio.run_coroutine_threadsafe(
        _run_agent(session, tools, messages),
        _loop,
    )
    return future.result(timeout=60)


# =====================
# Streamlit UI
# =====================
st.set_page_config(
    page_title="GSC/GA4 アナリスト",
    page_icon="🔍",
    layout="centered",
)

st.title("🔍 GSC/GA4 アナリスト")
st.caption("Google Search Console と GA4 のデータを自然言語で質問できます")

# チャット履歴の初期化
if "messages" not in st.session_state:
    st.session_state.messages = []

# 過去メッセージの表示
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg.get("tool_calls"):
            with st.expander("🛠 ツール呼び出し詳細"):
                for tc in msg["tool_calls"]:
                    st.markdown(f"**`{tc['name']}`** `{tc['input']}`")
                    st.code(tc["result"], language="text")

# 入力欄
if prompt := st.chat_input("例: 先月のトップキーワードを教えて"):

    # ユーザーメッセージを表示・保存
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Claudeの回答を取得
    with st.chat_message("assistant"):
        with st.spinner("GSC/GA4を調査中..."):
            # Anthropic API用の履歴形式に変換（tool_callsは除外）
            api_history = [
                {"role": m["role"], "content": m["content"]}
                for m in st.session_state.messages[:-1]  # 今のユーザー発言は除く
            ]
            answer, tool_calls = run_agent_sync(prompt, api_history)

        st.markdown(answer)

        if tool_calls:
            with st.expander("🛠 ツール呼び出し詳細"):
                for tc in tool_calls:
                    st.markdown(f"**`{tc['name']}`** `{tc['input']}`")
                    st.code(tc["result"], language="text")

    # アシスタントメッセージを保存
    st.session_state.messages.append({
        "role": "assistant",
        "content": answer,
        "tool_calls": tool_calls,
    })
