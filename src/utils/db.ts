import { TranscriptionProject } from '../types';

const DB_NAME = 'AudioScribeStudioDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_AUDIO = 'audioBlobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProjectToDB(project: TranscriptionProject): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PROJECTS], 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    
    // Create a clone without big base64 strings to keep project storage fast
    const projectToSave = { ...project };
    delete projectToSave.audioBlobUrl;
    // Keep audioBase64 small or strip if too large
    if (projectToSave.audioBase64 && projectToSave.audioBase64.length > 5000000) {
      delete projectToSave.audioBase64;
    }

    store.put(projectToSave);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage
    const existing = getAllProjectsFromStorage();
    const index = existing.findIndex((p) => p.id === project.id);
    const clean = { ...project };
    delete clean.audioBase64;
    delete clean.audioBlobUrl;

    if (index >= 0) {
      existing[index] = clean;
    } else {
      existing.unshift(clean);
    }
    try {
      localStorage.setItem('audioscribe_projects', JSON.stringify(existing.slice(0, 30)));
    } catch {
      // Ignore quota errors
    }
  }
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_AUDIO], 'readwrite');
    const store = tx.objectStore(STORE_AUDIO);
    store.put({ id, blob, updatedAt: new Date().toISOString() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not save audio blob in IndexedDB', e);
  }
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_AUDIO], 'readonly');
    const store = tx.objectStore(STORE_AUDIO);
    const req = store.get(id);

    return new Promise((resolve) => {
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllProjects(): Promise<TranscriptionProject[]> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PROJECTS], 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const index = store.index('createdAt');
    const req = index.getAll();

    return new Promise((resolve) => {
      req.onsuccess = () => {
        const results = (req.result || []) as TranscriptionProject[];
        // Sort newest first
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      req.onerror = () => {
        resolve(getAllProjectsFromStorage());
      };
    });
  } catch {
    return getAllProjectsFromStorage();
  }
}

export async function getProjectById(id: string): Promise<TranscriptionProject | null> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PROJECTS], 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.get(id);

    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    const list = getAllProjectsFromStorage();
    return list.find((p) => p.id === id) || null;
  }
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PROJECTS, STORE_AUDIO], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    tx.objectStore(STORE_AUDIO).delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = getAllProjectsFromStorage().filter((p) => p.id !== id);
    localStorage.setItem('audioscribe_projects', JSON.stringify(existing));
  }
}

export async function deleteMultipleProjectsFromDB(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PROJECTS, STORE_AUDIO], 'readwrite');
    const projectStore = tx.objectStore(STORE_PROJECTS);
    const audioStore = tx.objectStore(STORE_AUDIO);

    for (const id of ids) {
      projectStore.delete(id);
      audioStore.delete(id);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = getAllProjectsFromStorage().filter((p) => !idSet.has(p.id));
    localStorage.setItem('audioscribe_projects', JSON.stringify(existing));
  }
}

export async function clearAllProjectsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_PROJECTS, STORE_AUDIO], 'readwrite');
    tx.objectStore(STORE_PROJECTS).clear();
    tx.objectStore(STORE_AUDIO).clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.removeItem('audioscribe_projects');
  }
}

function getAllProjectsFromStorage(): TranscriptionProject[] {
  try {
    const raw = localStorage.getItem('audioscribe_projects');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
