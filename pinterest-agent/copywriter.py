"""Генерация заголовка/описания пина. Это и есть «ИИ-часть» агента.

Если задан ANTHROPIC_API_KEY — текст пишет Claude под SEO Pinterest.
Если ключа нет — используется шаблон из полей элемента очереди, агент
продолжает работать (деградация без падения).
"""

import json
import os
import re

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

SYSTEM = """Ты SEO-копирайтер для Pinterest. Пиши так, как реально ищут люди в поиске Pinterest.
Правила:
- title: до 90 символов, с ключевым запросом в начале, без кликбейта и без эмодзи-спама;
- description: 150-400 символов, естественный текст с 2-3 ключевыми фразами, заканчивается мягким призывом к действию;
- hashtags: 3-5 штук, нижний регистр, без решёток в массиве;
- alt_text: до 120 символов, буквальное описание того, что видно на картинке (для доступности);
- язык ответа = язык поля "language".
Верни СТРОГО JSON: {"title": "...", "description": "...", "hashtags": ["..."], "alt_text": "..."}"""


def _fallback(item):
    title = item.get("title") or item.get("topic", "Новый пин")
    tags = item.get("hashtags", [])
    description = item.get("description") or item.get("topic", "")
    if tags:
        description = f"{description}\n\n" + " ".join(f"#{t.lstrip('#')}" for t in tags)
    return {
        "title": title[:100],
        "description": description.strip()[:800],
        "hashtags": tags,
        "alt_text": item.get("alt_text") or title[:120],
    }


def _extract_json(text):
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError(f"модель вернула не JSON: {text[:200]}")
    return json.loads(match.group(0))


def write_copy(item, language="ru"):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback(item)

    try:
        import anthropic
    except ImportError:
        return _fallback(item)

    brief = {
        "language": language,
        "topic": item.get("topic", ""),
        "product": item.get("product", ""),
        "audience": item.get("audience", ""),
        "keywords": item.get("keywords", []),
        "image_url": item.get("image_url", ""),
        "draft_title": item.get("title", ""),
        "draft_description": item.get("description", ""),
    }

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=800,
            system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(brief, ensure_ascii=False)}],
        )
        copy = _extract_json("".join(b.text for b in response.content if b.type == "text"))
    except Exception as exc:  # сеть, лимиты, кривой JSON — не роняем публикацию
        print(f"  ! копирайтер недоступен ({exc}), беру текст из очереди")
        return _fallback(item)

    tags = copy.get("hashtags") or []
    description = copy.get("description", "").strip()
    if tags:
        description = f"{description}\n\n" + " ".join(f"#{str(t).lstrip('#')}" for t in tags)
    return {
        "title": copy.get("title", "").strip()[:100] or _fallback(item)["title"],
        "description": description[:800],
        "hashtags": tags,
        "alt_text": (copy.get("alt_text") or "").strip()[:500] or item.get("topic", "")[:120],
    }
