/**
 * HTTP-agnostic error taxonomy. Domain/application code throws these; only the
 * presentation layer (AllExceptionsFilter) knows how they map to HTTP. This keeps the
 * dependency direction correct: domain never imports @nestjs/common.
 */
export type DomainErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'precondition'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly kind: DomainErrorKind,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Data-access code reached without an established tenant. Always a bug; fails closed. */
export class TenantContextMissingError extends DomainError {
  constructor() {
    super(
      'TENANT_CONTEXT_MISSING',
      'Operation requires a tenant context but none was established',
      'forbidden',
    );
  }
}
