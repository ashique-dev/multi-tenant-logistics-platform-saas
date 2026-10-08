import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { type RequestContextStore, identifiersFor } from '../../common/context/request-context.js';

/**
 * Safety net, not a strategy: the primary defence is never passing secrets to the
 * logger. Redaction catches the accidents. (pino wildcards match ONE level only.)
 */
export const REDACT_PATHS: readonly string[] = [
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
  'cardNumber',
  'cvv',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.secret',
  '*.cardNumber',
  '*.cvv',
  '*.authorization',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

/** Adds correlation fields to every log line emitted inside a request's async scope. */
export function contextMixin(): Record<string, unknown> {
  const cls = ClsServiceManager.getClsService<RequestContextStore>();
  if (!cls.isActive()) return {};
  return {
    requestId: cls.get('requestId'),
    traceId: cls.get('traceId'),
    userId: cls.get('userId'),
    tenantId: cls.get('tenantId'),
  };
}

const QUIET_PATHS = new Set(['/health/live', '/health/ready', '/metrics']);

export function buildPinoOptions(config: AppConfig): pino.LoggerOptions {
  return {
    level: config.logLevel,
    base: { service: config.serviceName, environment: config.nodeEnv },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
    mixin: contextMixin,
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          ...buildPinoOptions(config),
          genReqId: (req: IncomingMessage) => identifiersFor(req).requestId,
          autoLogging: {
            ignore: (req: IncomingMessage) => QUIET_PATHS.has((req.url ?? '').split('?')[0] ?? ''),
          },
          customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          // Never log headers or query strings (tokens hide there); path + method only.
          serializers: {
            req: (req: { id?: string; method?: string; url?: string }) => ({
              id: req.id,
              method: req.method,
              path: (req.url ?? '').split('?')[0],
            }),
            res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
          },
          transport: config.logPretty ? { target: 'pino-pretty' } : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
