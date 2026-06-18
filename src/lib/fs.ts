/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Single engine File System interface: only local folder (FSA API)
export type FsMode = 'FSA_API';

// IndexedDB for handle storage (directory handles are persisted here)
const HANDLE_DB_NAME = 'KoraOfflineFSHandles';
const HANDLE_STORE_NAME = 'handles';
const FSA_HANDLE_KEY = 'lastDirectoryHandle';

function initHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await initHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = handle ? store.put(handle, FSA_HANDLE_KEY) : store.delete(FSA_HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await initHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.get(FSA_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearDirectoryHandle(): Promise<void> {
  const db = await initHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.delete(FSA_HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Save an FSA handle with a custom key (for multi-project support) */
export async function saveDirectoryHandleWithKey(handle: FileSystemDirectoryHandle, key: string): Promise<void> {
  const db = await initHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.put(handle, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Load an FSA handle by custom key */
export async function loadDirectoryHandleByKey(key: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await initHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/** Delete an FSA handle by custom key */
export async function deleteDirectoryHandleByKey(key: string): Promise<void> {
  const db = await initHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Virtual FS IndexedDB (kept for ZIP backup/restore and legacy data access)
const DB_NAME = 'KoraOfflineVirtualFS';
const STORE_NAME = 'files';

function initIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbSet(key: string, value: { content: string | Blob; isBinary: boolean; lastModified: number }): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet(key: string): Promise<{ content: string | Blob; isBinary: boolean; lastModified: number } | null> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function dbDelete(key: string): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function dbGetAllKeys(): Promise<string[]> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result.map(k => k.toString()));
    request.onerror = () => reject(request.error);
  });
}

export async function dbClear(): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Normalizes file paths to ensure consistent format (e.g., lowercase list/tasks folders paths).
 */
export function normalizePath(path: string): string {
  let cleaned = path.replace(/\\\\/g, '/');
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  return cleaned;
}

/**
 * File system adapter providing a unified API for the real disk (FSA API).
 * Note: Virtual mode has been removed; all operations now go through the File System Access API.
 */
export class FileSystemAdapter {
  private mode: FsMode = 'FSA_API';
  private rootDirectoryHandle: FileSystemDirectoryHandle | null = null;

  constructor(mode: FsMode = 'FSA_API', handle: FileSystemDirectoryHandle | null = null) {
    this.mode = mode;
    this.rootDirectoryHandle = handle;
  }

  getMode(): FsMode {
    return this.mode;
  }

  getDirectoryHandle(): FileSystemDirectoryHandle | null {
    return this.rootDirectoryHandle;
  }

  /**
   * Safe helper to trace subfolder tree in File System Access API
   */
  private async getDirectoryHandleForPath(path: string, create = false): Promise<FileSystemDirectoryHandle | null> {
    if (!this.rootDirectoryHandle) return null;
    const parts = normalizePath(path).split('/').filter(Boolean);
    if (parts.length <= 1) {
      return this.rootDirectoryHandle;
    }
    // Traverse parent folders (all parts except last element which is filename)
    let current = this.rootDirectoryHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create });
    }
    return current;
  }

  /**
   * Read file as string
   */
  async readTextFile(path: string): Promise<string> {
    const normalized = normalizePath(path);
    if (!this.rootDirectoryHandle) {
      throw new Error('No directory handle selected.');
    }
    const dirHandle = await this.getDirectoryHandleForPath(normalized, false);
    if (!dirHandle) {
      throw new Error(`Folder path not found for: ${normalized}`);
    }
    const parts = normalized.split('/').filter(Boolean);
    const filename = parts[parts.length - 1];
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  /**
   * Write string structure to file
   */
  async writeTextFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.rootDirectoryHandle) {
      throw new Error('No directory handle selected.');
    }
    const dirHandle = await this.getDirectoryHandleForPath(normalized, true);
    if (!dirHandle) {
      throw new Error(`Could not access or create folders for: ${normalized}`);
    }
    const parts = normalized.split('/').filter(Boolean);
    const filename = parts[parts.length - 1];
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * Save binary file (Blob / File)
   */
  async writeBinaryFile(path: string, blob: Blob): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.rootDirectoryHandle) {
      throw new Error('No directory handle selected.');
    }
    const dirHandle = await this.getDirectoryHandleForPath(normalized, true);
    if (!dirHandle) {
      throw new Error(`Could not access or create folders for: ${normalized}`);
    }
    const parts = normalized.split('/').filter(Boolean);
    const filename = parts[parts.length - 1];
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const buffer = await blob.arrayBuffer();
    await writable.write(buffer);
    await writable.close();
  }

  /**
   * Read binary file as localBlob
   */
  async readBinaryFile(path: string): Promise<Blob> {
    const normalized = normalizePath(path);
    if (!this.rootDirectoryHandle) {
      throw new Error('No directory handle selected.');
    }
    const dirHandle = await this.getDirectoryHandleForPath(normalized, false);
    if (!dirHandle) {
      throw new Error(`Folder path not found for: ${normalized}`);
    }
    const parts = normalized.split('/').filter(Boolean);
    const filename = parts[parts.length - 1];
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file;
  }

  /**
   * Delete file
   */
  async deleteFile(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.rootDirectoryHandle) {
      throw new Error('No directory handle selected.');
    }
    const dirHandle = await this.getDirectoryHandleForPath(normalized, false);
    if (!dirHandle) return;
    const parts = normalized.split('/').filter(Boolean);
    const filename = parts[parts.length - 1];
    try {
      await dirHandle.removeEntry(filename);
    } catch (err) {
      console.warn(`File could not be removed: ${filename}`, err);
    }
  }

  /**
   * List files in a directory path
   */
  async listFiles(subFolder: string): Promise<string[]> {
    const folderNormalized = normalizePath(subFolder).replace(/\/$/, '') + '/';
    if (!this.rootDirectoryHandle) {
      return [];
    }
    try {
      const parts = folderNormalized.split('/').filter(Boolean);
      let dir: FileSystemDirectoryHandle = this.rootDirectoryHandle;
      for (const p of parts) {
        dir = await dir.getDirectoryHandle(p);
      }
      const files: string[] = [];
      for await (const entry of (dir as any).values()) {
        if (entry.kind === 'file') {
          files.push(entry.name);
        }
      }
      return files;
    } catch (e) {
      // Folder might not exist yet
      return [];
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    if (!this.rootDirectoryHandle) return false;
    try {
      const dirHandle = await this.getDirectoryHandleForPath(normalized, false);
      if (!dirHandle) return false;
      const parts = normalized.split('/').filter(Boolean);
      const filename = parts[parts.length - 1];
      await dirHandle.getFileHandle(filename);
      return true;
    } catch {
      return false;
    }
  }
}
