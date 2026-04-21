export interface Turn {
  id: string;
  speaker: 'therapist' | 'client' | 'unknown';
  text: string;
  timestamp: number; // seconds from session start
  isFinal: boolean;
}

export interface Hint {
  id: string;
  text: string;
  timestamp: number;
  triggeredBy: 'auto' | 'manual';
}

export interface TherapistNote {
  id: string;
  text: string;
  timestamp: number;
}

export interface Session {
  id: string;
  clientId: string;
  startedAt: number; // unix ms
  turns: Turn[];
  hints: Hint[];
  notes: TherapistNote[];
  speakerMap: Record<number, 'therapist' | 'client'>; // deepgram speaker index → role
}

export interface ClientInfo {
  id: string;
  name: string;
  sessionCount: number;
}

export interface AppConfig {
  data_path: string;
  deepgram_api_key: string;
  anthropic_api_key: string;
  audio_mic_device: string;
  audio_system_device: string;
  language: string;
  hints_mode: 'auto' | 'manual' | 'mixed';
  hints_interval_seconds: number;
  hotkey_hint: string;
  hotkey_note: string;
  hotkey_end: string;
}

export interface AudioDevice {
  id: string;
  name: string;
}

export type AppView =
  | 'onboarding'
  | 'start-session'
  | 'session-compact'
  | 'session-full'
  | 'settings';

export interface TranscriptResult {
  transcript: string;
  words: TranscriptWord[];
  speaker?: number;
  is_final: boolean;
  speech_final: boolean;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}
