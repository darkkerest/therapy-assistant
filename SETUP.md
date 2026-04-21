# Установка и запуск

## 1. Установи Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

## 2. Установи зависимости macOS

```bash
# Homebrew (если нет)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js
brew install node

# Tauri системные зависимости
xcode-select --install
```

## 3. Установи npm-зависимости

```bash
cd ~/therapy-assistant
npm install
```

## 4. Запуск в dev-режиме

```bash
npm run tauri dev
```

## 5. Сборка приложения

```bash
npm run tauri build
# Результат: src-tauri/target/release/bundle/macos/Therapy Assistant.app
```

## 6. Первый запуск

При первом запуске откроется онбординг:
1. Введи API ключи (Deepgram + Anthropic)
2. Настрой аудио устройства (установи BlackHole — см. AUDIO_SETUP.md)
3. Создай профиль первого клиента
4. Начни сессию

## Стоимость: ~$0.61/сессия (60 мин)
