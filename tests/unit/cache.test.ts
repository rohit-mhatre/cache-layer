import { CacheEngine } from '../../src/cache/CacheEngine';
import { CacheEntry } from '../../src/cache/CacheEntry';
import { EvictionPolicy } from '../../src/cache/EvictionPolicies';

describe('CacheEngine', () => {
  let cache: CacheEngine;

  beforeEach(() => {
    cache = new CacheEngine(EvictionPolicy.LRU);
  });

  describe('Basic Operations', () => {
    test('should set and get values', () => {
      const success = cache.set('key1', 'value1');
      expect(success).toBe(true);

      const value = cache.get('key1');
      expect(value).toBe('value1');
    });

    test('should return null for non-existent keys', () => {
      const value = cache.get('nonexistent');
      expect(value).toBe(null);
    });

    test('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    test('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    test('should check key existence', () => {
      expect(cache.has('key1')).toBe(false);
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    test('should return all valid keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    test('should clear all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      expect(cache.size()).toBe(2);
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.keys()).toHaveLength(0);
    });
  });

  describe('TTL Functionality', () => {
    test('should set keys with TTL', () => {
      const success = cache.set('key1', 'value1', { ttl: 1 });
      expect(success).toBe(true);

      const value = cache.get('key1');
      expect(value).toBe('value1');
    });

    test('should expire keys after TTL', (done) => {
      cache.set('key1', 'value1', { ttl: 0.1 });
      expect(cache.get('key1')).toBe('value1');

      setTimeout(() => {
        const value = cache.get('key1');
        expect(value).toBe(null);
        expect(cache.has('key1')).toBe(false);
        done();
      }, 150);
    });

    test('should update TTL for existing keys', () => {
      cache.set('key1', 'value1', { ttl: 3600 });
      
      const updated = cache.updateTTL('key1', 1);
      expect(updated).toBe(true);
      
      const value = cache.get('key1');
      expect(value).toBe('value1');
    });

    test('should not update TTL for non-existent keys', () => {
      const updated = cache.updateTTL('nonexistent', 1);
      expect(updated).toBe(false);
    });
  });

  describe('Numeric Operations', () => {
    test('should increment numeric values', () => {
      cache.set('counter', 10);
      
      const newValue = cache.increment('counter', 5);
      expect(newValue).toBe(15);
      
      const getValue = cache.get('counter');
      expect(getValue).toBe(15);
    });

    test('should increment with default delta of 1', () => {
      cache.set('counter', 10);
      
      const newValue = cache.increment('counter');
      expect(newValue).toBe(11);
    });

    test('should not increment non-numeric values', () => {
      cache.set('key1', 'string');
      
      const result = cache.increment('key1');
      expect(result).toBe(null);
    });

    test('should not increment non-existent keys', () => {
      const result = cache.increment('nonexistent');
      expect(result).toBe(null);
    });
  });

  describe('Statistics', () => {
    test('should track hit and miss counts', () => {
      cache.set('key1', 'value1');
      
      cache.get('key1');
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(66.67);
    });

    test('should track total keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.totalKeys).toBe(2);
    });

    test('should track memory usage', () => {
      cache.set('key1', 'value1');
      
      const stats = cache.getStats();
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
      expect(stats.memoryUsageMB).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    test('should cleanup expired keys', (done) => {
      cache.set('key1', 'value1', { ttl: 0.1 });
      cache.set('key2', 'value2');
      
      expect(cache.size()).toBe(2);

      setTimeout(() => {
        const cleanedCount = cache.cleanupExpired();
        expect(cleanedCount).toBe(1);
        expect(cache.size()).toBe(1);
        expect(cache.has('key2')).toBe(true);
        done();
      }, 150);
    });

    test('should return 0 when no keys to cleanup', () => {
      cache.set('key1', 'value1');
      
      const cleanedCount = cache.cleanupExpired();
      expect(cleanedCount).toBe(0);
    });
  });

  describe('Key Validation', () => {
    test('should reject empty keys', () => {
      const success = cache.set('', 'value');
      expect(success).toBe(false);
    });

    test('should reject very long keys', () => {
      const longKey = 'a'.repeat(513);
      const success = cache.set(longKey, 'value');
      expect(success).toBe(false);
    });

    test('should accept valid keys', () => {
      const success = cache.set('valid-key_123', 'value');
      expect(success).toBe(true);
    });
  });

  describe('Overwrite Behavior', () => {
    test('should overwrite by default', () => {
      cache.set('key1', 'value1');
      const success = cache.set('key1', 'value2');
      
      expect(success).toBe(true);
      expect(cache.get('key1')).toBe('value2');
    });

    test('should not overwrite when overwrite is false', () => {
      cache.set('key1', 'value1');
      const success = cache.set('key1', 'value2', { overwrite: false });
      
      expect(success).toBe(false);
      expect(cache.get('key1')).toBe('value1');
    });
  });
});