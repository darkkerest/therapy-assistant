import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import type { AppConfig, ClientInfo, AppView } from './types';
import { readConfig, writeConfig, ensureDataDirs, listClients, formatSessionFile, generateSessionDate, sessionPath, writeFile, readApproaches, writeApproaches } from './lib/storage';
import { finalizeSession as finalize } from './lib/claude';
import { useSession } from './hooks/useSession';
import { useTranscription } from './hooks/useTranscription';
import { useHints } from './hooks/useHints';
import { FloatingHint } from './components/FloatingHint/FloatingHint';
import { SessionView } from './components/SessionView/SessionView';
import { ClientList } from './components/ClientList/ClientList';
import { ClientProfile } from './components/ClientProfile/ClientProfile';
import { Settings } from './components/Settings/Settings';
import { Onboarding } from './components/Onboarding/Onboarding';
import './App.css';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [view, setView] = useState<AppView>('onboarding');
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [noteInput, setNoteInput] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [_finalizing, setFinalizing] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState('');
  const [rightTab, setRightTab] = useState<'profile' | 'system-prompt'>('profile');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptSaved, setSystemPromptSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const systemPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeClientId = selectedClient?.id ?? '';

  const {
    session,
    startSession,
    stopSession,
    addTranscriptResult,
    addHint,
    addNote,
    swapSpeakers,
    getRecentTurns,
    hasRecentSpeech,
    elapsedSeconds,
  } = useSession(activeClientId);

  const isSessionActive = view === 'session-compact' || view === 'session-full';

  const { start: startTranscription, stop: stopTranscription } =
    useTranscription({
      micDevice: config?.audio_mic_device ?? '',
      systemDevice: config?.audio_system_device ?? '',
      deepgramKey: config?.deepgram_api_key ?? '',
      language: config?.language ?? 'ru',
      onResult: addTranscriptResult,
    });

  const { loading: hintLoading, lastHint, startAutoHints, stopAutoHints, triggerManual } =
    useHints({
      config: config ?? ({} as AppConfig),
      clientId: activeClientId,
      getRecentTurns,
      hasRecentSpeech,
      onHint: (text, by) => addHint(text, by),
    });

  // Load config on mount
  useEffect(() => {
    readConfig().then(async (cfg) => {
      setConfig(cfg);
      const isSetup = cfg.deepgram_api_key && cfg.anthropic_api_key;
      if (isSetup) {
        await ensureDataDirs(cfg.data_path);
        const cl = await listClients(cfg.data_path);
        setClients(cl);
        setView('start-session');
        readApproaches(cfg.data_path).then(setSystemPrompt).catch(() => {});
      }
    });
  }, []);

  const handleSystemPromptChange = useCallback((val: string) => {
    setSystemPrompt(val);
    setSystemPromptSaved(false);
    if (systemPromptTimerRef.current) clearTimeout(systemPromptTimerRef.current);
    systemPromptTimerRef.current = setTimeout(async () => {
      if (!config) return;
      await writeApproaches(config.data_path, val).catch(() => {});
      setSystemPromptSaved(true);
      setTimeout(() => setSystemPromptSaved(false), 2000);
    }, 1000);
  }, [config]);

  // Timer during session
  useEffect(() => {
    if (isSessionActive) {
      timerRef.current = setInterval(() => setElapsed(elapsedSeconds()), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isSessionActive, elapsedSeconds]);

  // Global hotkeys
  useEffect(() => {
    if (!config || !isSessionActive) return;

    const setupHotkeys = async () => {
      await unregisterAll();
      await register(config.hotkey_hint, () => triggerManual());
      await register(config.hotkey_note, () => setShowNoteInput(true));
      await register(config.hotkey_end, () => handleEndSession());
    };

    setupHotkeys().catch(console.error);
    return () => { unregisterAll().catch(console.error); };
  }, [config, isSessionActive]);

  // Window resize based on view
  useEffect(() => {
    if (view === 'session-compact') {
      invoke('resize_window', { width: 340, height: 220 }).catch(console.error);
      invoke('set_always_on_top', { onTop: true }).catch(console.error);
    } else if (view === 'session-full') {
      invoke('resize_window', { width: 860, height: 620 }).catch(console.error);
      invoke('set_always_on_top', { onTop: false }).catch(console.error);
    } else {
      invoke('resize_window', { width: 600, height: 640 }).catch(console.error);
      invoke('set_always_on_top', { onTop: false }).catch(console.error);
    }
  }, [view]);

  const handleStartSession = useCallback(async () => {
    if (!selectedClient || !config) return;
    startSession();
    setView('session-compact');
    if (config.hints_mode !== 'manual') startAutoHints();
    await startTranscription();
  }, [selectedClient, config, startSession, startAutoHints, startTranscription]);

  const handleEndSession = useCallback(async () => {
    if (!session || !config || !selectedClient) return;
    setFinalizing(true);
    stopAutoHints();
    await stopTranscription();
    stopSession();

    try {
      const result = await finalize({
        anthropicKey: config.anthropic_api_key,
        session,
        clientName: selectedClient.name,
      });

      const content = formatSessionFile(session, selectedClient.name, result.summary, result.keyPoints);
      const date = generateSessionDate();
      const path = sessionPath(config.data_path, selectedClient.id, date);
      await writeFile(path, content);
      setLastSavedPath(path);
      setShowFinalizeModal(true);
    } catch (e) {
      console.error('finalize error:', e);
    } finally {
      setFinalizing(false);
      setView('start-session');
    }
  }, [session, config, selectedClient, stopAutoHints, stopTranscription, stopSession]);

  const handleSaveConfig = useCallback(async (newConfig: AppConfig) => {
    setConfig(newConfig);
    await writeConfig(newConfig);
    await ensureDataDirs(newConfig.data_path);
    const cl = await listClients(newConfig.data_path);
    setClients(cl);
    setView('start-session');
  }, []);

  const handleOnboardingComplete = useCallback(async (newConfig: AppConfig) => {
    await writeConfig(newConfig);
    await ensureDataDirs(newConfig.data_path);
    setConfig(newConfig);
    const cl = await listClients(newConfig.data_path);
    setClients(cl);
    setView('start-session');
  }, []);

  const handleRefreshClients = useCallback(async () => {
    if (!config) return;
    const cl = await listClients(config.data_path);
    setClients(cl);
  }, [config]);

  const handleNote = useCallback(() => setShowNoteInput(true), []);

  const handleSaveNote = useCallback(() => {
    if (noteInput.trim()) {
      addNote(noteInput.trim());
    }
    setNoteInput('');
    setShowNoteInput(false);
  }, [noteInput, addNote]);

  if (!config) {
    return <div className="app-loading">Загрузка…</div>;
  }

  if (view === 'onboarding') {
    return <Onboarding config={config} onComplete={handleOnboardingComplete} />;
  }

  if (view === 'settings') {
    return (
      <Settings
        config={config}
        onSave={handleSaveConfig}
        onClose={() => setView('start-session')}
      />
    );
  }

  if (view === 'session-compact' && session) {
    return (
      <div className="app">
        <FloatingHint
          session={session}
          clientName={selectedClient?.name ?? ''}
          elapsedSeconds={elapsed}
          lastHint={lastHint}
          hintLoading={hintLoading}
          onExpand={() => setView('session-full')}
          onManualHint={triggerManual}
          onNote={handleNote}
          onEndSession={handleEndSession}
          onSwapSpeakers={swapSpeakers}
        />
        {showNoteInput && (
          <NoteOverlay
            value={noteInput}
            onChange={setNoteInput}
            onSave={handleSaveNote}
            onClose={() => { setNoteInput(''); setShowNoteInput(false); }}
          />
        )}
      </div>
    );
  }

  if (view === 'session-full' && session) {
    return (
      <div className="app">
        <SessionView
          session={session}
          clientName={selectedClient?.name ?? ''}
          elapsedSeconds={elapsed}
          lastHint={lastHint}
          hintLoading={hintLoading}
          onCollapse={() => setView('session-compact')}
          onManualHint={triggerManual}
          onNote={handleNote}
          onEndSession={handleEndSession}
          onSwapSpeakers={swapSpeakers}
        />
        {showNoteInput && (
          <NoteOverlay
            value={noteInput}
            onChange={setNoteInput}
            onSave={handleSaveNote}
            onClose={() => { setNoteInput(''); setShowNoteInput(false); }}
          />
        )}
      </div>
    );
  }

  // start-session view
  return (
    <div className="app start-view">
      <div className="sv-top">
        <h1 className="sv-app-title">Therapy Assistant</h1>
        <button className="sv-settings-btn" onClick={() => setView('settings')}>⚙</button>
      </div>

      <div className="sv-main">
        <div className="sv-clients-col">
          <ClientList
            clients={clients}
            dataPath={config.data_path}
            onSelect={setSelectedClient}
            onRefresh={handleRefreshClients}
          />
        </div>

        <div className="sv-start-col">
          <div className="sv-tabs">
            <button
              className={`sv-tab ${rightTab === 'profile' ? 'sv-tab-active' : ''}`}
              onClick={() => setRightTab('profile')}
            >
              Клиент
            </button>
            <button
              className={`sv-tab ${rightTab === 'system-prompt' ? 'sv-tab-active' : ''}`}
              onClick={() => setRightTab('system-prompt')}
            >
              Системный промпт
            </button>
          </div>

          {rightTab === 'profile' ? (
            selectedClient ? (
              <div className="sv-profile-col">
                <ClientProfile
                  client={selectedClient}
                  dataPath={config.data_path}
                  onStart={handleStartSession}
                />
                <div className="sv-audio-strip">
                  <AudioIndicator config={config} />
                </div>
              </div>
            ) : (
              <p className="sv-select-hint">← Выберите клиента</p>
            )
          ) : (
            <div className="sv-system-prompt-col">
              <div className="sv-sp-header">
                <span className="sv-sp-hint">Глобальные инструкции для Claude — подход, техники, что учитывать на всех сессиях.</span>
                {systemPromptSaved && <span className="sv-sp-saved">Сохранено ✓</span>}
              </div>
              <textarea
                className="sv-sp-textarea"
                value={systemPrompt}
                onChange={(e) => handleSystemPromptChange(e.target.value)}
                placeholder="Например: Я работаю в КБТ-подходе. Клиенты часто избегают эмоций. Подсказки — конкретные вопросы, не советы. Язык — русский..."
              />
            </div>
          )}
        </div>
      </div>

      {showFinalizeModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Сессия сохранена ✓</h3>
            <p className="modal-path">{lastSavedPath}</p>
            <div className="modal-actions">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => setShowFinalizeModal(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteOverlay({
  value,
  onChange,
  onSave,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="note-overlay">
      <div className="note-box">
        <p className="note-label">Заметка</p>
        <textarea
          autoFocus
          className="note-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(); }
            if (e.key === 'Escape') onClose();
          }}
          rows={3}
          placeholder="Введите заметку… Enter — сохранить"
        />
        <div className="note-actions">
          <button className="note-btn note-cancel" onClick={onClose}>Отмена</button>
          <button className="note-btn note-save" onClick={onSave}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function AudioIndicator({ config }: { config: AppConfig }) {
  const hasMic = !!config.audio_mic_device;
  const hasSys = !!config.audio_system_device;
  return (
    <div className="audio-ind">
      <div className={`audio-ind-item ${hasMic ? 'ok' : 'warn'}`}>
        <span className="audio-ind-dot" />
        <span>Микрофон: {hasMic ? config.audio_mic_device : 'По умолчанию'}</span>
      </div>
      <div className={`audio-ind-item ${hasSys ? 'ok' : 'warn'}`}>
        <span className="audio-ind-dot" />
        <span>Системный: {hasSys ? config.audio_system_device : 'По умолчанию'}</span>
      </div>
    </div>
  );
}
