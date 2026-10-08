import { Module } from '@nestjs/common';
import { RequestContextModule } from '../common/context/request-context.module.js';
import { HttpCommonModule } from '../common/http/http-common.module.js';
import { AppConfigModule } from '../config/config.module.js';
import { LoggingModule } from '../infrastructure/observability/logging.module.js';
import { HealthModule } from '../modules/health/health.module.js';
import { SystemModule } from '../modules/system/system.module.js';

/** HTTP process. Feature modules (identity, orders, ...) are added here phase by phase. */
@Module({
  imports: [
    AppConfigModule,
    RequestContextModule,
    LoggingModule,
    HttpCommonModule,
    HealthModule,
    SystemModule,
  ],
})
export class ApiModule {}
