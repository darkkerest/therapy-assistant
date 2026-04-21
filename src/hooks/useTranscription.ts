import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TranscriptResult } from '../types';

interface UseTranscriptionOptions {
  micDevice: string;
  systemDevice: string;
  deepgramKey: string;
  language: string;
  onResult: (result: TranscriptResult) => void;
}

export function useTranscription(opts: UseTranscriptionOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const unlisten = await listen<TranscriptResult>('transcript', (event) => {
        opts.onResult(event.payload);
      });
      unlistenRef.current = unlisten;

      await invoke('start_audio_capture', {
        micDevice: opts.micDevice,
        systemDevice: opts.systemDevice,
        deepgramKey: opts.deepgramKey,
        language: opts.language,
      });

      setIsRunning(true);
    } catch (e) {
      setError(String(e));
      unlistenRef.current?.();
    }
  }, [opts]);

  const stop = useCallback(async () => {
    try {
      await invoke('stop_audio_capture');
    } catch (e) {
      console.error('stop_audio_capture:', e);
    }
    unlistenRef.current?.();
    unlistenRef.current = null;
    setIsRunning(false);
  }, []);

  return { isRunning, error, start, stop };
}
