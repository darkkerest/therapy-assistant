# Настройка аудио

## macOS — BlackHole 2ch

BlackHole — бесплатный виртуальный аудио-драйвер, позволяет захватить системный звук из Zoom.

### Установка

1. Скачайте **BlackHole 2ch**: https://existential.audio/blackhole/
2. Установите (потребуется пароль администратора)
3. Откройте **Audio MIDI Setup** (Cmd+Space → "Audio MIDI Setup")
4. Нажмите **+** (нижний левый угол) → **Create Multi-Output Device**
5. Включите галочки:
   - ✅ Built-in Output (или ваши наушники/колонки)
   - ✅ BlackHole 2ch
6. Правой кнопкой на **Multi-Output Device** → **Use This Device For Sound Output**
7. В **Zoom**: Settings → Audio → Speaker → выбрать **Multi-Output Device**
8. В приложении: Settings → Audio → System audio device → выбрать **BlackHole 2ch**

### Проверка

После настройки запустите Zoom-звонок и проверьте тест аудио в приложении — уровень системного звука должен реагировать на голос собеседника.

---

## Windows — VB-Audio Virtual Cable

### Установка

1. Скачайте **VB-Audio Virtual Cable**: https://vb-audio.com/Cable/
2. Установите и **перезагрузите компьютер**
3. В **Zoom**: Settings → Audio → Speaker → выбрать **CABLE Input (VB-Audio Virtual Cable)**
4. Откройте **Sound Settings** (правая кнопка на иконке звука)
   - Recording → **CABLE Output** → Properties → Listen → ✅ "Listen to this device"
   - Playback through: Default Playback Device
5. В приложении: Settings → Audio → System audio → выбрать **CABLE Output (VB-Audio Virtual Cable)**

---

## Как это работает

```
Zoom → Multi-Output Device ──→ Реальные колонки (вы слышите клиента)
                           └──→ BlackHole 2ch ──→ Приложение (транскрипция клиента)

Микрофон ──→ Приложение (транскрипция терапевта)
         └──→ Zoom (клиент слышит вас)
```

Zoom **не знает** о приложении — он просто выводит звук в Multi-Output Device, часть которого перехватывает BlackHole.
