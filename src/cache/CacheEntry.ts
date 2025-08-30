export interface CacheEntryOptions {
  ttl?: number;
}

export class CacheEntry<T = any> {
  public readonly key: string;
  public readonly value: T;
  public readonly createdAt: number;
  public readonly expiresAt: number | null;
  public lastAccessedAt: number;
  public accessCount: number;

  constructor(key: string, value: T, options: CacheEntryOptions = {}) {
    this.key = key;
    this.value = value;
    this.createdAt = Date.now();
    this.lastAccessedAt = this.createdAt;
    this.accessCount = 0;
    
    if (options.ttl && options.ttl > 0) {
      this.expiresAt = this.createdAt + (options.ttl * 1000);
    } else {
      this.expiresAt = null;
    }
  }

  public isExpired(): boolean {
    if (this.expiresAt === null) {
      return false;
    }
    return Date.now() > this.expiresAt;
  }

  public markAccessed(): void {
    this.lastAccessedAt = Date.now();
    this.accessCount++;
  }

  public getRemainingTTL(): number | null {
    if (this.expiresAt === null) {
      return null;
    }
    const remaining = Math.max(0, this.expiresAt - Date.now());
    return Math.ceil(remaining / 1000);
  }

  public getAge(): number {
    return Date.now() - this.createdAt;
  }

  public toJSON(): object {
    return {
      key: this.key,
      value: this.value,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      lastAccessedAt: this.lastAccessedAt,
      accessCount: this.accessCount,
      remainingTTL: this.getRemainingTTL(),
      age: this.getAge(),
      isExpired: this.isExpired()
    };
  }
}