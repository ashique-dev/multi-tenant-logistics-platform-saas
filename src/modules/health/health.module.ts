import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { ReadinessRegistry } from './readiness.registry.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService, ReadinessRegistry],
  exports: [ReadinessRegistry],
})
export class HealthModule {}
