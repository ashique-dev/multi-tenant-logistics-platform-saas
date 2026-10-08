import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../context/request-context.js';
import { ERROR_MAPPERS, type ErrorMapper } from '../exceptions/error-mapper.js';
import { mapException, toEnvelope } from './map-exception.js';

/**
 * Single choke point for every error leaving the API: one envelope, no leakage,
 * consistent logging with request/trace correlation.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly context: RequestContext,
    private readonly logger: PinoLogger,
    @Optional() @Inject(ERROR_MAPPERS) private readonly mappers: ErrorMapper[] = [],
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;

    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse<object>();
    const mapped = mapException(exception, this.mappers);

    if (mapped.status >= 500) {
      this.logger.error(
        { err: exception, status: mapped.status, code: mapped.code },
        'Unhandled error',
      );
    } else {
      this.logger.warn({ status: mapped.status, code: mapped.code }, 'Request rejected');
    }

    for (const [name, value] of Object.entries(mapped.headers ?? {})) {
      httpAdapter.setHeader(response, name, value);
    }
    if (mapped.status === 401) httpAdapter.setHeader(response, 'WWW-Authenticate', 'Bearer');

    httpAdapter.reply(response, toEnvelope(mapped, this.context.requestId), mapped.status);
  }
}
