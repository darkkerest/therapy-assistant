import { invoke } from '@tauri-apps/api/core';
import type { Turn, Session } from '../types';

export interface HintRequest {
  anthropicKey: string;
  approaches: string;
  profile: string;
  recentSessions: string[];
  recentTurns: Turn[];
}

export interface FinalizeRequest {
  anthropicKey: string;
  session: Session;
  clientName: string;
}

export interface FinalizeResult {
  summary: string;
  keyPoints: string;
}

export async function requestHint(req: HintRequest): Promise<string> {
  return invoke<string>('request_hint', {
    req: {
      anthropic_key: req.anthropicKey,
      approaches: req.approaches,
      profile: req.profile,
      recent_sessions: req.recentSessions,
      recent_turns: req.recentTurns
        .filter((t) => t.isFinal)
        .slice(-1000)
        .map((t) => ({ speaker: t.speaker, text: t.text })),
    },
  });
}

export async function finalizeSession(req: FinalizeRequest): Promise<FinalizeResult> {
  const transcript = req.session.turns
    .filter((t) => t.isFinal)
    .map((t) => {
      const label = t.speaker === 'therapist' ? 'Терапевт' : 'Клиент';
      return `${label}: ${t.text}`;
    })
    .join('\n');

  const result = await invoke<{ summary: string; key_points: string }>('finalize_session_claude', {
    req: {
      anthropic_key: req.anthropicKey,
      client_name: req.clientName,
      transcript,
    },
  });

  return { summary: result.summary, keyPoints: result.key_points };
}
