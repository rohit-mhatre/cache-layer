import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { CacheEngine } from './cache/CacheEngine';
import { CleanupWorker } from './workers/CleanupWorker';
import { StatsCollector } from './monitoring/StatsCollector';
import { createRoutes } from './api/routes';
import { 
  requestLogger, 
  errorHandler, 
  notFoundHandler 
} from './api/middleware';
import { Config } from './utils/Config';
import { Logger } from './utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

class CacheServer {
  private app: express.Application;
  private cacheEngine: CacheEngine;
  private cleanupWorker: CleanupWorker;
  private statsCollector: StatsCollector;
  private config = Config.getInstance().get();
  private server?: any;

  constructor() {
    this.app = express();
    this.cacheEngine = new CacheEngine();
    this.cleanupWorker = new CleanupWorker(this.cacheEngine);
    this.statsCollector = new StatsCollector(this.cacheEngine, this.cleanupWorker);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupDirectories();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Cache Layer Service',
        version: '1.0.0',
        description: 'In-memory caching service with TTL support',
        status: 'healthy',
        uptime: this.statsCollector.getSystemStats().system.uptime,
        timestamp: Date.now()
      });
    });

    this.app.use('/api/v1', createRoutes(this.cacheEngine));

    this.app.get('/api/v1/system/stats', (req, res) => {
      res.json({
        success: true,
        data: this.statsCollector.getSystemStats(),
        timestamp: Date.now()
      });
    });

    this.app.get('/api/v1/system/health', (req, res) => {
      const health = this.statsCollector.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'warning' ? 200 : 503;
      
      res.status(statusCode).json({
        success: true,
        data: health,
        timestamp: Date.now()
      });
    });

    this.app.post('/api/v1/admin/cleanup-worker/start', (req, res) => {
      try {
        this.cleanupWorker.start();
        res.json({
          success: true,
          data: { message: 'Cleanup worker started' },
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start cleanup worker',
          timestamp: Date.now()
        });
      }
    });

    this.app.post('/api/v1/admin/cleanup-worker/stop', (req, res) => {
      try {
        this.cleanupWorker.stop();
        res.json({
          success: true,
          data: { message: 'Cleanup worker stopped' },
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop cleanup worker',
          timestamp: Date.now()
        });
      }
    });
  }

  private setupErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private setupDirectories(): void {
    const dirs = ['logs', 'data'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        Logger.info(`Created directory: ${dir}`);
      }
    });
  }

  public async start(): Promise<void> {
    try {
      await this.initializeServices();
      
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        Logger.info(`Cache server started on ${this.config.host}:${this.config.port}`);
        Logger.info('Server configuration:', {
          maxMemoryMB: this.config.maxMemoryMB,
          defaultTTL: this.config.defaultTTL,
          evictionPolicy: this.config.evictionPolicy,
          cleanupInterval: this.config.cleanupIntervalMs
        });
      });

      this.setupGracefulShutdown();
      
    } catch (error) {
      Logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async initializeServices(): Promise<void> {
    this.cleanupWorker.start();
    this.statsCollector.startPeriodicReporting();
    
    Logger.info('All services initialized successfully');
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      Logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        if (this.server) {
          this.server.close(() => {
            Logger.info('HTTP server closed');
          });
        }

        this.cleanupWorker.stop();
        
        const finalCleanup = this.cleanupWorker.forceCleanup();
        Logger.info('Final cleanup completed:', finalCleanup);

        const finalStats = this.statsCollector.getSystemStats();
        Logger.info('Final statistics:', {
          totalKeys: finalStats.cache.totalKeys,
          totalOperations: finalStats.cache.hitCount + finalStats.cache.missCount,
          hitRate: finalStats.cache.hitRate,
          uptime: finalStats.system.uptime
        });

        Logger.info('Graceful shutdown completed');
        process.exit(0);
        
      } catch (error) {
        Logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      Logger.error('Unhandled rejection:', reason);
      process.exit(1);
    });
  }

  public getCacheEngine(): CacheEngine {
    return this.cacheEngine;
  }

  public getStatsCollector(): StatsCollector {
    return this.statsCollector;
  }

  public getApp(): express.Application {
    return this.app;
  }
}

if (require.main === module) {
  const server = new CacheServer();
  server.start().catch((error) => {
    Logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { CacheServer };