import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, AudioDevice } from '../../types';
import { ensureDataDirs } from '../../lib/storage';
import './Onboarding.css';

interface Props {
  config: AppConfig;
  onComplete: (config: AppConfig) => void;
}

export function Onboarding({ config, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AppConfig>({ ...config });
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [sysLevel, setSysLevel] = useState(0);
  const [blackholeInstalled, setBlackholeInstalled] = useState(false);
  const [bhInstalling, setBhInstalling] = useState(false);
  const [bhError, setBhError] = useState('');

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadDevices = async () => {
    try {
      const devs = await invoke<AudioDevice[]>('get_audio_devices');
      setDevices(devs);
    } catch (e) {
      console.error(e);
    }
  };

  const checkBlackhole = async () => {
    try {
      const installed = await invoke<boolean>('is_blackhole_installed');
      setBlackholeInstalled(installed);
      return installed;
    } catch {
      return false;
    }
  };

  const handleInstallBlackhole = async () => {
    if (bhInstalling) return;
    setBhInstalling(true);
    setBhError('');
    try {
      await invoke('install_blackhole');
      await checkBlackhole();
    } catch (e) {
      setBhError(String(e));
    } finally {
      setBhInstalling(false);
    }
  };

  const handleOpenAudioMidi = async () => {
    try {
      await invoke('open_audio_midi_setup');
    } catch (e) { console.error(e); }
  };

  const handleNext = async () => {
    if (step === 1) await checkBlackhole();
    if (step === 2) await loadDevices();
    setStep((s) => s + 1);
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
      const interval = setInterval(async () => {
        const [mic, sys] = await invoke<[number, number]>('get_audio_levels');
        setMicLevel(mic);
        setSysLevel(sys);
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        setTestRunning(false);
      }, 5000);
    } catch (e) {
      setTestRunning(false);
    }
  };

  const handleComplete = async () => {
    await ensureDataDirs(form.data_path);
    onComplete(form);
  };

  const steps = [
    {
      title: 'Добро пожаловать',
      content: (
        <div className="ob-step">
          <div className="ob-icon">🧠</div>
          <h2>Therapy Assistant</h2>
          <p>Ассистент для психотерапевтов. Транскрибирует сессии в реальном времени и подсказывает, что спросить.</p>
          <p className="ob-sub">Для работы нужны API-ключи Deepgram и Anthropic. Получить их бесплатно:</p>
          <div className="ob-links">
            <span>• Deepgram: <strong>console.deepgram.com</strong> (200 часов бесплатно)</span>
            <span>• Anthropic: <strong>console.anthropic.com</strong></span>
          </div>
        </div>
      ),
    },
    {
      title: 'API Ключи',
      content: (
        <div className="ob-step">
          <label className="ob-label">
            Deepgram API Key
            <input
              className="ob-input"
              type="password"
              value={form.deepgram_api_key}
              onChange={(e) => set('deepgram_api_key', e.target.value)}
              placeholder="dg_..."
            />
          </label>
          <label className="ob-label">
            Anthropic API Key
            <input
              className="ob-input"
              type="password"
              value={form.anthropic_api_key}
              onChange={(e) => set('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
          </label>
        </div>
      ),
    },
    {
      title: 'BlackHole (захват звука)',
      content: (
        <div className="ob-step">
          <div className="ob-icon">🔊</div>
          <p>
            Для захвата голоса клиента из Zoom нужен виртуальный аудио-драйвер <strong>BlackHole 2ch</strong>.
            Он бесплатный, весит 100КБ и встроен в приложение.
          </p>
          {blackholeInstalled ? (
            <div className="ob-bh-ok">
              <div className="ob-bh-badge">✓</div>
              <div>
                <strong>BlackHole установлен</strong>
                <p className="ob-sub">Готово к настройке маршрутизации.</p>
              </div>
            </div>
          ) : (
            <>
              <button
                className="ob-test-btn"
                onClick={handleInstallBlackhole}
                disabled={bhInstalling}
              >
                {bhInstalling ? 'Устанавливаю…' : 'Установить BlackHole'}
              </button>
              <p className="ob-sub">
                macOS запросит пароль администратора (нужен для установки драйвера ядра).
                После установки может потребоваться перезагрузка.
              </p>
              {bhError && <p className="ob-sub" style={{ color: 'var(--red)' }}>{bhError}</p>}
            </>
          )}
          {blackholeInstalled && (
            <>
              <p style={{ marginTop: 'var(--sp-3)' }}>
                <strong>Что дальше:</strong>
              </p>
              <ol className="ob-steps-list">
                <li>Открой Audio MIDI Setup и создай <strong>Multi-Output Device</strong> (+ слева снизу)</li>
                <li>Включи в нём <strong>BlackHole 2ch</strong> + свои наушники/колонки</li>
                <li>В Zoom → Audio → Speaker выбери этот Multi-Output</li>
              </ol>
              <button className="ob-test-btn" onClick={handleOpenAudioMidi}>
                Открыть Audio MIDI Setup
              </button>
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Настройка аудио',
      content: (
        <div className="ob-step">
          <p className="ob-sub">
            Выберите микрофон и источник системного звука. Для клиента выберите <strong>BlackHole 2ch</strong>.
          </p>
          <label className="ob-label">
            Микрофон (ваш голос)
            <select
              className="ob-select"
              value={form.audio_mic_device}
              onChange={(e) => set('audio_mic_device', e.target.value)}
            >
              <option value="">— По умолчанию —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="ob-label">
            Системный звук (голос клиента из Zoom)
            <select
              className="ob-select"
              value={form.audio_system_device}
              onChange={(e) => set('audio_system_device', e.target.value)}
            >
              <option value="">— По умолчанию —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <button className="ob-test-btn" onClick={handleTest} disabled={testRunning}>
            {testRunning ? 'Тестирую (5 сек)…' : 'Тест аудио'}
          </button>
          {testRunning && (
            <div className="ob-levels">
              <LevelRow label="Mic" level={micLevel} />
              <LevelRow label="Sys" level={sysLevel} />
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Готово',
      content: (
        <div className="ob-step">
          <div className="ob-icon">✅</div>
          <h3>Всё готово!</h3>
          <p>Вы можете начать первую сессию. Добавьте клиентов и настройте свои подходы в папке данных.</p>
          <p className="ob-sub">Папка данных: <code>{form.data_path}</code></p>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="onboarding">
      <div className="ob-progress">
        {steps.map((_s, i) => (
          <div key={i} className={`ob-prog-dot ${i <= step ? 'active' : ''}`} />
        ))}
      </div>

      <div className="ob-header">
        <h2 className="ob-title">{current.title}</h2>
        <span className="ob-step-count">{step + 1} / {steps.length}</span>
      </div>

      <div className="ob-content">{current.content}</div>

      <div className="ob-footer">
        {step > 0 && (
          <button className="ob-btn ob-btn-secondary" onClick={() => setStep((s) => s - 1)}>
            Назад
          </button>
        )}
        <div style={{ flex: 1 }} />
        {isLast ? (
          <button className="ob-btn ob-btn-primary" onClick={handleComplete}>
            Начать работу
          </button>
        ) : (
          <button className="ob-btn ob-btn-primary" onClick={handleNext}>
            Далее →
          </button>
        )}
      </div>
    </div>
  );
}

function LevelRow({ label, level }: { label: string; level: number }) {
  const pct = Math.min(100, Math.round(level * 100));
  return (
    <div className="ob-level">
      <span>{label}</span>
      <div className="ob-bar">
        <div className="ob-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
