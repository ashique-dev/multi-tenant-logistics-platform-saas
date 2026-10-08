import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { RequestContext } from '../../src/common/context/request-context.js';
import { DomainError } from '../../src/common/exceptions/domain-error.js';

class AddressDto {
  @IsString() city!: string;
}

export class EchoDto {
  @IsEmail() email!: string;
  @IsInt() @Min(1) @Max(100) quantity!: number;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) address?: AddressDto;
}

/** Test-only controller that exercises the cross-cutting machinery. Never shipped. */
@Controller({ path: '__probe', version: '1' })
export class ProbeController {
  constructor(private readonly ctx: RequestContext) {}

  @Post('echo')
  @HttpCode(201)
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }

  @Get('boom')
  boom(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
  }

  @Get('domain/:kind')
  domain(@Param('kind') kind: string): never {
    const kinds = [
      'not_found',
      'forbidden',
      'unauthorized',
      'conflict',
      'precondition',
      'rate_limited',
      'unavailable',
      'timeout',
    ] as const;
    const k = kinds.find((x) => x === kind) ?? 'not_found';
    throw new DomainError(`PROBE_${k.toUpperCase()}`, `probe ${k}`, k, { kind: k });
  }

  @Get('uuid/:id')
  uuid(@Param('id', new ParseUUIDPipe()) id: string): { id: string } {
    return { id };
  }

  @Get('int/:n')
  int(@Param('n', ParseIntPipe) n: number): { n: number } {
    return { n };
  }

  @Get('query')
  query(@Query() q: Record<string, string>): Record<string, string> {
    return q;
  }

  @Get('ctx')
  async context(@Query('delay') delay?: string): Promise<{ requestId?: string; traceId?: string }> {
    await new Promise((r) => setTimeout(r, Number(delay ?? 0)));
    return { requestId: this.ctx.requestId, traceId: this.ctx.traceId };
  }

  @Get('tenant')
  tenant(): { tenantId: string } {
    return { tenantId: this.ctx.requireTenantId() };
  }
}
