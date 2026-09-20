#!/usr/bin/env python3
"""Автономный агент публикации в Pinterest.

Один запуск = один цикл: взять из очереди пины, у которых подошло время,
сгенерировать текст, опубликовать, записать результат в state/posted.json.
Запускать по расписанию (GitHub Actions / cron).
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import time
import urllib.parse

import pinterest
from copywriter import write_copy

ROOT = pathlib.Path(__file__).parent
QUEUE_FILE = ROOT / "content" / "queue.json"
STATE_FILE = ROOT / "state" / "posted.json"


def load_dotenv(path=ROOT / ".env"):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8") or "null") or default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def is_due(item):
    not_before = item.get("not_before")
    if not not_before:
        return True
    stamp = dt.datetime.fromisoformat(not_before.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=dt.timezone.utc)
    return stamp <= now_utc()


def wrap_link(destination, deeplink_base):
    """Оборачивает ссылку в деплинк go.tengry.store, чтобы уходить из встроенного браузера."""
    if not destination:
        return None
    if not deeplink_base:
        return destination
    if urllib.parse.urlsplit(deeplink_base).netloc in destination:
        return destination
    return f"{deeplink_base.rstrip('/')}/?to={urllib.parse.quote(destination, safe='')}"


def pick_items(queue, state, limit):
    ready = [i for i in queue if i.get("id") not in state and is_due(i) and i.get("image_url")]
    ready.sort(key=lambda i: (i.get("priority", 100), i.get("not_before") or ""))
    return ready[:limit]


def main():
    parser = argparse.ArgumentParser(description="Pinterest auto-posting agent")
    parser.add_argument("--dry-run", action="store_true", help="ничего не публиковать, только показать план")
    parser.add_argument("--limit", type=int, default=None, help="сколько пинов за запуск")
    parser.add_argument("--boards", action="store_true", help="показать доски аккаунта и выйти")
    args = parser.parse_args()

    load_dotenv()
    dry_run = args.dry_run or os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
    limit = args.limit or int(os.environ.get("POSTS_PER_RUN", "3"))
    pause = int(os.environ.get("PAUSE_SECONDS", "20"))
    language = os.environ.get("CONTENT_LANGUAGE", "ru")
    deeplink_base = os.environ.get("DEEPLINK_BASE", "")
    default_board = os.environ.get("PINTEREST_BOARD_ID", "")

    api = None
    if not dry_run or args.boards:
        app_id = os.environ.get("PINTEREST_APP_ID")
        app_secret = os.environ.get("PINTEREST_APP_SECRET")
        refresh_token = os.environ.get("PINTEREST_REFRESH_TOKEN")
        if not (app_id and app_secret and refresh_token):
            sys.exit("Нет PINTEREST_APP_ID / PINTEREST_APP_SECRET / PINTEREST_REFRESH_TOKEN. "
                     "Получите их через `python auth.py` или запустите с --dry-run.")
        tokens = pinterest.refresh_access_token(app_id, app_secret, refresh_token)
        if tokens.get("refresh_token") and tokens["refresh_token"] != refresh_token:
            print("! Pinterest выдал новый refresh_token — обновите секрет PINTEREST_REFRESH_TOKEN")
        api = pinterest.Pinterest(tokens["access_token"])

    if args.boards:
        for board in api.boards():
            print(f"{board['id']}  {board.get('name')}")
        return 0

    queue = load_json(QUEUE_FILE, [])
    state = load_json(STATE_FILE, {})
    if not queue:
        print(f"Очередь пуста: {QUEUE_FILE}")
        return 0

    items = pick_items(queue, state, limit)
    print(f"{now_utc():%Y-%m-%d %H:%M} UTC | в очереди {len(queue)}, опубликовано ранее {len(state)}, "
          f"беру в работу {len(items)}{' (DRY RUN)' if dry_run else ''}")

    failures = 0
    for index, item in enumerate(items):
        item_id = item["id"]
        board_id = item.get("board_id") or default_board
        print(f"\n[{item_id}] доска {board_id or '—'}")
        if not board_id:
            print("  ! пропуск: не задан board_id (ни в элементе, ни в PINTEREST_BOARD_ID)")
            failures += 1
            continue

        copy = write_copy(item, language=language)
        link = wrap_link(item.get("link"), deeplink_base)
        print(f"  title: {copy['title']}")
        print(f"  desc:  {copy['description'][:120].replace(chr(10), ' ')}...")
        print(f"  link:  {link}")

        if dry_run:
            continue

        try:
            pin = api.create_pin(
                board_id=board_id,
                image_url=item["image_url"],
                title=copy["title"],
                description=copy["description"],
                link=link,
                alt_text=copy["alt_text"],
            )
        except Exception as exc:
            print(f"  ! ошибка публикации: {exc}")
            failures += 1
            continue

        state[item_id] = {
            "pin_id": pin.get("id"),
            "posted_at": now_utc().isoformat(timespec="seconds"),
            "board_id": board_id,
            "title": copy["title"],
        }
        save_json(STATE_FILE, state)
        print(f"  + опубликован пин {pin.get('id')}")

        if index < len(items) - 1:
            time.sleep(pause)

    print(f"\nГотово. Успешно: {len(items) - failures}, с ошибкой: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
