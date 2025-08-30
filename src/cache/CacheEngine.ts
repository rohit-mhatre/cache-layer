import { CacheEntry, CacheEntryOptions } from './CacheEntry';
import { EvictionStrategy, EvictionPolicyFactory, EvictionPolicy } from './EvictionPolicies';
import { Config } from '../utils/Config';
import { Logger } from '../utils/Logger';

export interface CacheStats {
  totalKeys: number;
  memoryUsageBytes: number;
  memoryUsageMB: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
  expiredCount: number;
  uptime: number;
  maxMemoryBytes: number;
  maxMemoryMB: number;
}

export interface CacheSetOptions extends CacheEntryOptions {
  overwrite?: boolean;
}

export class CacheEngine {
  private store: Map<string, CacheEntry> = new Map();
  private evictionStrategy: EvictionStrategy;
  private config = Config.getInstance().get();
  private stats = {
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    expiredCount: 0,
    startTime: Date.now()
  };

  constructor(evictionPolicy?: EvictionPolicy) {
    const policy = evictionPolicy || this.config.evictionPolicy;
    this.evictionStrategy = EvictionPolicyFactory.create(policy);
    Logger.info(`Cache engine initialized with ${policy} eviction policy`);
  }

  public set<T = any>(key: string, value: T, options: CacheSetOptions = {}): boolean {
    try {
      if (!this.isValidKey(key)) {
        Logger.warn(`Invalid key attempted: ${key}`);
        return false;
      }

      const existingEntry = this.store.get(key);
      if (existingEntry && !options.overwrite) {
        Logger.debug(`Key ${key} already exists and overwrite is false`);
        return false;
      }

      if (existingEntry) {
        this.evictionStrategy.onRemove(key);
      }

      const ttl = options.ttl !== undefined ? options.ttl : this.config.defaultTTL;
      const entry = new CacheEntry(key, value, { ttl: ttl > 0 ? ttl : undefined });

      if (this.shouldEvict()) {
        if (!this.evictEntries()) {
          Logger.error(`Failed to evict entries, cannot set key: ${key}`);
          return false;
        }
      }

      this.store.set(key, entry);
      this.evictionStrategy.onInsert(key, entry);

      Logger.debug(`Set key: ${key}, TTL: ${entry.getRemainingTTL()}`);
      return true;
    } catch (error) {
      Logger.error(`Error setting key ${key}:`, error);
      return false;
    }
  }

  public get<T = any>(key: string): T | null {
    try {
      const entry = this.store.get(key) as CacheEntry<T> | undefined;

      if (!entry) {
        this.stats.missCount++;
        Logger.debug(`Cache miss for key: ${key}`);
        return null;
      }

      if (entry.isExpired()) {
        this.delete(key);
        this.stats.missCount++;
        this.stats.expiredCount++;
        Logger.debug(`Key expired: ${key}`);
        return null;
      }

      entry.markAccessed();
      this.evictionStrategy.onAccess(key, entry);
      this.stats.hitCount++;

      Logger.debug(`Cache hit for key: ${key}`);
      return entry.value;
    } catch (error) {
      Logger.error(`Error getting key ${key}:`, error);
      this.stats.missCount++;
      return null;
    }
  }

