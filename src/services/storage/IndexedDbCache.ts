interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheOptions {
  ttlMs?: number;
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return entry.expiresAt !== 0 && entry.expiresAt < Date.now();
}

export class IndexedDbCache {
  private dbPromise: Promise<IDBDatabase> | null;
  private memoryFallback = new Map<string, CacheEntry<unknown>>();
  private readonly useMemory: boolean;

  constructor(
    private readonly dbName = "pgm-cache",
    private readonly storeName = "kv",
    private readonly version = 1,
  ) {
    this.useMemory = typeof indexedDB === "undefined";
    this.dbPromise = this.useMemory ? null : this.openDatabase();
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useMemory) {
      const entry = this.memoryFallback.get(key) as CacheEntry<T> | undefined;
      if (!entry) return null;
      if (isExpired(entry)) {
        this.memoryFallback.delete(key);
        return null;
      }
      return entry.value;
    }

    const db = await this.dbPromise;
    if (!db) return null;
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        if (isExpired(entry)) {
          this.delete(key).catch(() => {});
          resolve(null);
          return;
        }
        resolve(entry.value);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttlMs = options.ttlMs ?? 0;
    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    };

    if (this.useMemory) {
      this.memoryFallback.set(key, entry);
      return;
    }

    const db = await this.dbPromise;
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.put(entry, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(key: string): Promise<void> {
    if (this.useMemory) {
      this.memoryFallback.delete(key);
      return;
    }
    const db = await this.dbPromise;
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    if (this.useMemory) {
      this.memoryFallback.clear();
      return;
    }
    const db = await this.dbPromise;
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
