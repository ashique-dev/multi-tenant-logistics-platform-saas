import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { DomainError, type DomainErrorKind } from '../exceptions/domain-error.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import type { ErrorMapper, MappedError } from '../exceptions/error-mapper.js';
import { ValidationFailedException } from '../exceptions/validation-failed.exception.js';

const KIND_TO_STATUS: Record<DomainErrorKind, number> = {
  validation: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  precondition: HttpStatus.UNPROCESSABLE_ENTITY,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  timeout: HttpStatus.GATEWAY_TIMEOUT,
};

const STATUS_TO_CODE: Record<number, string> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  405: ErrorCode.METHOD_NOT_ALLOWED,
  409: ErrorCode.CONFLICT,
  412: ErrorCode.PRECONDITION_FAILED,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.UNPROCESSABLE,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.GATEWAY_TIMEOUT,
};

const ROUTE_NOT_FOUND_MESSAGE = /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;

const GENERIC_INTERNAL: MappedError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: ErrorCode.INTERNAL_ERROR,
  message: 'An unexpected error occurred',
  details: null,
};

/** Shape of errors raised by body-parser / http-errors (not Nest HttpExceptions). */
interface HttpErrorLike {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
}

function asHttpErrorLike(error: unknown): HttpErrorLike | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as HttpErrorLike;
  const status = e.status ?? e.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? e : undefined;
}

/**
 * Pure mapping: any thrown value -> the public error contract. No I/O, no logging,
 * so every branch is unit-testable. Internal details (messages of unknown errors,
 * stacks, driver errors) never reach the client.
 */
export function mapException(error: unknown, mappers: readonly ErrorMapper[] = []): MappedError {
  if (error instanceof DomainError) {
    return {
      status: KIND_TO_STATUS[error.kind],
      code: error.code,
      message: error.message,
      details: error.details ?? null,
    };
  }

  const mapper = mappers.find((m) => m.supports(error));
  if (mapper) {
    const mapped = mapper.map(error);
    return { ...mapped, details: mapped.details ?? null };
  }

  if (error instanceof ValidationFailedException) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed',
      details: error.violations,
    };
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status >= 500) {
      return {
        ...GENERIC_INTERNAL,
        status,
        code: STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR,
      };
    }
    if (error instanceof NotFoundException && ROUTE_NOT_FOUND_MESSAGE.test(error.message)) {
      return {
        status,
        code: ErrorCode.ROUTE_NOT_FOUND,
        message: 'The requested route does not exist',
        details: null,
      };
    }
    return {
      status,
      code: STATUS_TO_CODE[status] ?? ErrorCode.BAD_REQUEST,
      message: error.message,
      details: null,
    };
  }

  const httpLike = asHttpErrorLike(error);
  if (httpLike) {
    const status = httpLike.status ?? httpLike.statusCode ?? 400;
    if (httpLike.type === 'entity.too.large') {
      return {
        status: 413,
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request body is too large',
        details: null,
      };
    }
    if (httpLike.type === 'entity.parse.failed') {
      return {
        status: 400,
        code: ErrorCode.INVALID_JSON,
        message: 'Request body is not valid JSON',
        details: null,
      };
    }
    return {
      status,
      code: STATUS_TO_CODE[status] ?? ErrorCode.BAD_REQUEST,
      message: 'The request could not be processed',
      details: null,
    };
  }

  return GENERIC_INTERNAL;
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details: unknown };
  requestId: string | null;
}

export function toEnvelope(mapped: MappedError, requestId: string | undefined): ErrorEnvelope {
  return {
    success: false,
    error: { code: mapped.code, message: mapped.message, details: mapped.details ?? null },
    requestId: requestId ?? null,
  };
}
