import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { createValidationPipe } from './validation-pipe.js';

/**
 * Registers global filter and pipe through DI (APP_*) rather than app.useGlobal*(),
 * so they get injected dependencies and apply identically in tests and production.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class HttpCommonModule {}
