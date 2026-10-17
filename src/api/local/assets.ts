/** Image storage for the local API. Blobs go to IndexedDB, which has far more room than localStorage. */

const DB_NAME = 'elum-write-assets';
const STORE = 'assets';

export interface AssetRow {
  id: string;
  docId: string;
  ownerId: string;
  mimeType: string;
  size: number;
  /** Raw bytes rather than a Blob: every browser can store these in IndexedDB. */
  bytes: ArrayBuffer;
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('docId', 'docId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const assetStore = {
  put: (row: AssetRow) => run('readwrite', (s) => s.put(row)).then(() => undefined),
  get: (id: string) => run<AssetRow | undefined>('readonly', (s) => s.get(id)),
  delete: (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined),
  idsForDocument: (docId: string) =>
    run<IDBValidKey[]>('readonly', (s) => s.index('docId').getAllKeys(docId)).then((keys) => keys.map(String)),
};
