import { CacheEngine } from '../src/cache/CacheEngine';
import { EvictionPolicy } from '../src/cache/EvictionPolicies';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  operation: string;
  totalOperations: number;
  totalTimeMs: number;
  operationsPerSecond: number;
  averageLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    totalOperations: number;
    totalTimeMs: number;
    overallOpsPerSecond: number;
  };
}

class CacheBenchmark {
  private cache: CacheEngine;
  private readonly warmupOps = 1000;
  private readonly testOps = 10000;

  constructor(evictionPolicy: EvictionPolicy = EvictionPolicy.LRU) {
    this.cache = new CacheEngine(evictionPolicy);
  }

  public async runFullBenchmark(): Promise<void> {
    console.log('🚀 Starting Cache Layer Benchmark Suite\n');

    const suites = [
      await this.runBasicOperationsSuite(),
      await this.runMixedWorkloadSuite(),
      await this.runTTLOperationsSuite(),
      await this.runBatchOperationsSuite()
    ];

    this.printResults(suites);
    await this.runMemoryBenchmark();
    await this.runEvictionPolicyComparison();
  }

  private async runBasicOperationsSuite(): Promise<BenchmarkSuite> {
    console.log('Running Basic Operations Suite...');
    
    const results: BenchmarkResult[] = [];
    
    results.push(await this.benchmarkSetOperations());
    results.push(await this.benchmarkGetOperations());
    results.push(await this.benchmarkDeleteOperations());

    const totalOps = results.reduce((sum, r) => sum + r.totalOperations, 0);
    const totalTime = results.reduce((sum, r) => sum + r.totalTimeMs, 0);

    return {
      name: 'Basic Operations',
      results,
      summary: {
        totalOperations: totalOps,
        totalTimeMs: totalTime,
        overallOpsPerSecond: Math.round((totalOps / totalTime) * 1000)
      }
    };
  }

  private async benchmarkSetOperations(): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    
    this.cache.clear();
    
    for (let i = 0; i < this.warmupOps; i++) {
      this.cache.set(`warmup_${i}`, `value_${i}`);
    }

    const startTime = performance.now();

    for (let i = 0; i < this.testOps; i++) {
      const opStart = performance.now();
      this.cache.set(`key_${i}`, { id: i, data: `test_data_${i}`, timestamp: Date.now() });
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = performance.now();

    return this.calculateBenchmarkResult('SET', this.testOps, endTime - startTime, latencies);
  }

  private async benchmarkGetOperations(): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    
    for (let i = 0; i < this.testOps; i++) {
      this.cache.set(`get_key_${i}`, `value_${i}`);
    }

    const startTime = performance.now();

    for (let i = 0; i < this.testOps; i++) {
      const opStart = performance.now();
      this.cache.get(`get_key_${Math.floor(Math.random() * this.testOps)}`);
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = performance.now();

    return this.calculateBenchmarkResult('GET', this.testOps, endTime - startTime, latencies);
  }

  private async benchmarkDeleteOperations(): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    
    for (let i = 0; i < this.testOps; i++) {
      this.cache.set(`del_key_${i}`, `value_${i}`);
    }

    const startTime = performance.now();

    for (let i = 0; i < this.testOps; i++) {
      const opStart = performance.now();
      this.cache.delete(`del_key_${i}`);
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = performance.now();

    return this.calculateBenchmarkResult('DELETE', this.testOps, endTime - startTime, latencies);
  }

