import { Module } from '@nestjs/common';
import { RequestContextModule } from '../common/context/request-context.module.js';
import { HttpCommonModule } from '../common/http/http-common.module.js';
import { AppConfigModule } from '../config/config.module.js';
import { LoggingModule } from '../infrastructure/observability/logging.module.js';
import { HealthModule } from '../modules/health/health.module.js';

/** Transactional-outbox relay process (Phase 6). */
@Module({
  imports: [AppConfigModule, RequestContextModule, LoggingModule, HttpCommonModule, HealthModule],
})
export class RelayModule {}
