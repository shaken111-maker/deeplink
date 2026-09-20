#!/usr/bin/env python3
"""Разовая авторизация: получить refresh_token для агента.

1) Создайте приложение: https://developers.pinterest.com/apps/
2) В настройках приложения добавьте Redirect URI (например https://go.tengry.store/oauth).
3) Запустите: PINTEREST_APP_ID=... PINTEREST_APP_SECRET=... python auth.py
4) Откройте ссылку, подтвердите доступ, скопируйте параметр ?code=... из адресной строки.
5) Полученный refresh_token положите в .env или в секреты GitHub.
"""

import os
import sys

import pinterest


def main():
    app_id = os.environ.get("PINTEREST_APP_ID") or input("App ID: ").strip()
    app_secret = os.environ.get("PINTEREST_APP_SECRET") or input("App secret: ").strip()
    redirect_uri = os.environ.get("PINTEREST_REDIRECT_URI") or input("Redirect URI: ").strip()

    print("\nОткройте в браузере и подтвердите доступ:\n")
    print(pinterest.authorize_url(app_id, redirect_uri))
    code = input("\nВставьте значение code из адресной строки: ").strip()

    tokens = pinterest.exchange_code(app_id, app_secret, code, redirect_uri)
    print("\nPINTEREST_REFRESH_TOKEN=" + tokens["refresh_token"])
    print(f"(access_token живёт {tokens.get('expires_in')} c, агент обновляет его сам)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
