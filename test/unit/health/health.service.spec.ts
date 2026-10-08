import { HealthService } from '../../../src/modules/health/health.service.js';
import { ReadinessRegistry } from '../../../src/modules/health/readiness.registry.js';

function setup(): { registry: ReadinessRegistry; service: HealthService } {
  const registry = new ReadinessRegistry();
  return { registry, service: new HealthService(registry) };
}

describe('HealthService', () => {
  it('liveness never depends on registered checks', () => {
    const { registry, service } = setup();
    registry.register({
      name: 'postgres',
      critical: true,
      check: () => Promise.reject(new Error('down')),
    });
    expect(service.liveness().status).toBe('ok');
  });

  it('is ok with no checks registered (Phase 2 skeleton)', async () => {
    expect(await setup().service.readiness()).toEqual({ status: 'ok', checks: {} });
  });

  it('is ok when every check passes', async () => {
    const { registry, service } = setup();
    registry.register({ name: 'postgres', critical: true, check: () => Promise.resolve() });
    registry.register({ name: 'redis', critical: false, check: () => Promise.resolve() });
    const r = await service.readiness();
    expect(r.status).toBe('ok');
    expect(r.checks['postgres']?.status).toBe('up');
  });

  it('is DEGRADED (not unavailable) when only a non-critical dependency is down', async () => {
    const { registry, service } = setup();
    registry.register({ name: 'postgres', critical: true, check: () => Promise.resolve() });
    registry.register({
      name: 'kafka',
      critical: false,
      check: () => Promise.reject(new Error('broker down')),
    });
    const r = await service.readiness();
    expect(r.status).toBe('degraded');
    expect(r.checks['kafka']).toMatchObject({ status: 'down', critical: false });
  });

  it('is UNAVAILABLE when a critical dependency is down', async () => {
    const { registry, service } = setup();
    registry.register({
      name: 'postgres',
      critical: true,
      check: () => Promise.reject(new Error('refused')),
    });
    registry.register({ name: 'redis', critical: false, check: () => Promise.resolve() });
    expect((await service.readiness()).status).toBe('unavailable');
  });

  it('never leaks driver error text (hostnames, credentials) in the report', async () => {
    const { registry, service } = setup();
    registry.register({
      name: 'postgres',
      critical: true,
      check: () =>
        Promise.reject(new Error('password authentication failed for user "app" at 10.1.2.3')),
    });
    const json = JSON.stringify(await service.readiness());
    expect(json).not.toContain('10.1.2.3');
    expect(json).not.toContain('password');
  });

  it('times out a hung dependency instead of hanging the probe', async () => {
    const { registry, service } = setup();
    registry.register({
      name: 'redis',
      critical: false,
      check: () => new Promise<void>(() => undefined),
    });
    const started = Date.now();
    const r = await service.readiness();
    expect(r.checks['redis']?.status).toBe('timeout');
    expect(r.status).toBe('degraded');
    expect(Date.now() - started).toBeLessThan(3_500);
  }, 10_000);

  it('runs checks in parallel (slow checks do not add up)', async () => {
    const { registry, service } = setup();
    const slow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 300));
    registry.register({ name: 'a', critical: false, check: slow });
    registry.register({ name: 'b', critical: false, check: slow });
    registry.register({ name: 'c', critical: false, check: slow });
    const started = Date.now();
    await service.readiness();
    expect(Date.now() - started).toBeLessThan(800);
  });

  it('replaces a check registered twice under the same name', () => {
    const { registry } = setup();
    registry.register({ name: 'x', critical: false, check: () => Promise.resolve() });
    registry.register({ name: 'x', critical: true, check: () => Promise.resolve() });
    expect(registry.all()).toHaveLength(1);
    expect(registry.all()[0]?.critical).toBe(true);
  });
});
