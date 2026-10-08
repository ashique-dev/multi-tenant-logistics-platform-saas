import { Global, Module } from '@nestjs/common';
import { type AppConfig, loadConfig } from './env.schema.js';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type { AppConfig };

/**
 * Global on purpose: configuration is the one dependency every module legitimately
 * shares, and it is immutable. Everything else must be imported explicitly.
 * Not using @nestjs/config: a typed, validated, frozen object is simpler and testable.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => Object.freeze(loadConfig()) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
