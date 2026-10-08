import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService, type ReadinessReport } from './health.service.js';

@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return this.health.liveness();
  }

  /** 503 only when a *critical* dependency is down; degraded stays 200. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status === 'unavailable') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
