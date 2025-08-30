import { CacheEngine } from '../cache/CacheEngine';
import { Config } from '../utils/Config';
import { Logger } from '../utils/Logger';

export class CleanupWorker {
  private cacheEngine: CacheEngine;
  private config = Config.getInstance().get();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private stats = {
    totalRuns: 0,
    totalExpiredKeys: 0,
    lastRunTime: 0,
    averageRunDuration: 0
  };

  constructor(cacheEngine: CacheEngine) {
    this.cacheEngine = cacheEngine;
  }

  public start(): void {
    if (this.isRunning) {
      Logger.warn('Cleanup worker is already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupIntervalMs);

    Logger.info(`Cleanup worker started with ${this.config.cleanupIntervalMs}ms interval`);
  }

  public stop(): void {
    if (!this.isRunning) {
      Logger.warn('Cleanup worker is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    Logger.info('Cleanup worker stopped');
  }

  public isWorkerRunning(): boolean {
    return this.isRunning;
  }

  public getStats(): CleanupStats {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      cleanupInterval: this.config.cleanupIntervalMs,
      nextRunIn: this.getNextRunTime()
    };
  }

  public forceCleanup(): CleanupResult {
    Logger.info('Force cleanup triggered manually');
    return this.performCleanup();
  }

  private performCleanup(): CleanupResult {
    const startTime = Date.now();
    
    try {
      const expiredCount = this.cacheEngine.cleanupExpired();
      const duration = Date.now() - startTime;

      this.updateStats(expiredCount, duration);

      const result: CleanupResult = {
        success: true,
        expiredKeysRemoved: expiredCount,
        duration,
        timestamp: startTime
      };

      if (expiredCount > 0) {
        Logger.info(`Cleanup completed: removed ${expiredCount} expired keys in ${duration}ms`);
      } else {
        Logger.debug(`Cleanup completed: no expired keys found (${duration}ms)`);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      Logger.error('Cleanup failed:', error);

      const result: CleanupResult = {
        success: false,
        expiredKeysRemoved: 0,
        duration,
        timestamp: startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      return result;
    }
  }

  private updateStats(expiredCount: number, duration: number): void {
    this.stats.totalRuns++;
    this.stats.totalExpiredKeys += expiredCount;
    this.stats.lastRunTime = Date.now();
    
    this.stats.averageRunDuration = Math.round(
      (this.stats.averageRunDuration * (this.stats.totalRuns - 1) + duration) / this.stats.totalRuns
    );
  }

  private getNextRunTime(): number {
    if (!this.isRunning || !this.stats.lastRunTime) {
      return 0;
    }

    const nextRun = this.stats.lastRunTime + this.config.cleanupIntervalMs;
    return Math.max(0, nextRun - Date.now());
  }

  public updateInterval(intervalMs: number): void {
    if (intervalMs <= 0) {
      throw new Error('Cleanup interval must be greater than 0');
    }

    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    Config.getInstance().update({ cleanupIntervalMs: intervalMs });
    this.config = Config.getInstance().get();

    if (wasRunning) {
      this.start();
    }

    Logger.info(`Cleanup interval updated to ${intervalMs}ms`);
  }
}

export interface CleanupResult {
  success: boolean;
  expiredKeysRemoved: number;
  duration: number;
  timestamp: number;
  error?: string;
}

export interface CleanupStats {
  totalRuns: number;
  totalExpiredKeys: number;
  lastRunTime: number;
  averageRunDuration: number;
  isRunning: boolean;
  cleanupInterval: number;
  nextRunIn: number;
}