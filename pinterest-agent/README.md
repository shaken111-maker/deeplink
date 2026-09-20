# Pinterest-агент

Автономный публикатор пинов: раз в несколько часов берёт из очереди подготовленный
контент, пишет заголовок и описание под SEO Pinterest, публикует пин через
Pinterest API v5 и запоминает, что уже опубликовано.

Ссылки в пинах автоматически заворачиваются в деплинк этого репозитория
(`https://go.tengry.store/?to=...`), чтобы переход из приложения Pinterest
открывался в нормальном браузере.

## Что здесь есть

| Файл | Назначение |
|---|---|
| `agent.py` | цикл работы: выбрать → сгенерировать текст → опубликовать → записать состояние |
| `pinterest.py` | клиент Pinterest API v5 (OAuth, доски, создание пинов, ретраи на 429/5xx) |
| `copywriter.py` | ИИ-копирайтер на Claude; без ключа берёт текст из очереди |
| `auth.py` | разовое получение `refresh_token` |
| `content/queue.example.json` | пример очереди контента |
| `state/posted.json` | история публикаций (защита от дублей) |
| `../.github/workflows/pinterest-agent.yml` | расписание запусков (3 раза в день) |

## Быстрый старт

```bash
cd pinterest-agent
cp .env.example .env
cp content/queue.example.json content/queue.json

# 1) приложение: https://developers.pinterest.com/apps/  (Redirect URI добавить там же)
# 2) получить refresh_token
python auth.py

# 3) узнать id досок
python agent.py --boards

# 4) прогон без публикации
python agent.py --dry-run

# 5) боевой запуск
python agent.py
```

Для ИИ-текстов поставьте `pip install -r requirements.txt` и задайте `ANTHROPIC_API_KEY`.

## Автономный режим

В GitHub: Settings → Secrets and variables → Actions.

Секреты: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REFRESH_TOKEN`, `ANTHROPIC_API_KEY`.
Переменные: `PINTEREST_BOARD_ID`, `DEEPLINK_BASE`, `POSTS_PER_RUN`, `CONTENT_LANGUAGE`.

Дальше workflow запускается по cron и коммитит обновлённый `state/posted.json` обратно в репозиторий.
Расписание меняется в `.github/workflows/pinterest-agent.yml`.

## Формат очереди

```json
{
  "id": "уникальный-ключ",          // по нему считается, что пин уже опубликован
  "image_url": "https://...jpg",     // публичный URL, вертикаль 2:3 (1000×1500)
  "link": "https://tengry.store/...",// куда ведёт пин (обернётся в деплинк)
  "board_id": "",                    // необязательно, иначе PINTEREST_BOARD_ID
  "topic": "о чём пин",
  "keywords": ["ключевые", "запросы"],
  "priority": 10,                     // меньше — раньше
  "not_before": "2026-01-10T09:00:00Z" // не публиковать раньше этого момента
}
```

## Ограничения, о которых стоит знать

- Нужен доступ к Pinterest API: новое приложение получает **trial access** с урезанными
  лимитами; для полноценной работы подаётся заявка на standard access.
- `access_token` живёт ~30 минут — агент обновляет его сам через `refresh_token`.
  `refresh_token` живёт около года, потом нужно повторить `python auth.py`.
- Реализованы только image-пины по URL. Видео-пины требуют отдельной загрузки медиа.
- Картинки агент не рисует: он берёт готовые `image_url`. Генерацию картинок можно
  подключить отдельным шагом.
- Публикуйте разумный объём (единицы пинов в день): массовая одинаковая публикация
  быстро ловит ограничения со стороны Pinterest.
