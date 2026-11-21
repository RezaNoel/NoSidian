import { stripModelExtension, validateGltfFileName } from '../petGltf';

export interface CustomPetModelMeta {
  id: string;
  name: string;
  fileName: string;
  byteSize: number;
  createdAt: number;
}

interface StoredPetModelRecord extends CustomPetModelMeta {
  buffer: ArrayBuffer;
}

const DB_NAME = 'nosidian_pet_models_db_v1';
const STORE_NAME = 'models';
const memoryFallback = new Map<string, StoredPetModelRecord>();

function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open pet model DB'));
  });
}

export async function saveCustomPetModelFile(file: File): Promise<CustomPetModelMeta> {
  if (!validateGltfFileName(file.name)) {
    throw new Error('Only .glb or .gltf 3D models are supported.');
  }
  const buffer = await file.arrayBuffer();
  const id = `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const record: StoredPetModelRecord = {
    id,
    name: stripModelExtension(file.name),
    fileName: file.name,
    byteSize: buffer.byteLength,
    createdAt: Date.now(),
    buffer
  };
  memoryFallback.set(id, record);

  try {
    const db = await openModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback to in-memory store in restricted environments
  }

  return {
    id: record.id,
    name: record.name,
    fileName: record.fileName,
    byteSize: record.byteSize,
    createdAt: record.createdAt
  };
}

export async function loadCustomPetModelBuffer(id: string): Promise<ArrayBuffer | null> {
  const mem = memoryFallback.get(id);
  if (mem) return mem.buffer.slice(0);

  try {
    const db = await openModelDb();
    const record = await new Promise<StoredPetModelRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as StoredPetModelRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (record?.buffer) {
      memoryFallback.set(id, record);
      return record.buffer.slice(0);
    }
  } catch {
    // Ignore storage read failure
  }
  return null;
}

export async function deleteCustomPetModel(id: string): Promise<void> {
  memoryFallback.delete(id);
  try {
    const db = await openModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore storage delete error
  }
}
