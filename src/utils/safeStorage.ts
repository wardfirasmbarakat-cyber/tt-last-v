/**
 * Safe Storage Utility for cross-browser resilience (especially Safari Private Mode & iframes)
 * Fallback to in-memory storage if localStorage/sessionStorage is blocked, restricted, or full.
 */

class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryLocalStorage = new MemoryStorage();
const memorySessionStorage = new MemoryStorage();

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`[safeStorage] localStorage.getItem('${key}') blocked or failed:`, e);
    }
    return memoryLocalStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`[safeStorage] localStorage.setItem('${key}') blocked or failed:`, e);
    }
    memoryLocalStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`[safeStorage] localStorage.removeItem('${key}') failed:`, e);
    }
    memoryLocalStorage.removeItem(key);
  }
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`[safeStorage] sessionStorage.getItem('${key}') blocked or failed:`, e);
    }
    return memorySessionStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`[safeStorage] sessionStorage.setItem('${key}') blocked or failed:`, e);
    }
    memorySessionStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`[safeStorage] sessionStorage.removeItem('${key}') failed:`, e);
    }
    memorySessionStorage.removeItem(key);
  }
};
