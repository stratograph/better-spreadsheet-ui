import { beforeEach } from "vitest";

// The app's settings.js/lastPosition.js modules talk to the real browser
// localStorage global. Vitest's default "node" environment has no DOM, so
// we install a tiny in-memory stand-in rather than pull in a full jsdom
// dependency just for this.
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});
