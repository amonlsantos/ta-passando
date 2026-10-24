import type { EpgSnapshot } from '../xmltv/parse';

const DB_NAME = 'ta-passando';
const DB_VERSION = 1;
const STORE = 'epg';
const KEY = 'snapshot';

function openDatabase(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(undefined);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

export async function readSnapshot(): Promise<EpgSnapshot | undefined> {
  const database = await openDatabase();
  if (!database) {
    return undefined;
  }

  return new Promise((resolve) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);

    request.onsuccess = () => {
      const value = request.result as EpgSnapshot | undefined;
      resolve(value && Array.isArray(value.channels) ? value : undefined);
    };
    request.onerror = () => resolve(undefined);
  });
}

export async function writeSnapshot(snapshot: EpgSnapshot): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(snapshot, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}
