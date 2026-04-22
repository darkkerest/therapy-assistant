import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, ClientInfo, Session } from '../types';

export async function readConfig(): Promise<AppConfig> {
  return invoke('read_config');
}

export async function writeConfig(config: AppConfig): Promise<void> {
  return invoke('write_config', { config });
}

export async function ensureDataDirs(dataPath: string): Promise<void> {
  return invoke('ensure_data_dirs', { dataPath });
}

export async function listClients(dataPath: string): Promise<ClientInfo[]> {
  const raw: Array<{ id: string; name: string; session_count: number }> =
    await invoke('list_clients', { dataPath });
  return raw.map((c) => ({ id: c.id, name: c.name, sessionCount: c.session_count }));
}

export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function openInExplorer(path: string): Promise<void> {
  return invoke('open_in_explorer', { path });
}

export function clientDir(dataPath: string, clientId: string): string {
  return `${dataPath}/clients/${clientId}`;
}

export function profilePath(dataPath: string, clientId: string): string {
  return `${clientDir(dataPath, clientId)}/profile.md`;
}

export function sessionPath(dataPath: string, clientId: string, date: string): string {
  return `${clientDir(dataPath, clientId)}/sessions/${date}.md`;
}

export async function createClient(
  dataPath: string,
  id: string,
  name: string
): Promise<void> {
  const profile = `# ${name}\n\n## Запрос\n\n## Ключевые темы\n\n## Что работает\n\n## Что не работает / триггеры\n\n## Заметки\n`;
  await writeFile(profilePath(dataPath, id), profile);
}

export async function readProfile(dataPath: string, clientId: string): Promise<string> {
  try {
    return await readFile(profilePath(dataPath, clientId));
  } catch {
    return '';
  }
}

export async function readRecentSessions(
  dataPath: string,
  clientId: string,
  count = 3
): Promise<string[]> {
  const dir = `${clientDir(dataPath, clientId)}/sessions`;
  try {
    // Read via Tauri FS — list not available via invoke in our setup, use a workaround
    // We call read_file on last N known session files — approximation for v1
    const today = new Date();
    const results: string[] = [];
    for (let i = 0; i < 30 && results.length < count; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      try {
        const content = await readFile(`${dir}/${dateStr}.md`);
        results.push(extractSessionMemory(content, dateStr));
      } catch {
        // no session on this date
      }
    }
    return results;
  } catch {
    return [];
  }
}

function extractSessionMemory(content: string, date: string): string {
  const summary = extractMarkdownSection(content, 'Саммари');
  const keyPoints = extractMarkdownSection(content, 'Ключевые моменты');
  const notes = extractMarkdownSection(content, 'Заметки терапевта');
  const transcript = extractMarkdownSection(content, 'Транскрипт');

  const parts = [`Дата: ${date}`];

  if (summary) {
    parts.push(`Саммари:\n${limitText(summary, 1200)}`);
  }

  if (keyPoints) {
    parts.push(`Ключевые моменты:\n${limitText(keyPoints, 1800)}`);
  }

  if (notes && notes !== '—') {
    parts.push(`Заметки терапевта:\n${limitText(notes, 800)}`);
  }

  if (parts.length > 1) {
    return parts.join('\n\n');
  }

  if (transcript) {
    return `Дата: ${date}\n\nФрагмент транскрипта:\n${limitText(transcript, 2500)}`;
  }

  return limitText(content, 2500);
}

function extractMarkdownSection(content: string, title: string): string {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)## ${escapedTitle}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(re);
  return match?.[1]?.trim() ?? '';
}

function limitText(text: string, maxChars: number): string {
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

export async function readApproaches(dataPath: string): Promise<string> {
  try {
    return await readFile(`${dataPath}/my-context/approaches.md`);
  } catch {
    return '';
  }
}

export async function writeApproaches(dataPath: string, text: string): Promise<void> {
  await writeFile(`${dataPath}/my-context/approaches.md`, text);
}

export function formatSessionFile(
  session: Session,
  _clientName: string,
  summary: string,
  keyPoints: string
): string {
  const date = new Date(session.startedAt).toLocaleDateString('ru-RU');
  const turns = session.turns
    .filter((t) => t.isFinal)
    .map((t) => {
      const ts = formatTimestamp(t.timestamp);
      const label = t.speaker === 'therapist' ? 'Терапевт' : 'Клиент';
      return `[${ts}] ${label}: ${t.text}`;
    })
    .join('\n');

  const notes = session.notes
    .map((n) => `[${formatTimestamp(n.timestamp)}] ${n.text}`)
    .join('\n');

  return `# Сессия ${date}\n\n## Саммари\n${summary}\n\n## Ключевые моменты\n${keyPoints}\n\n## Заметки терапевта\n${notes || '—'}\n\n## Транскрипт\n${turns}\n`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function generateSessionDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => translitMap[c] ?? c)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

const translitMap: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};
