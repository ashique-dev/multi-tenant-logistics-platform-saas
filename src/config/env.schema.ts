import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * Environment contract. Validated once at boot; the process refuses to start on
 * invalid configuration (fail fast beats failing at 3 a.m. on first use).
 *
 * Infrastructure settings (DATABASE_URL, REDIS_URL, KAFKA_BROKERS, ...) are added to
 * this schema in Phase 3, in the same commit as the code that consumes them, so
 * there is never validated-but-unused configuration.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1).default('logistics-platform'),
  APP_VERSION: z.string().min(1).optional(),

  /** HTTP port of the `api` process. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Ops-only port (health/metrics) of the `worker` and `relay` processes. */
  OPS_PORT: z.coerce.number().int().min(1).max(65535).default(9100),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanString.default(false),

  /** Comma-separated allow-list. Empty = no cross-origin access. */
  CORS_ORIGINS: z.string().default('').transform(csv),
  /** Number of reverse-proxy hops to trust for X-Forwarded-* (nginx = 1). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(b|kb|mb)$/i)
    .default('1mb'),
  /** Defaults to enabled outside production. */
  SWAGGER_ENABLED: booleanString.optional(),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).max(120_000).default(10_000),
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly isProduction: boolean;
  readonly serviceName: string;
  readonly version: string;
  readonly port: number;
  readonly opsPort: number;
  readonly logLevel: string;
  readonly logPretty: boolean;
  readonly corsOrigins: readonly string[];
  readonly trustProxyHops: number;
  readonly bodyLimit: string;
  readonly swaggerEnabled: boolean;
  readonly shutdownGraceMs: number;
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n - ${issues.join('\n - ')}`);
    this.name = 'ConfigValidationError';
  }
}

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigValidationError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    serviceName: e.SERVICE_NAME,
    version: e.APP_VERSION ?? readPackageVersion(),
    port: e.PORT,
    opsPort: e.OPS_PORT,
    logLevel: e.LOG_LEVEL,
    logPretty: e.LOG_PRETTY,
    corsOrigins: e.CORS_ORIGINS,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    bodyLimit: e.BODY_LIMIT,
    swaggerEnabled: e.SWAGGER_ENABLED ?? !isProduction,
    shutdownGraceMs: e.SHUTDOWN_GRACE_MS,
  };
}
