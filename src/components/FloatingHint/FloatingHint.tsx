import { useState, useEffect } from 'react';
import type { Session } from '../../types';
import './FloatingHint.css';

interface Props {
  session: Session | null;
  clientName: string;
  elapsedSeconds: number;
  lastHint: string | null;
  hintLoading: boolean;
  transcriptionStatus: string;
  transcriptionStatusMessage: string;
  onExpand: () => void;
  onManualHint: () => void;
  onNote: () => void;
  onEndSession: () => void;
  onSwapSpeakers: () => void;
}

export function FloatingHint({
  session,
  clientName,
  elapsedSeconds,
  lastHint,
  hintLoading,
  transcriptionStatus,
  transcriptionStatusMessage,
  onExpand,
  onManualHint,
  onNote,
  onEndSession,
  onSwapSpeakers,
}: Props) {
  const [hintVisible, setHintVisible] = useState(false);
  const [displayedHint, setDisplayedHint] = useState<string | null>(null);

  useEffect(() => {
    if (lastHint && lastHint !== displayedHint) {
      setHintVisible(false);
      setTimeout(() => {
        setDisplayedHint(lastHint);
        setHintVisible(true);
      }, 200);
    }
  }, [lastHint]);

  const elapsed = formatTime(elapsedSeconds);
  const isTranscriptReady = transcriptionStatus === 'ready';
  const finalTurns = session?.turns.filter((t) => t.isFinal) ?? [];
  const lastTurn = finalTurns[finalTurns.length - 1];

  return (
    <div className="floating-hint">
      <div className="fh-header">
        <div className="fh-client">
          <span className={`fh-dot ${isTranscriptReady ? 'ready' : 'loading'}`} />
          <span className="fh-client-name">{clientName || 'Сессия'}</span>
        </div>
        <div className="fh-controls">
          <span className="fh-timer">{elapsed}</span>
          <button className="fh-btn fh-btn-expand" onClick={onExpand} title="Развернуть">
            ⤢
          </button>
        </div>
      </div>

      <div className={`fh-hint ${hintVisible ? 'visible' : ''}`}>
        {hintLoading ? (
          <span className="fh-loading">Думаю…</span>
        ) : displayedHint ? (
          <p>{displayedHint}</p>
        ) : (
          <p className="fh-placeholder">{transcriptionStatusMessage || 'Нажмите ⌘⇧H для подсказки'}</p>
        )}
      </div>

      {lastTurn && (
        <div className="fh-last-turn">
          <span className={`fh-speaker fh-speaker-${lastTurn.speaker}`}>
            {lastTurn.speaker === 'therapist' ? 'Т' : 'К'}
          </span>
          <span className="fh-turn-text">{lastTurn.text}</span>
        </div>
      )}

      <div className="fh-actions">
        <button className="fh-action-btn" onClick={onManualHint} title="Подсказка (⌘⇧H)">
          💡
        </button>
        <button className="fh-action-btn" onClick={onNote} title="Заметка (⌘⇧N)">
          📝
        </button>
        <button className="fh-action-btn" onClick={onSwapSpeakers} title="Поменять спикеров">
          ⇄
        </button>
        <button className="fh-action-btn fh-action-end" onClick={onEndSession} title="Завершить (⌘⇧S)">
          ■
        </button>
      </div>
    </div>
  );
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
