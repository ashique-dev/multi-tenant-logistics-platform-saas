import { ValidationPipe } from '@nestjs/common';
import {
  ValidationFailedException,
  flattenValidationErrors,
} from '../exceptions/validation-failed.exception.js';

/**
 * - whitelist: strips properties without a decorator (mass-assignment protection)
 * - forbidNonWhitelisted: rejects them instead of silently dropping (clients learn early)
 * - transform: payloads become DTO instances, query strings become typed values
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) => new ValidationFailedException(flattenValidationErrors(errors)),
  });
}
