import { Injectable } from '@nestjs/common';
import { ReadinessRegistry } from './readiness.registry.js';

export type CheckStatus = 'up' | 'down' | 'timeout';

export interface CheckResult {
  status: CheckStatus;
  critical: boolean;
  latencyMs: number;
}

export interface ReadinessReport {
  status: 'ok' | 'degraded' | 'unavailable';
  checks: Record<string, CheckResult>;
}

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(private readonly registry: ReadinessRegistry) {}

  /** Liveness never touches a dependency: restarting a pod cannot fix a broken broker. */
  liveness(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  async readiness(): Promise<ReadinessReport> {
    const results = await Promise.all(
      this.registry.all().map(async (c): Promise<[string, CheckResult]> => {
        const started = performance.now();
        let timer: NodeJS.Timeout | undefined;
        try {
          const outcome = await Promise.race([
            c.check().then(() => 'up' as const),
            new Promise<'timeout'>((resolve) => {
              timer = setTimeout(() => resolve('timeout'), CHECK_TIMEOUT_MS);
            }),
          ]);
          return [c.name, { status: outcome, critical: c.critical, latencyMs: elapsed(started) }];
        } catch {
          // Error text from drivers can contain hostnames/credentials: never exposed.
          return [c.name, { status: 'down', critical: c.critical, latencyMs: elapsed(started) }];
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );

    const checks = Object.fromEntries(results);
    const failed = Object.values(checks).filter((c) => c.status !== 'up');
    const status = failed.some((c) => c.critical)
      ? 'unavailable'
      : failed.length
        ? 'degraded'
        : 'ok';
    return { status, checks };
  }
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
