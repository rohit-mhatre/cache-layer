import { CacheEntry } from './CacheEntry';

export enum EvictionPolicy {
  NONE = 'none',
  LRU = 'lru',
  LFU = 'lfu',
  FIFO = 'fifo'
}

export interface EvictionStrategy<T = any> {
  shouldEvict(currentSize: number, maxSize: number): boolean;
  selectVictim(entries: Map<string, CacheEntry<T>>): string | null;
  onAccess(key: string, entry: CacheEntry<T>): void;
  onInsert(key: string, entry: CacheEntry<T>): void;
  onRemove(key: string): void;
}

class LRUStrategy<T = any> implements EvictionStrategy<T> {
  private accessOrder: string[] = [];

  shouldEvict(currentSize: number, maxSize: number): boolean {
    return currentSize >= maxSize;
  }

  selectVictim(entries: Map<string, CacheEntry<T>>): string | null {
    while (this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder[0];
      if (entries.has(oldestKey)) {
        return oldestKey;
      }
      this.accessOrder.shift();
    }
    return null;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  onInsert(key: string, entry: CacheEntry<T>): void {
    this.accessOrder.push(key);
  }

  onRemove(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

class LFUStrategy<T = any> implements EvictionStrategy<T> {
  private frequencies: Map<string, number> = new Map();

  shouldEvict(currentSize: number, maxSize: number): boolean {
    return currentSize >= maxSize;
  }

  selectVictim(entries: Map<string, CacheEntry<T>>): string | null {
    let minFreq = Infinity;
    let victim: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of entries) {
      const freq = this.frequencies.get(key) || 0;
      if (freq < minFreq || (freq === minFreq && entry.lastAccessedAt < oldestTime)) {
        minFreq = freq;
        victim = key;
        oldestTime = entry.lastAccessedAt;
      }
    }

    return victim;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    const currentFreq = this.frequencies.get(key) || 0;
    this.frequencies.set(key, currentFreq + 1);
  }

  onInsert(key: string, entry: CacheEntry<T>): void {
    this.frequencies.set(key, 1);
  }

  onRemove(key: string): void {
    this.frequencies.delete(key);
  }
}

class FIFOStrategy<T = any> implements EvictionStrategy<T> {
  private insertionOrder: string[] = [];

  shouldEvict(currentSize: number, maxSize: number): boolean {
    return currentSize >= maxSize;
  }

  selectVictim(entries: Map<string, CacheEntry<T>>): string | null {
    while (this.insertionOrder.length > 0) {
      const oldestKey = this.insertionOrder[0];
      if (entries.has(oldestKey)) {
        return oldestKey;
      }
      this.insertionOrder.shift();
    }
    return null;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    // FIFO doesn't care about access
  }

  onInsert(key: string, entry: CacheEntry<T>): void {
    this.insertionOrder.push(key);
  }

  onRemove(key: string): void {
    const index = this.insertionOrder.indexOf(key);
    if (index > -1) {
      this.insertionOrder.splice(index, 1);
    }
  }
}

class NoEvictionStrategy<T = any> implements EvictionStrategy<T> {
  shouldEvict(currentSize: number, maxSize: number): boolean {
    return false;
  }

  selectVictim(entries: Map<string, CacheEntry<T>>): string | null {
    return null;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    // No-op
  }

  onInsert(key: string, entry: CacheEntry<T>): void {
    // No-op
  }

  onRemove(key: string): void {
    // No-op
  }
}

export class EvictionPolicyFactory {
  static create<T = any>(policy: EvictionPolicy): EvictionStrategy<T> {
    switch (policy) {
      case EvictionPolicy.LRU:
        return new LRUStrategy<T>();
      case EvictionPolicy.LFU:
        return new LFUStrategy<T>();
      case EvictionPolicy.FIFO:
        return new FIFOStrategy<T>();
      case EvictionPolicy.NONE:
      default:
        return new NoEvictionStrategy<T>();
    }
  }
}