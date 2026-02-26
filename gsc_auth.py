"""
① Google OAuth 2.0 認証 — PoC実装
必要なライブラリ:
  pip install google-auth google-auth-oauthlib google-api-python-client
"""

from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# GSC/GA4の読み取りに必要なスコープ
SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
]

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


def get_ga4_data_service(creds: Credentials):
    """GA4 Data APIサービスオブジェクトを返す"""
    return build("analyticsdata", "v1beta", credentials=creds)


def get_ga4_admin_service(creds: Credentials):
    """GA4 Admin APIサービスオブジェクトを返す"""
    return build("analyticsadmin", "v1beta", credentials=creds)


def verify_gsc_auth(service) -> None:
    """認証確認: GSCの管理サイト一覧を表示"""
    result = service.sites().list().execute()
    sites = result.get("siteEntry", [])

    if not sites:
        print("[INFO] GSC 管理サイトが見つかりませんでした")
        return

    print("[SUCCESS] GSC 認証成功! 管理サイト一覧:")
    for site in sites:
        print(f"  - {site['siteUrl']}  (権限: {site['permissionLevel']})")


def verify_ga4_auth(admin_service) -> None:
    """認証確認: GA4プロパティ一覧を表示"""
    result = admin_service.properties().list(pageSize=20).execute()
    properties = result.get("properties", [])

    if not properties:
        print("[INFO] GA4 プロパティが見つかりませんでした")
        return

    print("[SUCCESS] GA4 認証成功! プロパティ一覧:")
    for prop in properties:
        print(f"  - {prop.get('name', '不明')} ({prop.get('displayName', '名称なし')})")


if __name__ == "__main__":
    print("[STEP 1] 認証情報を取得中...")
    creds = get_credentials()

    print("[STEP 2] GSC/GA4 APIサービスを構築中...")
    gsc_service = get_gsc_service(creds)
    ga4_admin_service = get_ga4_admin_service(creds)

    print("[STEP 3] 疎通確認...")
    verify_gsc_auth(gsc_service)
    verify_ga4_auth(ga4_admin_service)
