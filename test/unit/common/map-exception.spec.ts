import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DomainError, type DomainErrorKind } from '../../../src/common/exceptions/domain-error.js';
import type { ErrorMapper } from '../../../src/common/exceptions/error-mapper.js';
import { ValidationFailedException } from '../../../src/common/exceptions/validation-failed.exception.js';
import { mapException, toEnvelope } from '../../../src/common/filters/map-exception.js';

describe('mapException', () => {
  describe('domain errors', () => {
    it.each<[DomainErrorKind, number]>([
      ['validation', 400],
      ['unauthorized', 401],
      ['forbidden', 403],
      ['not_found', 404],
      ['conflict', 409],
      ['precondition', 422],
      ['rate_limited', 429],
      ['unavailable', 503],
      ['timeout', 504],
    ])('maps kind %s to HTTP %i and preserves the domain code', (kind, status) => {
      const m = mapException(
        new DomainError('ORDER_NOT_FOUND', 'Order was not found', kind, { id: 1 }),
      );
      expect(m).toEqual({
        status,
        code: 'ORDER_NOT_FOUND',
        message: 'Order was not found',
        details: { id: 1 },
      });
    });
  });

  describe('infrastructure mappers', () => {
    const pgUnique: ErrorMapper = {
      supports: (e) => (e as { code?: string }).code === '23505',
      map: () => ({ status: 409, code: 'DUPLICATE_RESOURCE', message: 'Resource already exists' }),
    };

    it('uses a matching mapper and never leaks the raw driver error', () => {
      const raw = Object.assign(
        new Error('duplicate key value violates unique constraint "users_email_key"'),
        {
          code: '23505',
        },
      );
      const m = mapException(raw, [pgUnique]);
      expect(m.status).toBe(409);
      expect(JSON.stringify(m)).not.toContain('users_email_key');
    });

    it('ignores mappers that do not support the error', () => {
      expect(mapException(new Error('boom'), [pgUnique]).status).toBe(500);
    });
  });

  describe('validation', () => {
    it('returns VALIDATION_FAILED with field-level details', () => {
      const m = mapException(
        new ValidationFailedException([{ field: 'email', errors: ['must be an email'] }]),
      );
      expect(m).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        details: [{ field: 'email', errors: ['must be an email'] }],
      });
    });
  });

  describe('Nest HTTP exceptions', () => {
    it('maps 401/403 to stable codes', () => {
      expect(mapException(new UnauthorizedException()).code).toBe('UNAUTHORIZED');
      expect(mapException(new ForbiddenException()).code).toBe('FORBIDDEN');
    });

    it('distinguishes an unknown ROUTE from a missing RESOURCE', () => {
      expect(mapException(new NotFoundException('Cannot GET /api/x')).code).toBe('ROUTE_NOT_FOUND');
      expect(mapException(new NotFoundException('Order 7 not found')).code).toBe('NOT_FOUND');
    });

    it('passes through the message of 4xx errors (intended for clients)', () => {
      expect(mapException(new BadRequestException('Bad cursor')).message).toBe('Bad cursor');
    });

    it('masks the message of 5xx HttpExceptions', () => {
      const m = mapException(new InternalServerErrorException('db password is hunter2'));
      expect(m.status).toBe(500);
      expect(m.message).not.toContain('hunter2');
    });

    it('keeps the status of unusual HttpExceptions', () => {
      expect(mapException(new HttpException('teapot', 418)).status).toBe(418);
    });
  });

  describe('body-parser / http-errors', () => {
    it('maps entity.too.large to 413', () => {
      const m = mapException(
        Object.assign(new Error('request entity too large'), {
          status: 413,
          type: 'entity.too.large',
        }),
      );
      expect(m).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    });

    it('maps entity.parse.failed to INVALID_JSON without echoing the parser message', () => {
      const m = mapException(
        Object.assign(new SyntaxError('Unexpected token } in JSON at position 17'), {
          status: 400,
          type: 'entity.parse.failed',
        }),
      );
      expect(m).toMatchObject({ status: 400, code: 'INVALID_JSON' });
      expect(m.message).not.toContain('position 17');
    });
  });

  describe('unknown failures', () => {
    it.each([
      ['Error with secrets', new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2')],
      ['TypeError', new TypeError("Cannot read properties of undefined (reading 'id')")],
      ['thrown string', 'oops'],
      ['thrown null', null],
      ['thrown object', { secret: 'x' }],
    ])('returns a generic 500 for %s', (_label, thrown) => {
      expect(mapException(thrown)).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: null,
      });
    });
  });

  describe('toEnvelope', () => {
    it('produces the canonical shape', () => {
      expect(toEnvelope({ status: 404, code: 'X', message: 'm' }, 'req-1')).toEqual({
        success: false,
        error: { code: 'X', message: 'm', details: null },
        requestId: 'req-1',
      });
    });

    it('uses null (not undefined) when no request ID exists', () => {
      expect(toEnvelope({ status: 500, code: 'X', message: 'm' }, undefined).requestId).toBeNull();
    });
  });
});
