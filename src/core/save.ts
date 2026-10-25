import { migrate, type GameState } from './state';

const DB_NAME = 'tree92776';
const STORE = 'saves';
const KEY = 'main';
const LS_KEY = 'tree92776-save';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

export async function saveGame(s: GameState): Promise<void> {
  s.lastSaved = Date.now();
  const data = JSON.parse(JSON.stringify(s));
  // 同步寫入 localStorage 作為備援（頁面關閉時 IndexedDB 可能來不及完成）
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* 容量不足等 */ }
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB 不可用（例如部分私密瀏覽模式）時僅保留 localStorage
  }
}

/** 讀取 IndexedDB 與 localStorage，取較新的一份。 */
export async function loadGame(): Promise<GameState | null> {
  const found: GameState[] = [];
  try {
    const d = await db();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (raw) found.push(migrate(raw));
  } catch { /* 改讀 localStorage */ }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) found.push(migrate(JSON.parse(raw)));
  } catch { /* 無存檔 */ }
  found.sort((a, b) => b.lastSaved - a.lastSaved);
  return found[0] ?? null;
}

export async function clearSave(): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

export function exportSave(s: GameState): string {
  return JSON.stringify({ game: '92776', ...s }, null, 2);
}

export function importSave(text: string): GameState {
  const raw = JSON.parse(text);
  if (raw?.game !== '92776') throw new Error('這不是 92,776 的存檔');
  delete raw.game;
  return migrate(raw);
}
