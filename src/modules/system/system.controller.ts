import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';

class SystemInfoResponse {
  service!: string;
  version!: string;
}

@ApiTags('system')
@Controller({ path: 'system', version: '1' })
export class SystemController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('info')
  @ApiOperation({ summary: 'Service name and version (public smoke-test endpoint)' })
  info(): SystemInfoResponse {
    return { service: this.config.serviceName, version: this.config.version };
  }
}
