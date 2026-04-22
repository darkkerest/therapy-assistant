import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Session, Turn, TherapistNote, Hint, TranscriptResult } from '../types';

export function useSession(clientId: string) {
  const startTime = useRef<number>(0);
  const [session, setSession] = useState<Session | null>(null);

  const startSession = useCallback(() => {
    startTime.current = Date.now();
    setSession({
      id: uuidv4(),
      clientId,
      startedAt: startTime.current,
      turns: [],
      hints: [],
      notes: [],
      speakerMap: {},
    });
  }, [clientId]);

  const stopSession = useCallback(() => {
    // Session stays in memory until finalized
  }, []);

  const elapsedSeconds = useCallback(() => {
    if (!startTime.current) return 0;
    return Math.floor((Date.now() - startTime.current) / 1000);
  }, []);

  const addTranscriptResult = useCallback(
    (result: TranscriptResult) => {
      setSession((prev) => {
        if (!prev) return prev;

        const speakerIndex = result.speaker ?? -1;
        const elapsed = elapsedSeconds();

        // Determine role from speaker map
        let role: Turn['speaker'] = 'unknown';
        if (speakerIndex >= 0) {
          if (prev.speakerMap[speakerIndex]) {
            role = prev.speakerMap[speakerIndex];
          } else if (Object.keys(prev.speakerMap).length === 0) {
            // First speaker detected — assign as therapist by default
            role = 'therapist';
          } else {
            role = 'client';
          }
        }

        // Update speaker map
        const newSpeakerMap = { ...prev.speakerMap };
        if (speakerIndex >= 0 && !newSpeakerMap[speakerIndex]) {
          newSpeakerMap[speakerIndex] = role as 'therapist' | 'client';
        }

        if (result.is_final) {
          const turn: Turn = {
            id: uuidv4(),
            speaker: role,
            text: result.transcript,
            timestamp: elapsed,
            isFinal: true,
          };
          return { ...prev, turns: [...prev.turns, turn], speakerMap: newSpeakerMap };
        } else {
          // Update interim turn (last non-final with same speaker)
          const turns = [...prev.turns];
          const lastIdx = turns.findLastIndex(
            (t) => !t.isFinal && t.speaker === role
          );
          if (lastIdx >= 0) {
            turns[lastIdx] = { ...turns[lastIdx], text: result.transcript };
          } else {
            turns.push({
              id: uuidv4(),
              speaker: role,
              text: result.transcript,
              timestamp: elapsed,
              isFinal: false,
            });
          }
          return { ...prev, turns, speakerMap: newSpeakerMap };
        }
      });
    },
    [elapsedSeconds]
  );

  const addHint = useCallback((text: string, triggeredBy: Hint['triggeredBy']) => {
    setSession((prev) => {
      if (!prev) return prev;
      const hint: Hint = {
        id: uuidv4(),
        text,
        timestamp: Math.floor((Date.now() - startTime.current) / 1000),
        triggeredBy,
      };
      return { ...prev, hints: [...prev.hints, hint] };
    });
  }, []);

  const addNote = useCallback((text: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const note: TherapistNote = {
        id: uuidv4(),
        text,
        timestamp: Math.floor((Date.now() - startTime.current) / 1000),
      };
      return { ...prev, notes: [...prev.notes, note] };
    });
  }, []);

  const swapSpeakers = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const newMap: Record<number, 'therapist' | 'client'> = {};
      for (const [k, v] of Object.entries(prev.speakerMap)) {
        newMap[Number(k)] = v === 'therapist' ? 'client' : 'therapist';
      }
      const newTurns = prev.turns.map((t) => ({
        ...t,
        speaker:
          t.speaker === 'therapist'
            ? ('client' as const)
            : t.speaker === 'client'
            ? ('therapist' as const)
            : t.speaker,
      }));
      return { ...prev, speakerMap: newMap, turns: newTurns };
    });
  }, []);

  const getRecentTurns = useCallback(
    (count = 1000) => {
      return session?.turns.filter((t) => t.isFinal).slice(-count) ?? [];
    },
    [session]
  );

  const hasRecentSpeech = useCallback(
    (withinSeconds = 15) => {
      if (!session) return false;
      const elapsed = elapsedSeconds();
      return session.turns.some(
        (t) => t.isFinal && elapsed - t.timestamp <= withinSeconds
      );
    },
    [session, elapsedSeconds]
  );

  return {
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
  };
}
