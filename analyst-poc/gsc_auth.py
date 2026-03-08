"""
① Google OAuth 2.0 認証 — PoC実装
必要なライブラリ:
  pip install google-auth google-auth-oauthlib google-api-python-client
"""

import json
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# GSCの読み取りに必要なスコープ
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]

# ファイルパス設定
CLIENT_SECRET_FILE = "client_secret_742231208085-8q1lbjmvbuennmmgnrvl41pjb5ruqrom.apps.googleusercontent.com.json"
# CLIENT_SECRET_FILE = "client_secret_742231208085-hd4nk5m3mjpergfa3gcep2951e2au2sh.apps.googleusercontent.com.json"  # Google Cloud Consoleからダウンロード
TOKEN_FILE = "token.json"                  # 認証後に自動生成されるキャッシュ


def get_credentials() -> Credentials:
    """
    認証情報を取得する。
    - token.json が存在すればそこから読み込む（2回目以降はブラウザ不要）
    - なければブラウザでOAuthフローを実行してtoken.jsonを生成
    """
    creds = None

    # キャッシュ済みトークンがあれば読み込む
    if Path(TOKEN_FILE).exists():
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    # トークンがない or 期限切れの場合
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # リフレッシュトークンで自動更新
            creds.refresh(Request())
        else:
            # 初回: ブラウザでOAuth認証
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=3000)

        # 次回のためにトークンをキャッシュ保存
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
        print(f"[INFO] トークンを {TOKEN_FILE} に保存しました")

    return creds


def get_gsc_service(creds: Credentials):
    """GSC APIサービスオブジェクトを返す"""
    return build("searchconsole", "v1", credentials=creds)


def verify_auth(service) -> None:
    """認証確認: 管理下のサイト一覧を表示"""
    result = service.sites().list().execute()
    sites = result.get("siteEntry", [])

    if not sites:
        print("[INFO] 管理サイトが見つかりませんでした")
        return

    print("[SUCCESS] 認証成功! 管理サイト一覧:")
    for site in sites:
        print(f"  - {site['siteUrl']}  (権限: {site['permissionLevel']})")


if __name__ == "__main__":
    print("[STEP 1] 認証情報を取得中...")
    creds = get_credentials()

    print("[STEP 2] GSC APIサービスを構築中...")
    service = get_gsc_service(creds)

    print("[STEP 3] 疎通確認...")
    verify_auth(service)