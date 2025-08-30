import { Router } from 'express';
import { CacheController } from './controllers';
import { CacheEngine } from '../cache/CacheEngine';
import { 
  validateKey, 
  validateCachePayload, 
  validateBatchPayload, 
  rateLimiter 
} from './middleware';

export function createRoutes(cacheEngine: CacheEngine): Router {
  const router = Router();
  const controller = new CacheController(cacheEngine);

  router.use(rateLimiter);

  router.get('/cache/:key', validateKey, controller.get);

  router.post('/cache', validateCachePayload, controller.set);

  router.delete('/cache/:key', validateKey, controller.delete);

  router.head('/cache/:key', validateKey, controller.exists);

  router.get('/cache', controller.keys);

  router.delete('/cache', controller.clear);

  router.get('/stats', controller.stats);

  router.put('/cache/:key/ttl', validateKey, controller.updateTTL);

  router.post('/cache/:key/increment', validateKey, controller.increment);

  router.post('/cache/batch', validateBatchPayload, controller.batchSet);

  router.post('/cache/batch/get', controller.batchGet);

  router.get('/health', controller.health);

  router.post('/admin/cleanup', (req, res) => {
    try {
      const expiredCount = cacheEngine.cleanupExpired();
      res.json({
        success: true,
        data: {
          expiredKeysRemoved: expiredCount,
          message: 'Manual cleanup completed'
        },
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Cleanup failed',
        timestamp: Date.now()
      });
    }
  });

  return router;
}