  public delete(key: string): boolean {
    try {
      const existed = this.store.delete(key);
      if (existed) {
        this.evictionStrategy.onRemove(key);
        Logger.debug(`Deleted key: ${key}`);
      }
      return existed;
    } catch (error) {
      Logger.error(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  public has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (entry.isExpired()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  public keys(): string[] {
    const validKeys: string[] = [];
    for (const [key, entry] of this.store) {
      if (!entry.isExpired()) {
        validKeys.push(key);
      }
    }
    return validKeys;
  }

  public clear(): void {
    const keyCount = this.store.size;
    this.store.clear();
    Logger.info(`Cleared cache, removed ${keyCount} keys`);
  }

  public size(): number {
    return this.store.size;
  }

  public cleanupExpired(): number {
    let expiredCount = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.store) {
      if (entry.isExpired()) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
      expiredCount++;
    }

    if (expiredCount > 0) {
      Logger.info(`Cleaned up ${expiredCount} expired keys`);
      this.stats.expiredCount += expiredCount;
    }

    return expiredCount;
  }

  public getStats(): CacheStats {
    const memoryUsageBytes = this.calculateMemoryUsage();
    const totalOperations = this.stats.hitCount + this.stats.missCount;
    const hitRate = totalOperations > 0 ? this.stats.hitCount / totalOperations : 0;

    return {
      totalKeys: this.store.size,
      memoryUsageBytes,
      memoryUsageMB: Math.round((memoryUsageBytes / (1024 * 1024)) * 100) / 100,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRate: Math.round(hitRate * 10000) / 100,
      evictionCount: this.stats.evictionCount,
      expiredCount: this.stats.expiredCount,
      uptime: Date.now() - this.stats.startTime,
      maxMemoryBytes: Config.getInstance().getMaxMemoryBytes(),
      maxMemoryMB: this.config.maxMemoryMB
    };
  }

  public updateTTL(key: string, ttl: number): boolean {
    const entry = this.store.get(key);
    if (!entry || entry.isExpired()) {
      return false;
    }

    const newEntry = new CacheEntry(entry.key, entry.value, { ttl });
    this.store.set(key, newEntry);
    Logger.debug(`Updated TTL for key: ${key} to ${ttl} seconds`);
    return true;
  }

  public increment(key: string, delta: number = 1): number | null {
    const entry = this.store.get(key);
    if (!entry || entry.isExpired()) {
      return null;
    }

    const currentValue = entry.value;
    if (typeof currentValue !== 'number') {
      return null;
    }

    const newValue = currentValue + delta;
    const newEntry = new CacheEntry(key, newValue, { 
      ttl: entry.getRemainingTTL() || undefined 
    });
    
    this.store.set(key, newEntry);
    this.evictionStrategy.onAccess(key, newEntry);
    
    Logger.debug(`Incremented key: ${key} by ${delta} to ${newValue}`);
    return newValue;
  }

  private isValidKey(key: string): boolean {
    return typeof key === 'string' && key.length > 0 && key.length <= 512;
  }

  private shouldEvict(): boolean {
    const memoryUsage = this.calculateMemoryUsage();
    const maxMemory = Config.getInstance().getMaxMemoryBytes();
    return this.evictionStrategy.shouldEvict(memoryUsage, maxMemory);
  }

  private evictEntries(): boolean {
    let evicted = 0;
    const maxEvictions = Math.ceil(this.store.size * 0.1);

    while (evicted < maxEvictions && this.shouldEvict()) {
      const victimKey = this.evictionStrategy.selectVictim(this.store);
      if (!victimKey) {
        Logger.warn('No victim found for eviction');
        break;
      }

      if (this.delete(victimKey)) {
        evicted++;
        this.stats.evictionCount++;
        Logger.debug(`Evicted key: ${victimKey}`);
      }
    }

    Logger.info(`Evicted ${evicted} entries`);
    return evicted > 0 || !this.shouldEvict();
  }

  private calculateMemoryUsage(): number {
    let totalBytes = 0;
    
    for (const [key, entry] of this.store) {
      totalBytes += Buffer.byteLength(key, 'utf8');
      totalBytes += this.calculateValueSize(entry.value);
      totalBytes += 64;
    }
    
    return totalBytes;
  }

  private calculateValueSize(value: any): number {
    if (value === null || value === undefined) {
      return 8;
    }
    
    if (typeof value === 'string') {
      return Buffer.byteLength(value, 'utf8');
    }
    
    if (typeof value === 'number') {
      return 8;
    }
    
    if (typeof value === 'boolean') {
      return 1;
    }
    
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      return 100;
    }
  }
}