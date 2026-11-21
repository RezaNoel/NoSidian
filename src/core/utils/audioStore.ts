// The user's own music files, kept in the app's IndexedDB so they play
// offline and are shared by every vault.
const DB = 'nosidian_music_v1';
const STORE = 'tracks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  } finally { db.close(); }
}

export const saveAudio = (id: string, blob: Blob) => tx('readwrite', (s) => { s.put(blob, id); });
export const deleteAudio = (id: string) => tx('readwrite', (s) => { s.delete(id); });
export const loadAudio = (id: string) => tx<Blob>('readonly', (s) => s.get(id));
