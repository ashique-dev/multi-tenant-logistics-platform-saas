import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface FieldViolation {
  field: string;
  errors: string[];
}

/** Flattens class-validator's nested tree into `[{ field: 'a.b[0].c', errors: [...] }]`. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldViolation[] {
  const out: FieldViolation[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) out.push({ field, errors: Object.values(err.constraints) });
    if (err.children?.length) out.push(...flattenValidationErrors(err.children, field));
  }
  return out;
}

export class ValidationFailedException extends BadRequestException {
  constructor(public readonly violations: FieldViolation[]) {
    super('Request validation failed');
  }
}
