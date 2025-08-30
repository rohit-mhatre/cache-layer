import request from 'supertest';
import { CacheServer } from '../../src/index';
import { Express } from 'express';

describe('Cache API Integration Tests', () => {
  let app: Express;
  let server: CacheServer;

  beforeAll(async () => {
    server = new CacheServer();
    app = server.getApp();
  });

  beforeEach(() => {
    server.getCacheEngine().clear();
  });

  describe('GET /api/v1/cache/:key', () => {
    test('should get existing key', async () => {
      server.getCacheEngine().set('test-key', 'test-value');

      const response = await request(app)
        .get('/api/v1/cache/test-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('test-key');
      expect(response.body.data.value).toBe('test-value');
    });

    test('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .get('/api/v1/cache/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    test('should return 400 for invalid key format', async () => {
      const response = await request(app)
        .get('/api/v1/cache/invalid key!')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid key format');
    });
  });

  describe('POST /api/v1/cache', () => {
    test('should set key-value pair', async () => {
      const payload = {
        key: 'test-key',
        value: 'test-value'
      };

      const response = await request(app)
        .post('/api/v1/cache')
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('test-key');
      expect(response.body.data.value).toBe('test-value');
    });

    test('should set key with TTL', async () => {
      const payload = {
        key: 'test-key',
        value: 'test-value',
        ttl: 300
      };

      const response = await request(app)
        .post('/api/v1/cache')
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ttl).toBe(300);
    });

    test('should reject invalid payload', async () => {
      const payload = {
        key: '',
        value: 'test-value'
      };

      const response = await request(app)
        .post('/api/v1/cache')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid payload');
    });

    test('should handle complex values', async () => {
      const payload = {
        key: 'complex-key',
        value: {
          nested: {
            array: [1, 2, 3],
            boolean: true,
            null: null
          }
        }
      };

      const response = await request(app)
        .post('/api/v1/cache')
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.value).toEqual(payload.value);
    });
  });

  describe('DELETE /api/v1/cache/:key', () => {
    test('should delete existing key', async () => {
      server.getCacheEngine().set('test-key', 'test-value');

      const response = await request(app)
        .delete('/api/v1/cache/test-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('test-key');

      const value = server.getCacheEngine().get('test-key');
      expect(value).toBe(null);
    });

    test('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .delete('/api/v1/cache/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('HEAD /api/v1/cache/:key', () => {
    test('should check if key exists', async () => {
      server.getCacheEngine().set('test-key', 'test-value');

      const response = await request(app)
        .head('/api/v1/cache/test-key')
        .expect(200);

      expect(response.body).toEqual({});
    });

    test('should return 404 for non-existent key', async () => {
      await request(app)
        .head('/api/v1/cache/nonexistent')
        .expect(404);
    });
  });

  describe('GET /api/v1/cache', () => {
    test('should list all keys', async () => {
      server.getCacheEngine().set('key1', 'value1');
      server.getCacheEngine().set('key2', 'value2');

      const response = await request(app)
        .get('/api/v1/cache')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toHaveLength(2);
      expect(response.body.data.keys).toContain('key1');
      expect(response.body.data.keys).toContain('key2');
      expect(response.body.data.count).toBe(2);
    });

    test('should return empty array when no keys', async () => {
      const response = await request(app)
        .get('/api/v1/cache')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });
  });

  describe('DELETE /api/v1/cache', () => {
    test('should clear all keys', async () => {
      server.getCacheEngine().set('key1', 'value1');
      server.getCacheEngine().set('key2', 'value2');

      const response = await request(app)
        .delete('/api/v1/cache')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('cleared');

      const keys = server.getCacheEngine().keys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('GET /api/v1/stats', () => {
    test('should return cache statistics', async () => {
      server.getCacheEngine().set('key1', 'value1');
      server.getCacheEngine().get('key1');

      const response = await request(app)
        .get('/api/v1/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalKeys');
      expect(response.body.data).toHaveProperty('memoryUsageBytes');
      expect(response.body.data).toHaveProperty('hitCount');
      expect(response.body.data).toHaveProperty('missCount');
      expect(response.body.data).toHaveProperty('hitRate');
    });
  });

  describe('POST /api/v1/cache/:key/increment', () => {
    test('should increment numeric value', async () => {
      server.getCacheEngine().set('counter', 10);

      const response = await request(app)
        .post('/api/v1/cache/counter/increment')
        .send({ delta: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.value).toBe(15);
    });

    test('should increment by 1 by default', async () => {
      server.getCacheEngine().set('counter', 10);

      const response = await request(app)
        .post('/api/v1/cache/counter/increment')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.value).toBe(11);
    });

    test('should reject non-numeric values', async () => {
      server.getCacheEngine().set('string-key', 'not-a-number');

      const response = await request(app)
        .post('/api/v1/cache/string-key/increment')
        .send({ delta: 1 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/cache/batch', () => {
    test('should set multiple keys', async () => {
      const payload = {
        operations: [
          { key: 'key1', value: 'value1' },
          { key: 'key2', value: 'value2', ttl: 300 }
        ]
      };

      const response = await request(app)
        .post('/api/v1/cache/batch')
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.successful).toBe(2);
      expect(response.body.data.failed).toBe(0);

      const value1 = server.getCacheEngine().get('key1');
      const value2 = server.getCacheEngine().get('key2');
      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
    });

    test('should reject invalid batch payload', async () => {
      const payload = {
        operations: []
      };

      const response = await request(app)
        .post('/api/v1/cache/batch')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/cache/batch/get', () => {
    test('should get multiple keys', async () => {
      server.getCacheEngine().set('key1', 'value1');
      server.getCacheEngine().set('key2', 'value2');

      const payload = {
        keys: ['key1', 'key2', 'nonexistent']
      };

      const response = await request(app)
        .post('/api/v1/cache/batch/get')
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(3);
      expect(response.body.data.found).toBe(2);
      expect(response.body.data.missed).toBe(1);

      const results = response.body.data.results;
      expect(results[0].found).toBe(true);
      expect(results[1].found).toBe(true);
      expect(results[2].found).toBe(false);
    });
  });

  describe('GET /api/v1/system/health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/system/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('metrics');
    });
  });

  describe('GET /', () => {
    test('should return server info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 routes', async () => {
      const response = await request(app)
        .get('/nonexistent-route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });
});