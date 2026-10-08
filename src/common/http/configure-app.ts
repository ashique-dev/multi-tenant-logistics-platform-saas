import { VersioningType, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { ClsMiddleware } from 'nestjs-cls';
import { Logger } from 'nestjs-pino';
import type { AppConfig } from '../../config/config.module.js';
import { setupRequestContext } from '../context/request-context.js';
import { DomainError } from '../exceptions/domain-error.js';

export type ProcessRole = 'api' | 'worker' | 'relay';

/**
 * Shared HTTP configuration for every process type. Used by the real entrypoints and
 * by the e2e tests, so tests exercise the same middleware stack as production.
 */
export function configureApp(
  app: NestExpressApplication,
  config: AppConfig,
  role: ProcessRole,
): void {
  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.trustProxyHops);
  app.disable('x-powered-by');

  // First middleware: everything after it (logging, errors, handlers) is inside the scope.
  app.use(new ClsMiddleware({ setup: setupRequestContext }).use);

  const strict = helmet();
  const docs = helmet({ contentSecurityPolicy: false }); // Swagger UI needs inline scripts
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith('/api/docs') ? docs : strict)(req, res, next),
  );
  app.use(compression());

  app.useBodyParser('json', { limit: config.bodyLimit });
  app.useBodyParser('urlencoded', { limit: config.bodyLimit, extended: false });

  // Nest's Express adapter rewrites body-parser SyntaxErrors into BadRequestException(
  // parserMessage), losing the error type and leaking parser internals. Intercept first.
  app.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    if ((err as { type?: string } | null)?.type === 'entity.parse.failed') {
      return next(new DomainError('INVALID_JSON', 'Request body is not valid JSON', 'validation'));
    }
    next(err);
  });

  app.enableCors({
    origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : false,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready', 'metrics'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  if (role === 'api' && config.swaggerEnabled) setupSwagger(app, config);
}

function setupSwagger(app: INestApplication, config: AppConfig): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Logistics & Commerce Operations Platform')
      .setVersion(config.version)
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
