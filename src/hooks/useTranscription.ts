import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TranscriptResult } from '../types';

type TranscriptionStatus = 'idle' | 'starting' | 'loading' | 'ready' | 'error';

interface UseTranscriptionOptions {
  micDevice: string;
  systemDevice: string;
  deepgramKey: string;
  language: string;
  transcribeBackend: string;
  onResult: (result: TranscriptResult) => void;
}

export function useTranscription(opts: UseTranscriptionOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('Готов к запуску');
  const unlistenRef = useRef<(() => void) | null>(null);
  const unlistenErrorRef = useRef<(() => void) | null>(null);
  const unlistenStatusRef = useRef<(() => void) | null>(null);

  const cleanupListeners = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    unlistenErrorRef.current?.();
    unlistenErrorRef.current = null;
    unlistenStatusRef.current?.();
    unlistenStatusRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('starting');
    setStatusMessage('Запускаю локальную транскрипцию...');
    try {
      const unlisten = await listen<TranscriptResult>('transcript', (event) => {
        opts.onResult(event.payload);
      });
      unlistenRef.current = unlisten;

      const unlistenError = await listen<{ message: string }>('transcription-error', (event) => {
        setError(event.payload.message);
        setStatus('error');
        setStatusMessage(event.payload.message);
      });
      unlistenErrorRef.current = unlistenError;

      const unlistenStatus = await listen<{ phase: TranscriptionStatus; message: string }>(
        'transcription-status',
        (event) => {
          setStatus(event.payload.phase);
          setStatusMessage(event.payload.message);
        }
      );
      unlistenStatusRef.current = unlistenStatus;

      await invoke('start_audio_capture', {
        micDevice: opts.micDevice,
        systemDevice: opts.systemDevice,
        deepgramKey: opts.deepgramKey,
        language: opts.language,
        transcribeBackend: opts.transcribeBackend,
      });

      setIsRunning(true);
      return true;
    } catch (e) {
      const message = String(e);
      setError(message);
      setStatus('error');
      setStatusMessage(message);
      cleanupListeners();
      setIsRunning(false);
      return false;
    }
  }, [opts, cleanupListeners]);

  const stop = useCallback(async () => {
    try {
      await invoke('stop_audio_capture');
    } catch (e) {
      console.error('stop_audio_capture:', e);
    }
    cleanupListeners();
    setIsRunning(false);
    setStatus('idle');
    setStatusMessage('Готов к запуску');
  }, [cleanupListeners]);

  return { isRunning, error, status, statusMessage, start, stop };
}
