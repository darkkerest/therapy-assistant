# Therapy Assistant

Десктопное приложение для психотерапевтов. Слушает Zoom-звонок (оба голоса), транскрибирует в реальном времени и показывает подсказки поверх Zoom в маленьком флоатинг-окне.

## Установка

```bash
curl -fsSL https://raw.githubusercontent.com/darkkerest/therapy-assistant/main/install.sh | bash
```

Первый запуск локальной транскрипции скачает Parakeet v3 через FluidAudio. После этого транскрипция работает локально.

## Стек

- **Tauri v2** (Rust backend + WebView frontend)
- **React + TypeScript**
- **Parakeet TDT v3 + FluidAudio** — локальная транскрипция на Apple Silicon
- **Deepgram** — опциональная облачная транскрипция с диаризацией
- **Claude Sonnet 4.6** — подсказки в реальном времени и финализация сессий
- **cpal** — захват аудио (микрофон + системный звук)
- **Swift helper** — отдельный локальный процесс для Parakeet v3

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

Для локального Parakeet нужен Swift toolchain из Xcode Command Line Tools:

```bash
xcode-select --install
```

### 2. Установка BlackHole (macOS)

См. [AUDIO_SETUP.md](./AUDIO_SETUP.md)

### 3. API ключи

- **Anthropic**: https://console.anthropic.com
- **Deepgram**: https://console.deepgram.com (опционально, если нужен облачный backend)

### 4. Запуск в режиме разработки

```bash
npm run tauri dev
```

### 5. Сборка

```bash
npm run tauri build
```

Перед `tauri dev/build` автоматически собирается Swift helper и копируется в `src-tauri/resources`.
Parakeet v3 скачивается FluidAudio при первом запуске в `~/Library/Application Support/FluidAudio/Models`.

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
| Parakeet v3 | локально | $0 |
| Deepgram nova-2 | ~60 мин | ~$0.13 (опционально) |
| Claude (подсказки, ~30 запросов) | ~150k токенов | ~$0.45 |
| Claude (финализация) | ~10k токенов | ~$0.03 |
| **Итого с локальной транскрипцией** | | **~$0.48** |
