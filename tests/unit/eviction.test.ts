import { 
  EvictionPolicyFactory, 
  EvictionPolicy, 
  EvictionStrategy 
} from '../../src/cache/EvictionPolicies';
import { CacheEntry } from '../../src/cache/CacheEntry';

describe('Eviction Policies', () => {
  let entries: Map<string, CacheEntry>;

  beforeEach(() => {
    entries = new Map();
  });

  describe('LRU Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = EvictionPolicyFactory.create(EvictionPolicy.LRU);
    });

    test('should evict least recently used item', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');
      const entry3 = new CacheEntry('key3', 'value3');

      entries.set('key1', entry1);
      entries.set('key2', entry2);
      entries.set('key3', entry3);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);
      strategy.onInsert('key3', entry3);

      strategy.onAccess('key1', entry1);
      strategy.onAccess('key3', entry3);

      const victim = strategy.selectVictim(entries);
      expect(victim).toBe('key2');
    });

    test('should update access order on access', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');

      entries.set('key1', entry1);
      entries.set('key2', entry2);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);

      let victim = strategy.selectVictim(entries);
      expect(victim).toBe('key1');

      strategy.onAccess('key1', entry1);
      victim = strategy.selectVictim(entries);
      expect(victim).toBe('key2');
    });

    test('should handle removal correctly', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');

      entries.set('key1', entry1);
      entries.set('key2', entry2);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);

      strategy.onRemove('key1');
      entries.delete('key1');

      const victim = strategy.selectVictim(entries);
      expect(victim).toBe('key2');
    });
  });

  describe('LFU Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = EvictionPolicyFactory.create(EvictionPolicy.LFU);
    });

    test('should evict least frequently used item', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');
      const entry3 = new CacheEntry('key3', 'value3');

      entries.set('key1', entry1);
      entries.set('key2', entry2);
      entries.set('key3', entry3);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);
      strategy.onInsert('key3', entry3);

      strategy.onAccess('key1', entry1);
      strategy.onAccess('key1', entry1);
      strategy.onAccess('key3', entry3);

      const victim = strategy.selectVictim(entries);
      expect(victim).toBe('key2');
    });

    test('should break ties by oldest access time', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');

      setTimeout(() => {
        entry2.markAccessed();
      }, 10);

      entries.set('key1', entry1);
      entries.set('key2', entry2);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);

      const victim = strategy.selectVictim(entries);
      expect(victim).toBe('key1');
    });
  });

  describe('FIFO Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = EvictionPolicyFactory.create(EvictionPolicy.FIFO);
    });

    test('should evict first inserted item', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');
      const entry3 = new CacheEntry('key3', 'value3');

      entries.set('key1', entry1);
      entries.set('key2', entry2);
      entries.set('key3', entry3);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);
      strategy.onInsert('key3', entry3);

      const victim = strategy.selectVictim(entries);
      expect(victim).toBe('key1');
    });

    test('should not be affected by access patterns', () => {
      const entry1 = new CacheEntry('key1', 'value1');
      const entry2 = new CacheEntry('key2', 'value2');

      entries.set('key1', entry1);
      entries.set('key2', entry2);

      strategy.onInsert('key1', entry1);
      strategy.onInsert('key2', entry2);

      strategy.onAccess('key1', entry1);
      strategy.onAccess('key1', entry1);

      const victim = strategy.selectVictim(entries);
      expect(victim).toBe('key1');
    });
  });

  describe('No Eviction Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = EvictionPolicyFactory.create(EvictionPolicy.NONE);
    });

    test('should never evict', () => {
      expect(strategy.shouldEvict(1000, 100)).toBe(false);
      expect(strategy.selectVictim(entries)).toBe(null);
    });
  });

  describe('Eviction Conditions', () => {
    test('LRU should evict when current size >= max size', () => {
      const strategy = EvictionPolicyFactory.create(EvictionPolicy.LRU);
      
      expect(strategy.shouldEvict(50, 100)).toBe(false);
      expect(strategy.shouldEvict(100, 100)).toBe(true);
      expect(strategy.shouldEvict(150, 100)).toBe(true);
    });

    test('LFU should evict when current size >= max size', () => {
      const strategy = EvictionPolicyFactory.create(EvictionPolicy.LFU);
      
      expect(strategy.shouldEvict(50, 100)).toBe(false);
      expect(strategy.shouldEvict(100, 100)).toBe(true);
      expect(strategy.shouldEvict(150, 100)).toBe(true);
    });

    test('FIFO should evict when current size >= max size', () => {
      const strategy = EvictionPolicyFactory.create(EvictionPolicy.FIFO);
      
      expect(strategy.shouldEvict(50, 100)).toBe(false);
      expect(strategy.shouldEvict(100, 100)).toBe(true);
      expect(strategy.shouldEvict(150, 100)).toBe(true);
    });
  });
});