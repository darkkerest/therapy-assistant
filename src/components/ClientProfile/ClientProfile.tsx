import { useState, useEffect, useRef } from 'react';
import type { ClientInfo } from '../../types';
import { readProfile, writeFile, profilePath } from '../../lib/storage';
import './ClientProfile.css';

interface Props {
  client: ClientInfo;
  dataPath: string;
  onStart: () => void;
}

export function ClientProfile({ client, dataPath, onStart }: Props) {
  const [profile, setProfile] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setSaved(false);
    readProfile(dataPath, client.id).then((text) => {
      setProfile(text);
      setLoading(false);
    });
  }, [client.id, dataPath]);

  const save = async (text: string) => {
    setSaving(true);
    await writeFile(profilePath(dataPath, client.id), text);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (value: string) => {
    setProfile(value);
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(value), 1500);
  };

  const handleSaveNow = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    save(profile);
  };

  const handlePaste = () => {
    textareaRef.current?.focus();
  };

  return (
    <div className="cp-root">
      <div className="cp-header">
        <div className="cp-client-info">
          <div className="cp-avatar">{client.name.charAt(0).toUpperCase()}</div>
          <div>
            <p className="cp-name">{client.name}</p>
            <p className="cp-meta">{client.sessionCount} сессий</p>
          </div>
        </div>
        <button className="cp-start-btn" onClick={onStart}>
          Начать сессию →
        </button>
      </div>

      <div className="cp-context-section">
        <div className="cp-context-header">
          <span className="cp-section-title">Контекст клиента</span>
          <div className="cp-context-actions">
            {saving && <span className="cp-status cp-status-saving">Сохраняю…</span>}
            {saved && !saving && <span className="cp-status cp-status-saved">Сохранено ✓</span>}
            <button className="cp-paste-btn" onClick={handlePaste} title="Нажми и вставь (⌘V)">
              Вставить
            </button>
            <button className="cp-save-btn" onClick={handleSaveNow} disabled={saving}>
              Сохранить
            </button>
          </div>
        </div>
        <p className="cp-hint-text">
          Вставь сюда любой контекст — запрос клиента, историю, ключевые темы.
          Автосохранение через 1.5 сек после редактирования.
        </p>
        {loading ? (
          <div className="cp-loading">Загрузка…</div>
        ) : (
          <textarea
            ref={textareaRef}
            className="cp-textarea"
            value={profile}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={`# ${client.name}\n\n## Запрос\n\n## Ключевые темы\n\n## Что работает\n\n## Триггеры / что не работает\n\n## Заметки`}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
