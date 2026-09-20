"""Минимальный клиент Pinterest API v5 (создание пинов, чтение досок)."""

import base64
import json
import time
import urllib.parse
import urllib.request
import urllib.error

API_BASE = "https://api.pinterest.com/v5"
OAUTH_AUTHORIZE = "https://www.pinterest.com/oauth/"
DEFAULT_SCOPES = "boards:read,boards:write,pins:read,pins:write,user_accounts:read"


class PinterestError(RuntimeError):
    def __init__(self, status, body):
        super().__init__(f"Pinterest API {status}: {body}")
        self.status = status
        self.body = body


def _request(method, url, headers=None, data=None, form=None):
    headers = dict(headers or {})
    body = None
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raise PinterestError(exc.code, exc.read().decode(errors="replace")) from None


def authorize_url(app_id, redirect_uri, scopes=DEFAULT_SCOPES, state="pinterest-agent"):
    query = urllib.parse.urlencode(
        {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scopes,
            "state": state,
        }
    )
    return f"{OAUTH_AUTHORIZE}?{query}"


def _basic_auth(app_id, app_secret):
    raw = f"{app_id}:{app_secret}".encode()
    return {"Authorization": "Basic " + base64.b64encode(raw).decode()}


def exchange_code(app_id, app_secret, code, redirect_uri):
    """Код из редиректа -> access_token + refresh_token (refresh живёт ~1 год)."""
    return _request(
        "POST",
        f"{API_BASE}/oauth/token",
        headers=_basic_auth(app_id, app_secret),
        form={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
    )


def refresh_access_token(app_id, app_secret, refresh_token):
    """refresh_token -> свежий access_token (живёт ~30 минут)."""
    return _request(
        "POST",
        f"{API_BASE}/oauth/token",
        headers=_basic_auth(app_id, app_secret),
        form={"grant_type": "refresh_token", "refresh_token": refresh_token},
    )


class Pinterest:
    def __init__(self, access_token):
        self.access_token = access_token

    @property
    def _headers(self):
        return {"Authorization": f"Bearer {self.access_token}"}

    def me(self):
        return _request("GET", f"{API_BASE}/user_account", headers=self._headers)

    def boards(self, page_size=50):
        out, bookmark = [], None
        while True:
            query = {"page_size": page_size}
            if bookmark:
                query["bookmark"] = bookmark
            url = f"{API_BASE}/boards?{urllib.parse.urlencode(query)}"
            data = _request("GET", url, headers=self._headers)
            out.extend(data.get("items", []))
            bookmark = data.get("bookmark")
            if not bookmark:
                return out

    def create_pin(self, board_id, image_url, title, description, link=None, alt_text=None):
        payload = {
            "board_id": board_id,
            "title": title[:100],
            "description": description[:800],
            "media_source": {"source_type": "image_url", "url": image_url},
        }
        if link:
            payload["link"] = link
        if alt_text:
            payload["alt_text"] = alt_text[:500]

        for attempt in range(4):
            try:
                return _request("POST", f"{API_BASE}/pins", headers=self._headers, data=payload)
            except PinterestError as exc:
                # 429 — лимит запросов, 5xx — временный сбой: ждём и пробуем снова.
                if exc.status not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                time.sleep(2 ** attempt * 5)
