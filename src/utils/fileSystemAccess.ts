/**
 * File System Access API 封装
 * 用于读写本地 Claude settings.json
 */

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemFileHandle {
    queryPermission?: (
      descriptor?: FileSystemHandlePermissionDescriptor
    ) => Promise<PermissionState>;
    requestPermission?: (
      descriptor?: FileSystemHandlePermissionDescriptor
    ) => Promise<PermissionState>;
  }

  interface Window {
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions
    ) => Promise<FileSystemFileHandle[]>;
  }
}

interface OpenFilePickerOptions {
  types?: {
    description?: string;
    accept: Record<string, string[]>;
  }[];
  multiple?: boolean;
}

const HANDLES_DB_NAME = 'cpamc-file-handles';
const HANDLES_STORE_NAME = 'handles';
const SETTINGS_HANDLE_KEY = 'claude-settings-json';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

export async function pickSettingsFile(): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessSupported()) return null;

  try {
    const [handle] = await window.showOpenFilePicker!({
      types: [
        {
          description: 'JSON File',
          accept: { 'application/json': ['.json'] },
        },
      ],
      multiple: false,
    });
    return handle ?? null;
  } catch (error: unknown) {
    // User cancelled the picker
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}

export async function readJsonFromHandle<T>(handle: FileSystemFileHandle): Promise<T> {
  const file = await handle.getFile();
  const text = await file.text();
  return JSON.parse(text) as T;
}

// Backward-compatible alias for previous naming.
export const pickJsonFile = pickSettingsFile;

export async function ensureHandlePermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite',
  prompt: boolean
): Promise<boolean> {
  try {
    // 部分环境未实现 permission API，直接继续后续读写流程，由实际 IO 决定是否报错。
    if (
      typeof handle.queryPermission !== 'function' &&
      typeof handle.requestPermission !== 'function'
    ) {
      return true;
    }

    const query = await handle.queryPermission?.({ mode });
    if (query === 'granted') return true;

    if (!prompt) return false;

    const request = await handle.requestPermission?.({ mode });
    return request === 'granted';
  } catch {
    return false;
  }
}

export async function writeJsonToHandle<T>(
  handle: FileSystemFileHandle,
  data: T
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    const json = JSON.stringify(data, null, 2) + '\n';
    await writable.write(json);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

function openHandlesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLES_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLES_STORE_NAME)) {
        db.createObjectStore(HANDLES_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openHandlesDb();

  try {
    const transaction = db.transaction(HANDLES_STORE_NAME, mode);
    const store = transaction.objectStore(HANDLES_STORE_NAME);
    const result = await executor(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });

    return result;
  } finally {
    db.close();
  }
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function saveSettingsFileHandle(handle: FileSystemFileHandle): Promise<void> {
  if (!isFileSystemAccessSupported()) return;

  await withStore('readwrite', async (store) => {
    await toPromise(store.put(handle, SETTINGS_HANDLE_KEY));
  });
}

export async function loadSavedSettingsFileHandle(): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessSupported()) return null;

  return withStore('readonly', async (store) => {
    const value = await toPromise(store.get(SETTINGS_HANDLE_KEY));
    if (value && typeof value === 'object') {
      return value as FileSystemFileHandle;
    }
    return null;
  });
}

export async function clearSavedSettingsFileHandle(): Promise<void> {
  if (!isFileSystemAccessSupported()) return;

  await withStore('readwrite', async (store) => {
    await toPromise(store.delete(SETTINGS_HANDLE_KEY));
  });
}
