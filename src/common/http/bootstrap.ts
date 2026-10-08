import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { loadConfig } from '../../config/env.schema.js';
import { type ProcessRole, configureApp } from './configure-app.js';

/**
 * Shared boot sequence. `api` listens on PORT; `worker`/`relay` expose only
 * health/metrics on OPS_PORT. Config is validated BEFORE Nest starts so a bad
 * environment fails in milliseconds with a readable message.
 */
export async function bootstrap(role: ProcessRole, rootModule: new () => unknown): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(rootModule, { bufferLogs: true });
  configureApp(app, config, role);

  // Nest's shutdown hooks drain gracefully on SIGTERM/SIGINT; this is the backstop
  // that guarantees we never hang past the orchestrator's kill deadline.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      setTimeout(() => process.exit(1), config.shutdownGraceMs).unref();
    });
  }

  const port = role === 'api' ? config.port : config.opsPort;
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log({ role, port, version: config.version }, `${role} process listening`);
}