  private async runMixedWorkloadSuite(): Promise<BenchmarkSuite> {
    console.log('Running Mixed Workload Suite...');
    
    const latencies: number[] = [];
    this.cache.clear();

    for (let i = 0; i < this.testOps; i++) {
      this.cache.set(`mix_key_${i}`, `initial_value_${i}`);
    }

    const startTime = performance.now();

    for (let i = 0; i < this.testOps; i++) {
      const opStart = performance.now();
      const rand = Math.random();
      
      if (rand < 0.7) {
        this.cache.get(`mix_key_${Math.floor(Math.random() * this.testOps)}`);
      } else if (rand < 0.9) {
        this.cache.set(`mix_key_${Math.floor(Math.random() * this.testOps)}`, `updated_${i}`);
      } else {
        this.cache.delete(`mix_key_${Math.floor(Math.random() * this.testOps)}`);
      }
      
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = performance.now();

    const result = this.calculateBenchmarkResult('MIXED', this.testOps, endTime - startTime, latencies);

    return {
      name: 'Mixed Workload (70% GET, 20% SET, 10% DELETE)',
      results: [result],
      summary: {
        totalOperations: this.testOps,
        totalTimeMs: endTime - startTime,
        overallOpsPerSecond: result.operationsPerSecond
      }
    };
  }

  private async runTTLOperationsSuite(): Promise<BenchmarkSuite> {
    console.log('Running TTL Operations Suite...');
    
    const latencies: number[] = [];
    this.cache.clear();

    const startTime = performance.now();

    for (let i = 0; i < this.testOps; i++) {
      const opStart = performance.now();
      this.cache.set(`ttl_key_${i}`, `value_${i}`, { ttl: 60 + Math.floor(Math.random() * 300) });
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = performance.now();

    const result = this.calculateBenchmarkResult('SET_WITH_TTL', this.testOps, endTime - startTime, latencies);

    return {
      name: 'TTL Operations',
      results: [result],
      summary: {
        totalOperations: this.testOps,
        totalTimeMs: endTime - startTime,
        overallOpsPerSecond: result.operationsPerSecond
      }
    };
  }

  private async runBatchOperationsSuite(): Promise<BenchmarkSuite> {
    console.log('Running Batch Operations Suite...');
    
    const latencies: number[] = [];
    this.cache.clear();

    const batchSize = 100;
    const batches = this.testOps / batchSize;

    const startTime = performance.now();

    for (let batch = 0; batch < batches; batch++) {
      const opStart = performance.now();
      
      for (let i = 0; i < batchSize; i++) {
        const key = `batch_${batch}_${i}`;
        this.cache.set(key, { batch, index: i, data: `batch_data_${batch}_${i}` });
      }
      
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = performance.now();

    const result = this.calculateBenchmarkResult('BATCH_SET', this.testOps, endTime - startTime, latencies);

    return {
      name: 'Batch Operations (100 keys per batch)',
      results: [result],
      summary: {
        totalOperations: this.testOps,
        totalTimeMs: endTime - startTime,
        overallOpsPerSecond: result.operationsPerSecond
      }
    };
  }

  private calculateBenchmarkResult(
    operation: string,
    totalOps: number,
    totalTimeMs: number,
    latencies: number[]
  ): BenchmarkResult {
    latencies.sort((a, b) => a - b);
    
    const p50Index = Math.floor(latencies.length * 0.5);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    return {
      operation,
      totalOperations: totalOps,
      totalTimeMs: Math.round(totalTimeMs * 100) / 100,
      operationsPerSecond: Math.round((totalOps / totalTimeMs) * 1000),
      averageLatencyMs: Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 1000) / 1000,
      minLatencyMs: Math.round(latencies[0] * 1000) / 1000,
      maxLatencyMs: Math.round(latencies[latencies.length - 1] * 1000) / 1000,
      percentiles: {
        p50: Math.round(latencies[p50Index] * 1000) / 1000,
        p95: Math.round(latencies[p95Index] * 1000) / 1000,
        p99: Math.round(latencies[p99Index] * 1000) / 1000
      }
    };
  }

  private printResults(suites: BenchmarkSuite[]): void {
    console.log('\n📊 BENCHMARK RESULTS\n');
    console.log('='.repeat(80));

    for (const suite of suites) {
      console.log(`\n${suite.name}`);
      console.log('-'.repeat(suite.name.length));

      for (const result of suite.results) {
        console.log(`\n${result.operation}:`);
        console.log(`  Operations:           ${result.totalOperations.toLocaleString()}`);
        console.log(`  Total Time:           ${result.totalTimeMs.toLocaleString()}ms`);
        console.log(`  Ops/Second:           ${result.operationsPerSecond.toLocaleString()}`);
        console.log(`  Average Latency:      ${result.averageLatencyMs}ms`);
        console.log(`  Min/Max Latency:      ${result.minLatencyMs}ms / ${result.maxLatencyMs}ms`);
        console.log(`  Percentiles (P50/P95/P99): ${result.percentiles.p50}ms / ${result.percentiles.p95}ms / ${result.percentiles.p99}ms`);
      }

      console.log(`\nSuite Summary:`);
      console.log(`  Total Operations:     ${suite.summary.totalOperations.toLocaleString()}`);
      console.log(`  Total Time:           ${suite.summary.totalTimeMs.toLocaleString()}ms`);
      console.log(`  Overall Ops/Second:   ${suite.summary.overallOpsPerSecond.toLocaleString()}`);
    }
  }

  private async runMemoryBenchmark(): Promise<void> {
    console.log('\n🧠 MEMORY USAGE ANALYSIS\n');
    console.log('='.repeat(50));

    this.cache.clear();
    
    const memoryTests = [
      { keys: 1000, description: '1K small strings' },
      { keys: 10000, description: '10K small strings' },
      { keys: 1000, description: '1K large objects', largeValues: true }
    ];

    for (const test of memoryTests) {
      this.cache.clear();
      
      for (let i = 0; i < test.keys; i++) {
        const value = test.largeValues 
          ? { id: i, data: 'x'.repeat(1000), metadata: { created: Date.now(), tags: Array(50).fill(`tag_${i}`) } }
          : `value_${i}`;
        
        this.cache.set(`key_${i}`, value);
      }

      const stats = this.cache.getStats();
      console.log(`\n${test.description}:`);
      console.log(`  Total Keys:           ${stats.totalKeys.toLocaleString()}`);
      console.log(`  Memory Usage:         ${stats.memoryUsageMB.toLocaleString()}MB`);
      console.log(`  Bytes per Key:        ${Math.round(stats.memoryUsageBytes / stats.totalKeys).toLocaleString()}`);
    }
  }

  private async runEvictionPolicyComparison(): Promise<void> {
    console.log('\n⚡ EVICTION POLICY COMPARISON\n');
    console.log('='.repeat(50));

    const policies = [EvictionPolicy.LRU, EvictionPolicy.LFU, EvictionPolicy.FIFO];
    const testOps = 5000;

    for (const policy of policies) {
      const cache = new CacheEngine(policy);
      const latencies: number[] = [];

      const startTime = performance.now();

      for (let i = 0; i < testOps; i++) {
        const opStart = performance.now();
        cache.set(`key_${i}`, `value_${i}`);
        const opEnd = performance.now();
        latencies.push(opEnd - opStart);
      }

      const endTime = performance.now();
      const stats = cache.getStats();

      console.log(`\n${policy} Policy:`);
      console.log(`  Operations:           ${testOps.toLocaleString()}`);
      console.log(`  Time:                 ${Math.round(endTime - startTime)}ms`);
      console.log(`  Ops/Second:           ${Math.round((testOps / (endTime - startTime)) * 1000).toLocaleString()}`);
      console.log(`  Final Keys:           ${stats.totalKeys.toLocaleString()}`);
      console.log(`  Memory Usage:         ${stats.memoryUsageMB}MB`);
    }
  }
}

async function main(): Promise<void> {
  try {
    const benchmark = new CacheBenchmark();
    await benchmark.runFullBenchmark();
    
    console.log('\n✅ Benchmark completed successfully!');
    console.log('\nNote: Results may vary based on system performance and current load.');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { CacheBenchmark };