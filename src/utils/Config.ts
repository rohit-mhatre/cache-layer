import { EvictionPolicy } from '../cache/EvictionPolicies';

export interface CacheConfig {
  maxMemoryMB: number;
  defaultTTL: number;
  cleanupIntervalMs: number;
  evictionPolicy: EvictionPolicy;
  persistenceEnabled: boolean;
  persistenceIntervalMs: number;
  snapshotPath: string;
  aofPath: string;
  port: number;
  host: string;
  clusterEnabled: boolean;
  logLevel: string;
}

export class Config {
  private static instance: Config;
  private config: CacheConfig;

  private constructor() {
    this.config = {
      maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB || '100'),
      defaultTTL: parseInt(process.env.DEFAULT_TTL_SECONDS || '3600'),
      cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '60000'),
      evictionPolicy: (process.env.EVICTION_POLICY as EvictionPolicy) || EvictionPolicy.LRU,
      persistenceEnabled: process.env.PERSISTENCE_ENABLED === 'true',
      persistenceIntervalMs: parseInt(process.env.PERSISTENCE_INTERVAL_MS || '300000'),
      snapshotPath: process.env.SNAPSHOT_PATH || './data/snapshot.json',
      aofPath: process.env.AOF_PATH || './data/cache.aof',
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || '0.0.0.0',
      clusterEnabled: process.env.CLUSTER_ENABLED === 'true',
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    this.validateConfig();
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  public get(): CacheConfig {
    return { ...this.config };
  }

  public update(updates: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.maxMemoryMB <= 0) {
      throw new Error('maxMemoryMB must be greater than 0');
    }

    if (this.config.defaultTTL < 0) {
      throw new Error('defaultTTL must be non-negative');
    }

    if (this.config.cleanupIntervalMs <= 0) {
      throw new Error('cleanupIntervalMs must be greater than 0');
    }

    if (!Object.values(EvictionPolicy).includes(this.config.evictionPolicy)) {
      throw new Error(`Invalid eviction policy: ${this.config.evictionPolicy}`);
    }

    if (this.config.port < 1 || this.config.port > 65535) {
      throw new Error('Port must be between 1 and 65535');
    }
  }

  public getMaxMemoryBytes(): number {
    return this.config.maxMemoryMB * 1024 * 1024;
  }

  public static createFromEnv(): Config {
    return Config.getInstance();
  }
}