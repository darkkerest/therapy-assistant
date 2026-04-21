import { useState } from 'react';
import type { ClientInfo } from '../../types';
import { createClient, slugify } from '../../lib/storage';
import './ClientList.css';

interface Props {
  clients: ClientInfo[];
  dataPath: string;
  onSelect: (client: ClientInfo) => void;
  onRefresh: () => void;
}

export function ClientList({ clients, dataPath, onSelect, onRefresh }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = slugify(name) || `client-${Date.now()}`;
    try {
      await createClient(dataPath, id, name);
      setNewName('');
      setCreating(false);
      onRefresh();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="client-list">
      <div className="cl-header">
        <span className="cl-title">Клиенты</span>
        <button className="cl-add-btn" onClick={() => setCreating(true)}>+</button>
      </div>

      {creating && (
        <div className="cl-new">
          <input
            autoFocus
            className="cl-input"
            placeholder="Имя клиента"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
          />
          <button className="cl-create-btn" onClick={handleCreate}>Создать</button>
          {error && <span className="cl-error">{error}</span>}
        </div>
      )}

      <div className="cl-items">
        {clients.length === 0 && !creating && (
          <p className="cl-empty">Нет клиентов. Нажмите +</p>
        )}
        {clients.map((c) => (
          <button key={c.id} className="cl-item" onClick={() => onSelect(c)}>
            <span className="cl-item-avatar">{c.name.charAt(0).toUpperCase()}</span>
            <div className="cl-item-info">
              <span className="cl-item-name">{c.name}</span>
              <span className="cl-item-sessions">{c.sessionCount} сессий</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
