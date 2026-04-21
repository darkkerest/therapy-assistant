# Therapy Assistant

Десктопное приложение для психотерапевтов. Слушает Zoom-звонок (оба голоса), транскрибирует в реальном времени и показывает подсказки поверх Zoom в маленьком флоатинг-окне.

## Стек

- **Tauri v2** (Rust backend + WebView frontend)
- **React + TypeScript**
- **Deepgram** — стриминговая транскрипция с диаризацией
- **Claude** (claude-sonnet-4-20250514) — подсказки в реальном времени
- **cpal** — захват аудио (микрофон + системный звук)

## Быстрый старт

### 1. Установка зависимостей

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js + npm (через homebrew)
brew install node

# Tauri CLI
npm install -g @tauri-apps/cli

cd therapy-assistant
npm install
```

### 2. Установка BlackHole (macOS)

См. [AUDIO_SETUP.md](./AUDIO_SETUP.md)

### 3. API ключи

- **Deepgram**: https://console.deepgram.com (200 часов бесплатно)
- **Anthropic**: https://console.anthropic.com

### 4. Запуск в режиме разработки

```bash
npm run tauri dev
```

### 5. Сборка

```bash
npm run tauri build
```

## Структура данных

```
~/therapy-assistant/
  config.json
  my-context/
    approaches.md     ← ваши подходы и техники
    notes.md
  clients/
    {client-id}/
      profile.md
      sessions/
        2025-04-15.md
        ...
```

## Горячие клавиши

| Действие | macOS | Windows |
|----------|-------|---------|
| Подсказка | ⌘⇧H | Ctrl+Shift+H |
| Заметка | ⌘⇧N | Ctrl+Shift+N |
| Завершить сессию | ⌘⇧S | Ctrl+Shift+S |

## Стоимость на сессию (60 мин)

| Сервис | Расход | Цена |
|--------|--------|------|
| Deepgram nova-2 | ~60 мин | ~$0.13 |
| Claude (подсказки, ~30 запросов) | ~150k токенов | ~$0.45 |
| Claude (финализация) | ~10k токенов | ~$0.03 |
| **Итого** | | **~$0.61** |
