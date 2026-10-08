import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { RequestContext } from './request-context.js';

/**
 * Global: request context is cross-cutting infrastructure (logging, auditing,
 * tenant-aware data access all read it).
 *
 * The HTTP scope itself is opened by ClsMiddleware in configureApp(), NOT by the
 * module's auto-mounted middleware: Nest does not apply module middleware to routes
 * excluded from the global prefix, which would leave /health/* without a request ID.
 * Non-HTTP entrypoints (Kafka/RabbitMQ/BullMQ consumers, Phase 3) open their own
 * scope with ClsService.run().
 */
@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
  providers: [RequestContext],
  exports: [RequestContext],
})
export class RequestContextModule {}
