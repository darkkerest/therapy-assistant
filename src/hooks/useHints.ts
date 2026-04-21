import { useState, useCallback, useRef } from 'react';
import { requestHint } from '../lib/claude';
import { readApproaches, readProfile, readRecentSessions } from '../lib/storage';
import type { Turn, Hint, AppConfig } from '../types';

interface UseHintsOptions {
  config: AppConfig;
  clientId: string;
  getRecentTurns: () => Turn[];
  hasRecentSpeech: () => boolean;
  onHint: (text: string, triggeredBy: Hint['triggeredBy']) => void;
}

export function useHints(opts: UseHintsOptions) {
  const [loading, setLoading] = useState(false);
  const [lastHint, setLastHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const fetchHint = useCallback(
    async (triggeredBy: Hint['triggeredBy'] = 'manual') => {
      if (loading) return;
      if (!opts.config.anthropic_api_key) {
        setError('Anthropic API key not set');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [approaches, profile, recentSessions] = await Promise.all([
          readApproaches(opts.config.data_path),
          readProfile(opts.config.data_path, opts.clientId),
          readRecentSessions(opts.config.data_path, opts.clientId, 3),
        ]);

        const hint = await requestHint({
          anthropicKey: opts.config.anthropic_api_key,
          approaches,
          profile,
          recentSessions,
          recentTurns: opts.getRecentTurns(),
        });

        setLastHint(hint);
        opts.onHint(hint, triggeredBy);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [loading, opts]
  );

  const scheduleNext = useCallback(() => {
    if (!activeRef.current) return;
    const interval = (opts.config.hints_interval_seconds || 60) * 1000;
    timerRef.current = setTimeout(async () => {
      if (
        activeRef.current &&
        opts.config.hints_mode !== 'manual' &&
        opts.hasRecentSpeech()
      ) {
        await fetchHint('auto');
      }
      scheduleNext();
    }, interval);
  }, [opts, fetchHint]);

  const startAutoHints = useCallback(() => {
    activeRef.current = true;
    scheduleNext();
  }, [scheduleNext]);

  const stopAutoHints = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerManual = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    fetchHint('manual').then(() => {
      if (activeRef.current) scheduleNext();
    });
  }, [fetchHint, scheduleNext]);

  return {
    loading,
    lastHint,
    error,
    startAutoHints,
    stopAutoHints,
    triggerManual,
    fetchHint,
  };
}
