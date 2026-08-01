export interface AsyncStringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createBrowserStringStorage(
  area: StorageArea,
): AsyncStringStorage {
  return {
    async getItem(key) {
      const stored = await area.get(key);
      return typeof stored[key] === 'string' ? stored[key] : null;
    },
    async setItem(key, value) {
      await area.set({ [key]: value });
    },
    async removeItem(key) {
      await area.remove(key);
    },
  };
}

export function extensionAuthStorage(): AsyncStringStorage {
  return createBrowserStringStorage(browser.storage.local);
}
