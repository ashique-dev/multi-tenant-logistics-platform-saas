import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiModule } from '../../src/app/api.module.js';
import { configureApp } from '../../src/common/http/configure-app.js';
import { loadConfig } from '../../src/config/env.schema.js';
import { ReadinessRegistry } from '../../src/modules/health/readiness.registry.js';
import { ProbeController } from './probe.controller.js';

async function createApp(env: Record<string, string> = {}): Promise<NestExpressApplication> {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    previous[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
      controllers: [ProbeController],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app, loadConfig(), 'api');
    await app.init();
    return app;
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());

describe('API process (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /health/live -> 200 with a request id header', async () => {
      const res = await http(app).get('/health/live').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('GET /health/ready -> 200 ok when nothing is registered', async () => {
      const res = await http(app).get('/health/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: {} });
    });

    it('is NOT served under the /api prefix', async () => {
      await http(app).get('/api/health/live').expect(404);
    });

    it('readiness -> 503 when a critical dependency is down, with no error text leaked', async () => {
      const registry = app.get(ReadinessRegistry);
      registry.register({
        name: 'postgres',
        critical: true,
        check: () => Promise.reject(new Error('password=hunter2 host=10.0.0.9')),
      });
      const res = await http(app).get('/health/ready').expect(503);
      expect(res.body.status).toBe('unavailable');
      expect(res.body.checks.postgres.status).toBe('down');
      expect(JSON.stringify(res.body)).not.toMatch(/hunter2|10\.0\.0\.9/);
      // liveness is unaffected by the broken dependency
      await http(app).get('/health/live').expect(200);
      registry.register({ name: 'postgres', critical: true, check: () => Promise.resolve() });
    });

    it('readiness -> 200 degraded when only a non-critical dependency is down', async () => {
      const registry = app.get(ReadinessRegistry);
      registry.register({
        name: 'kafka',
        critical: false,
        check: () => Promise.reject(new Error('x')),
      });
      const res = await http(app).get('/health/ready').expect(200);
      expect(res.body.status).toBe('degraded');
      registry.register({ name: 'kafka', critical: false, check: () => Promise.resolve() });
    });
  });

  describe('routing & versioning', () => {
    it('GET /api/v1/system/info -> 200', async () => {
      const res = await http(app).get('/api/v1/system/info').expect(200);
      expect(res.body).toEqual({ service: 'logistics-platform-test', version: expect.any(String) });
    });

    it('requires an explicit version: unversioned paths are unknown routes', async () => {
      const res = await http(app).get('/api/system/info').expect(404);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    });

    it('rejects an unsupported API version as an unknown route', async () => {
      const res = await http(app).get('/api/v9/system/info').expect(404);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    });

    it('unknown route -> canonical 404 envelope whose requestId matches the header', async () => {
      const res = await http(app).get('/api/v1/nope').expect(404);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'The requested route does not exist',
          details: null,
        },
        requestId: res.headers['x-request-id'],
      });
    });

    it('wrong method on a known path -> 404 envelope (no stack, no path echo)', async () => {
      const res = await http(app).delete('/api/v1/system/info').expect(404);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('stack');
    });
  });

  describe('request / trace correlation', () => {
    it('honours a valid inbound X-Request-Id', async () => {
      const res = await http(app)
        .get('/api/v1/system/info')
        .set('X-Request-Id', 'client-req-12345')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('client-req-12345');
    });

    it('replaces an invalid inbound X-Request-Id', async () => {
      const res = await http(app)
        .get('/api/v1/system/info')
        .set('X-Request-Id', 'bad id!')
        .expect(200);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('adopts the trace id of an inbound W3C traceparent', async () => {
      const trace = '4bf92f3577b34da6a3ce929d0e0e4736';
      const res = await http(app)
        .get('/api/v1/__probe/ctx')
        .set('traceparent', `00-${trace}-00f067aa0ba902b7-01`)
        .expect(200);
      expect(res.body.traceId).toBe(trace);
    });

    it('keeps request context isolated across 60 concurrent requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          http(app)
            .get('/api/v1/__probe/ctx')
            .query({ delay: String((i * 7) % 40) })
            .set('X-Request-Id', `concurrent-req-${i.toString().padStart(3, '0')}`),
        ),
      );
      results.forEach((res, i) => {
        const expected = `concurrent-req-${i.toString().padStart(3, '0')}`;
        expect(res.body.requestId).toBe(expected);
        expect(res.headers['x-request-id']).toBe(expected);
      });
      expect(new Set(results.map((r) => r.body.traceId)).size).toBe(60);
    });
  });

  describe('security headers', () => {
    it('applies helmet defaults and hides the framework', async () => {
      const res = await http(app).get('/api/v1/system/info').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('denies cross-origin access when no origin is allow-listed', async () => {
      const res = await http(app)
        .get('/api/v1/system/info')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('serves Swagger UI outside production', async () => {
      await http(app).get('/api/docs-json').expect(200);
    });
  });

  describe('validation (ValidationPipe)', () => {
    it('201 for a valid body and returns the transformed DTO', async () => {
      const body = { email: 'a@b.co', quantity: 3, address: { city: 'Dhaka' } };
      const res = await http(app).post('/api/v1/__probe/echo').send(body).expect(201);
      expect(res.body).toEqual(body);
    });

    it('400 VALIDATION_FAILED listing every invalid field', async () => {
      const res = await http(app)
        .post('/api/v1/__probe/echo')
        .send({ email: 'nope', quantity: 0 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
      expect(fields).toEqual(['email', 'quantity']);
    });

    it('400 for nested violations with dotted paths', async () => {
      const res = await http(app)
        .post('/api/v1/__probe/echo')
        .send({ email: 'a@b.co', quantity: 1, address: { city: 42 } })
        .expect(400);
      expect(res.body.error.details).toEqual([
        { field: 'address.city', errors: ['city must be a string'] },
      ]);
    });

    it('rejects unknown properties (mass-assignment protection)', async () => {
      const res = await http(app)
        .post('/api/v1/__probe/echo')
        .send({ email: 'a@b.co', quantity: 1, role: 'admin', tenantId: 'other' })
        .expect(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
      expect(fields).toEqual(['role', 'tenantId']);
    });

    it('rejects type confusion (string instead of number, no implicit coercion)', async () => {
      await http(app)
        .post('/api/v1/__probe/echo')
        .send({ email: 'a@b.co', quantity: '5' })
        .expect(400);
    });

    it('rejects an empty body', async () => {
      await http(app).post('/api/v1/__probe/echo').send({}).expect(400);
    });

    it('400 INVALID_JSON for malformed JSON, without echoing parser internals', async () => {
      const res = await http(app)
        .post('/api/v1/__probe/echo')
        .set('Content-Type', 'application/json')
        .send('{"email": "a@b.co", ')
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
      expect(JSON.stringify(res.body)).not.toMatch(/position|Unexpected/);
    });

    it('413 PAYLOAD_TOO_LARGE above BODY_LIMIT', async () => {
      const res = await http(app)
        .post('/api/v1/__probe/echo')
        .send({ email: 'a@b.co', quantity: 1, pad: 'x'.repeat(5_000) })
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('ParseUUIDPipe: 400 for a malformed id, 200 for a valid one', async () => {
      await http(app).get('/api/v1/__probe/uuid/not-a-uuid').expect(400);
      const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
      const res = await http(app).get(`/api/v1/__probe/uuid/${id}`).expect(200);
      expect(res.body.id).toBe(id);
    });

    it('400 (not 500) for a malformed percent-encoded path, without a stack trace', async () => {
      const res = await http(app).get('/api/v1/__probe/int/%FF').expect(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|\.ts:/);
    });

    it('ParseIntPipe: 400 for non-numeric input', async () => {
      await http(app).get('/api/v1/__probe/int/abc').expect(400);
      await http(app).get('/api/v1/__probe/int/42').expect(200, { n: 42 });
    });
  });

  describe('error handling', () => {
    it('500 INTERNAL_ERROR for an unexpected error, leaking nothing', async () => {
      const res = await http(app).get('/api/v1/__probe/boom').expect(500);
      expect(res.body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: null,
      });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/hunter2|ECONNREFUSED|10\.0\.0\.5|stack|at .*\.ts/);
    });

    it.each([
      ['not_found', 404],
      ['forbidden', 403],
      ['unauthorized', 401],
      ['conflict', 409],
      ['precondition', 422],
      ['rate_limited', 429],
      ['unavailable', 503],
      ['timeout', 504],
    ])('domain error kind %s -> HTTP %i with its own code', async (kind, status) => {
      const res = await http(app).get(`/api/v1/__probe/domain/${kind}`).expect(status);
      expect(res.body.error.code).toBe(`PROBE_${kind.toUpperCase()}`);
      expect(res.body.success).toBe(false);
    });

    it('401 carries a WWW-Authenticate challenge', async () => {
      const res = await http(app).get('/api/v1/__probe/domain/unauthorized').expect(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
    });

    it('data access without a tenant context fails closed (403)', async () => {
      const res = await http(app).get('/api/v1/__probe/tenant').expect(403);
      expect(res.body.error.code).toBe('TENANT_CONTEXT_MISSING');
    });
  });
});

describe('API process configuration variants (e2e)', () => {
  it('allows a CORS origin only when it is allow-listed', async () => {
    const app = await createApp({ CORS_ORIGINS: 'https://app.example' });
    try {
      const ok = await http(app)
        .get('/api/v1/system/info')
        .set('Origin', 'https://app.example')
        .expect(200);
      expect(ok.headers['access-control-allow-origin']).toBe('https://app.example');
      const bad = await http(app)
        .get('/api/v1/system/info')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('does not serve Swagger when disabled (production default)', async () => {
    const app = await createApp({ NODE_ENV: 'production' });
    try {
      await http(app).get('/api/docs-json').expect(404);
    } finally {
      await app.close();
    }
  });

  it('refuses to boot with an invalid environment', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });
});
