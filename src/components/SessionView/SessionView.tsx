import { useRef, useEffect } from 'react';
import type { Session } from '../../types';
import './SessionView.css';

interface Props {
  session: Session;
  clientName: string;
  elapsedSeconds: number;
  lastHint: string | null;
  hintLoading: boolean;
  onCollapse: () => void;
  onManualHint: () => void;
  onNote: () => void;
  onEndSession: () => void;
  onSwapSpeakers: () => void;
}

export function SessionView({
  session,
  clientName,
  elapsedSeconds,
  lastHint: _lastHint,
  hintLoading,
  onCollapse,
  onManualHint,
  onNote,
  onEndSession,
  onSwapSpeakers,
}: Props) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [session.turns.length]);

  const recentHints = session.hints.slice(-5).reverse();

  return (
    <div className="session-view">
      <div className="sv-header">
        <div className="sv-title">
          <span className="sv-dot" />
          <span className="sv-client">{clientName}</span>
          <span className="sv-timer">{formatTime(elapsedSeconds)}</span>
        </div>
        <div className="sv-header-actions">
          <button className="sv-btn" onClick={onSwapSpeakers} title="Поменять спикеров">⇄</button>
          <button className="sv-btn" onClick={onNote} title="Заметка (⌘⇧N)">📝</button>
          <button className="sv-btn" onClick={onManualHint} title="Подсказка (⌘⇧H)">💡</button>
          <button className="sv-btn sv-btn-end" onClick={onEndSession} title="Завершить (⌘⇧S)">Завершить</button>
          <button className="sv-btn" onClick={onCollapse} title="Свернуть">⤡</button>
        </div>
      </div>

      <div className="sv-body">
        <div className="sv-transcript-pane">
          <div className="sv-pane-label">Транскрипт</div>
          <div className="sv-transcript" ref={transcriptRef}>
            {session.turns.map((turn) => (
              <div key={turn.id} className={`sv-turn sv-turn-${turn.speaker} ${turn.isFinal ? '' : 'sv-turn-interim'}`}>
                <span className={`sv-speaker sv-speaker-${turn.speaker}`}>
                  {turn.speaker === 'therapist' ? 'Т' : turn.speaker === 'client' ? 'К' : '?'}
                </span>
                <div className="sv-turn-content">
                  <span className="sv-turn-time">{formatTimestamp(turn.timestamp)}</span>
                  <p className="sv-turn-text">{turn.text}</p>
                </div>
              </div>
            ))}
            {session.turns.length === 0 && (
              <p className="sv-empty">Ожидание речи…</p>
            )}
          </div>
        </div>

        <div className="sv-hints-pane">
          <div className="sv-pane-label">Подсказки</div>
          <div className="sv-hints">
            {hintLoading && (
              <div className="sv-hint sv-hint-loading">
                <span>Думаю…</span>
              </div>
            )}
            {recentHints.map((hint) => (
              <div key={hint.id} className="sv-hint">
                <span className="sv-hint-time">{formatTimestamp(hint.timestamp)}</span>
                <p className="sv-hint-text">{hint.text}</p>
              </div>
            ))}
            {recentHints.length === 0 && !hintLoading && (
              <p className="sv-empty">Нажмите 💡 или ⌘⇧H</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatTimestamp(secs: number): string {
  return formatTime(secs);
}
