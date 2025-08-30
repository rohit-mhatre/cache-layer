import { Request, Response } from 'express';
import { CacheEngine } from '../cache/CacheEngine';
import { createSuccessResponse, createErrorResponse, ApiResponse } from './middleware';
import { Logger } from '../utils/Logger';

export class CacheController {
  constructor(private cacheEngine: CacheEngine) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const value = this.cacheEngine.get(key);
      
      if (value === null) {
        res.status(404).json(createErrorResponse(`Key '${key}' not found`));
        return;
      }
      
      res.json(createSuccessResponse({ key, value }));
    } catch (error) {
      Logger.error('Error in get controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public set = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key, value, ttl } = req.body;
      const success = this.cacheEngine.set(key, value, { ttl, overwrite: true });
      
      if (!success) {
        res.status(400).json(createErrorResponse(`Failed to set key '${key}'`));
        return;
      }
      
      res.status(201).json(createSuccessResponse({ 
        key, 
        value, 
        ttl: ttl || null,
        message: 'Key set successfully' 
      }));
    } catch (error) {
      Logger.error('Error in set controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const success = this.cacheEngine.delete(key);
      
      if (!success) {
        res.status(404).json(createErrorResponse(`Key '${key}' not found`));
        return;
      }
      
      res.json(createSuccessResponse({ 
        key, 
        message: 'Key deleted successfully' 
      }));
    } catch (error) {
      Logger.error('Error in delete controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public exists = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const exists = this.cacheEngine.has(key);
      
      res.json(createSuccessResponse({ key, exists }));
    } catch (error) {
      Logger.error('Error in exists controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public keys = async (req: Request, res: Response): Promise<void> => {
    try {
      const keys = this.cacheEngine.keys();
      res.json(createSuccessResponse({ keys, count: keys.length }));
    } catch (error) {
      Logger.error('Error in keys controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public clear = async (req: Request, res: Response): Promise<void> => {
    try {
      this.cacheEngine.clear();
      res.json(createSuccessResponse({ message: 'Cache cleared successfully' }));
    } catch (error) {
      Logger.error('Error in clear controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public stats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = this.cacheEngine.getStats();
      res.json(createSuccessResponse(stats));
    } catch (error) {
      Logger.error('Error in stats controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public updateTTL = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const { ttl } = req.body;
      
      if (typeof ttl !== 'number' || ttl < 0) {
        res.status(400).json(createErrorResponse('TTL must be a non-negative number'));
        return;
      }
      
      const success = this.cacheEngine.updateTTL(key, ttl);
      
      if (!success) {
        res.status(404).json(createErrorResponse(`Key '${key}' not found`));
        return;
      }
      
      res.json(createSuccessResponse({ 
        key, 
        ttl, 
        message: 'TTL updated successfully' 
      }));
    } catch (error) {
      Logger.error('Error in updateTTL controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public increment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const { delta = 1 } = req.body;
      
      if (typeof delta !== 'number') {
        res.status(400).json(createErrorResponse('Delta must be a number'));
        return;
      }
      
      const newValue = this.cacheEngine.increment(key, delta);
      
      if (newValue === null) {
        res.status(400).json(createErrorResponse(
          `Key '${key}' not found or value is not a number`
        ));
        return;
      }
      
      res.json(createSuccessResponse({ 
        key, 
        value: newValue, 
        delta,
        message: 'Value incremented successfully' 
      }));
    } catch (error) {
      Logger.error('Error in increment controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public batchSet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { operations } = req.body;
      const results: Array<{ key: string; success: boolean; error?: string }> = [];
      
      for (const op of operations) {
        try {
          const success = this.cacheEngine.set(op.key, op.value, { 
            ttl: op.ttl, 
            overwrite: true 
          });
          results.push({ key: op.key, success });
        } catch (error) {
          results.push({ 
            key: op.key, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      res.json(createSuccessResponse({
        results,
        total: operations.length,
        successful: successCount,
        failed: operations.length - successCount
      }));
    } catch (error) {
      Logger.error('Error in batchSet controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public batchGet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { keys } = req.body;
      
      if (!Array.isArray(keys)) {
        res.status(400).json(createErrorResponse('Keys must be an array'));
        return;
      }
      
      const results: Array<{ key: string; value: any; found: boolean }> = [];
      
      for (const key of keys) {
        const value = this.cacheEngine.get(key);
        results.push({
          key,
          value,
          found: value !== null
        });
      }
      
      const foundCount = results.filter(r => r.found).length;
      
      res.json(createSuccessResponse({
        results,
        total: keys.length,
        found: foundCount,
        missed: keys.length - foundCount
      }));
    } catch (error) {
      Logger.error('Error in batchGet controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };

  public health = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = this.cacheEngine.getStats();
      const health = {
        status: 'healthy',
        uptime: stats.uptime,
        memoryUsage: {
          current: stats.memoryUsageMB,
          max: stats.maxMemoryMB,
          percentage: Math.round((stats.memoryUsageMB / stats.maxMemoryMB) * 100)
        },
        performance: {
          hitRate: stats.hitRate,
          totalOperations: stats.hitCount + stats.missCount
        },
        timestamp: Date.now()
      };
      
      res.json(createSuccessResponse(health));
    } catch (error) {
      Logger.error('Error in health controller:', error);
      res.status(500).json(createErrorResponse('Internal server error'));
    }
  };
}