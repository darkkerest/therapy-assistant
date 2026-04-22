import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, AudioDevice } from '../../types';
import { openInExplorer, readApproaches, writeApproaches } from '../../lib/storage';
import './Settings.css';

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  onClose: () => void;
}

export function Settings({ config, onSave, onClose }: Props) {
  const [form, setForm] = useState<AppConfig>({ ...config });
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [sysLevel, setSysLevel] = useState(0);
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    invoke<AudioDevice[]>('get_audio_devices').then(setDevices).catch(console.error);
    readApproaches(config.data_path).then(setSystemPrompt).catch(() => {});
  }, []);

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    await writeApproaches(form.data_path, systemPrompt).catch(() => {});
    onSave(form);
  };

  const handleTest = async () => {
    if (testRunning) return;
    setTestRunning(true);
    setMicLevel(0);
    setSysLevel(0);
    try {
      await invoke('test_audio', {
        micDevice: form.audio_mic_device,
        systemDevice: form.audio_system_device,
      });
    } catch (e) {
      console.error(e);
      setTestRunning(false);
    }
  };

  useEffect(() => {
    // Listen for test levels - simplified polling
    if (!testRunning) return;
    const interval = setInterval(async () => {
      try {
        const [mic, sys] = await invoke<[number, number]>('get_audio_levels');
        setMicLevel(mic);
        setSysLevel(sys);
      } catch {}
    }, 100);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setTestRunning(false);
    }, 5000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [testRunning]);

  return (
    <div className="settings">
      <div className="s-header">
        <h2 className="s-title">Настройки</h2>
        <button className="s-close" onClick={onClose}>✕</button>
      </div>

      <div className="s-body">
        <section className="s-section">
          <h3 className="s-section-title">API Ключи</h3>
          <label className="s-label">
            Deepgram API Key
            <input
              className="s-input"
              type="password"
              value={form.deepgram_api_key}
              onChange={(e) => set('deepgram_api_key', e.target.value)}
              placeholder="dg_..."
            />
          </label>
          <label className="s-label">
            Anthropic API Key
            <input
              className="s-input"
              type="password"
              value={form.anthropic_api_key}
              onChange={(e) => set('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
          </label>
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Аудио</h3>
          <label className="s-label">
            Микрофон (голос терапевта)
            <select
              className="s-select"
              value={form.audio_mic_device}
              onChange={(e) => set('audio_mic_device', e.target.value)}
            >
              <option value="">— По умолчанию —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="s-label">
            Системный звук (голос клиента)
            <select
              className="s-select"
              value={form.audio_system_device}
              onChange={(e) => set('audio_system_device', e.target.value)}
            >
              <option value="">— По умолчанию —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <div className="s-test-row">
            <button
              className="s-btn s-btn-secondary"
              onClick={handleTest}
              disabled={testRunning}
            >
              {testRunning ? 'Тестирую…' : 'Тест (5 сек)'}
            </button>
            {testRunning && (
              <div className="s-levels">
                <LevelBar label="Mic" level={micLevel} />
                <LevelBar label="Sys" level={sysLevel} />
              </div>
            )}
          </div>
          <p className="s-hint-text">
            Для захвата системного звука установите{' '}
            <a
              className="s-link"
              href="https://existential.audio/blackhole/"
              target="_blank"
              rel="noreferrer"
            >
              BlackHole 2ch
            </a>{' '}
            и выберите его как системный источник.
          </p>
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Данные</h3>
          <label className="s-label">
            Папка с данными
            <div className="s-path-row">
              <input
                className="s-input"
                value={form.data_path}
                onChange={(e) => set('data_path', e.target.value)}
              />
              <button
                className="s-btn s-btn-secondary"
                onClick={() => openInExplorer(form.data_path)}
              >
                Открыть
              </button>
            </div>
          </label>
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Транскрипция</h3>
          <label className="s-label">
            Движок
            <select
              className="s-select"
              value={form.transcribe_backend}
              onChange={(e) => set('transcribe_backend', e.target.value as AppConfig['transcribe_backend'])}
            >
              <option value="local">Локальный Parakeet (быстро, без сети)</option>
              <option value="deepgram">Deepgram (облако)</option>
            </select>
          </label>
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Язык транскрипции</h3>
          <select
            className="s-select"
            value={form.language}
            onChange={(e) => set('language', e.target.value)}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="uk">Українська</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Системный промпт</h3>
          <p className="s-hint-text">
            Глобальные инструкции для Claude — твой подход, техники, что учитывать на всех сессиях.
            Применяется к каждому клиенту вместе с индивидуальным профилем.
          </p>
          <textarea
            className="s-input s-prompt-textarea"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Например: Я работаю в КБТ-подходе. Клиенты часто избегают эмоций. Подсказки должны быть конкретными вопросами, не советами..."
            rows={8}
          />
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Подсказки</h3>
          <label className="s-label">
            Режим
            <select
              className="s-select"
              value={form.hints_mode}
              onChange={(e) => set('hints_mode', e.target.value as AppConfig['hints_mode'])}
            >
              <option value="mixed">Смешанный (авто + хоткей)</option>
              <option value="auto">Только авто</option>
              <option value="manual">Только по хоткею</option>
            </select>
          </label>
          <label className="s-label">
            Интервал авто-подсказок (сек)
            <select
              className="s-select"
              value={form.hints_interval_seconds}
              onChange={(e) => set('hints_interval_seconds', Number(e.target.value))}
            >
              <option value={30}>30 сек</option>
              <option value={60}>1 мин</option>
              <option value={90}>1.5 мин</option>
              <option value={120}>2 мин</option>
            </select>
          </label>
        </section>

        <section className="s-section">
          <h3 className="s-section-title">Горячие клавиши</h3>
          <div className="s-hotkeys">
            <HotkeyRow
              label="Подсказка"
              value={form.hotkey_hint}
              onChange={(v) => set('hotkey_hint', v)}
            />
            <HotkeyRow
              label="Заметка"
              value={form.hotkey_note}
              onChange={(v) => set('hotkey_note', v)}
            />
            <HotkeyRow
              label="Завершить сессию"
              value={form.hotkey_end}
              onChange={(v) => set('hotkey_end', v)}
            />
          </div>
        </section>
      </div>

      <div className="s-footer">
        <button className="s-btn s-btn-secondary" onClick={onClose}>Отмена</button>
        <button className="s-btn s-btn-primary" onClick={handleSave}>Сохранить</button>
      </div>
    </div>
  );
}

function LevelBar({ label, level }: { label: string; level: number }) {
  const pct = Math.min(100, Math.round(level * 100));
  return (
    <div className="s-level">
      <span className="s-level-label">{label}</span>
      <div className="s-level-bar">
        <div className="s-level-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="s-level-val">{pct}%</span>
    </div>
  );
}

function HotkeyRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="s-hotkey-row">
      <span className="s-hotkey-label">{label}</span>
      <input
        className="s-input s-hotkey-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
