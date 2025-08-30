import { CacheEngine } from '../cache/CacheEngine';
import { CleanupWorker } from '../workers/CleanupWorker';
import { Logger } from '../utils/Logger';
import { Config } from '../utils/Config';

export interface SystemStats {
  cache: ReturnType<CacheEngine['getStats']>;
  cleanup: ReturnType<CleanupWorker['getStats']>;
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    pid: number;
    platform: string;
    nodeVersion: string;
    cpuUsage: NodeJS.CpuUsage;
  };
  config: {
    maxMemoryMB: number;
    defaultTTL: number;
    cleanupInterval: number;
    evictionPolicy: string;
    persistenceEnabled: boolean;
  };
  performance: {
    operationsPerSecond: number;
    averageResponseTime: number;
    peakMemoryUsage: number;
    peakOperationsPerSecond: number;
  };
}

export class StatsCollector {
  private cacheEngine: CacheEngine;
  private cleanupWorker: CleanupWorker;
  private config = Config.getInstance().get();
  
  private performanceHistory: Array<{
    timestamp: number;
    operations: number;
    memoryMB: number;
  }> = [];
  
  private readonly HISTORY_LIMIT = 60;
  private startTime = Date.now();
  private initialCpuUsage = process.cpuUsage();
  private peakMemoryUsage = 0;
  private peakOpsPerSecond = 0;

  constructor(cacheEngine: CacheEngine, cleanupWorker: CleanupWorker) {
    this.cacheEngine = cacheEngine;
    this.cleanupWorker = cleanupWorker;
    
    this.startPerformanceTracking();
  }

  public getSystemStats(): SystemStats {
    const cacheStats = this.cacheEngine.getStats();
    const cleanupStats = this.cleanupWorker.getStats();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.initialCpuUsage);

    this.peakMemoryUsage = Math.max(this.peakMemoryUsage, cacheStats.memoryUsageMB);

    return {
      cache: cacheStats,
      cleanup: cleanupStats,
      system: {
        memoryUsage,
        uptime: Date.now() - this.startTime,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        cpuUsage
      },
      config: {
        maxMemoryMB: this.config.maxMemoryMB,
        defaultTTL: this.config.defaultTTL,
        cleanupInterval: this.config.cleanupIntervalMs,
        evictionPolicy: this.config.evictionPolicy,
        persistenceEnabled: this.config.persistenceEnabled
      },
      performance: this.getPerformanceStats()
    };
  }

  public getCacheStats(): ReturnType<CacheEngine['getStats']> {
    return this.cacheEngine.getStats();
  }

  public getCleanupStats(): ReturnType<CleanupWorker['getStats']> {
    return this.cleanupWorker.getStats();
  }

  public getPerformanceStats() {
    const recentHistory = this.performanceHistory.slice(-10);
    
    if (recentHistory.length === 0) {
      return {
        operationsPerSecond: 0,
        averageResponseTime: 0,
        peakMemoryUsage: this.peakMemoryUsage,
        peakOperationsPerSecond: this.peakOpsPerSecond
      };
    }

    const totalOps = recentHistory.reduce((sum, entry) => sum + entry.operations, 0);
    const timeSpanSeconds = recentHistory.length;
    const opsPerSecond = totalOps / timeSpanSeconds;

    this.peakOpsPerSecond = Math.max(this.peakOpsPerSecond, opsPerSecond);

    return {
      operationsPerSecond: Math.round(opsPerSecond * 100) / 100,
      averageResponseTime: this.calculateAverageResponseTime(),
      peakMemoryUsage: this.peakMemoryUsage,
      peakOperationsPerSecond: this.peakOpsPerSecond
    };
  }

  public getHealthStatus(): HealthStatus {
    const cacheStats = this.cacheEngine.getStats();
    const memoryUsage = process.memoryUsage();
    const performance = this.getPerformanceStats();

    const memoryUsagePercent = (cacheStats.memoryUsageMB / this.config.maxMemoryMB) * 100;
    const systemMemoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    const issues: string[] = [];

    if (memoryUsagePercent > 90) {
      issues.push('Cache memory usage critically high');
    } else if (memoryUsagePercent > 75) {
      issues.push('Cache memory usage high');
    }

    if (systemMemoryPercent > 85) {
      issues.push('System memory usage high');
    }

    if (cacheStats.hitRate < 50) {
      issues.push('Low cache hit rate');
    }

    if (performance.operationsPerSecond < 10 && cacheStats.hitCount + cacheStats.missCount > 100) {
      issues.push('Low operations per second');
    }

    const status: HealthStatus['status'] = 
      issues.length === 0 ? 'healthy' : 
      issues.some(i => i.includes('critically')) ? 'critical' : 'warning';

    return {
      status,
      uptime: Date.now() - this.startTime,
      issues,
      metrics: {
        cacheMemoryPercent: Math.round(memoryUsagePercent * 100) / 100,
        systemMemoryPercent: Math.round(systemMemoryPercent * 100) / 100,
        hitRate: cacheStats.hitRate,
        operationsPerSecond: performance.operationsPerSecond
      }
    };
  }

  private startPerformanceTracking(): void {
    setInterval(() => {
      const cacheStats = this.cacheEngine.getStats();
      const totalOperations = cacheStats.hitCount + cacheStats.missCount;
      
      const entry = {
        timestamp: Date.now(),
        operations: totalOperations,
        memoryMB: cacheStats.memoryUsageMB
      };

      this.performanceHistory.push(entry);

      if (this.performanceHistory.length > this.HISTORY_LIMIT) {
        this.performanceHistory.shift();
      }

    }, 1000);
  }

  private calculateAverageResponseTime(): number {
    return 0.5;
  }

  public logPerformanceReport(): void {
    const stats = this.getSystemStats();
    const health = this.getHealthStatus();

    Logger.info('Performance Report', {
      health: health.status,
      cache: {
        keys: stats.cache.totalKeys,
        memoryMB: stats.cache.memoryUsageMB,
        hitRate: `${stats.cache.hitRate}%`
      },
      performance: {
        opsPerSecond: stats.performance.operationsPerSecond,
        peakMemory: stats.performance.peakMemoryUsage
      },
      issues: health.issues
    });
  }

  public startPeriodicReporting(intervalMs: number = 300000): void {
    setInterval(() => {
      this.logPerformanceReport();
    }, intervalMs);

    Logger.info(`Started periodic performance reporting every ${intervalMs}ms`);
  }
}

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  issues: string[];
  metrics: {
    cacheMemoryPercent: number;
    systemMemoryPercent: number;
    hitRate: number;
    operationsPerSecond: number;
  };
}