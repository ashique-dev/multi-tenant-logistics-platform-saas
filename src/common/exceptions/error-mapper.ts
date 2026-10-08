export interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  /** Extra response headers, e.g. Retry-After. */
  headers?: Record<string, string>;
}

/**
 * Extension point for infrastructure-specific errors. Phase 3 registers a Postgres
 * mapper (23505 -> 409, 40001/40P01 -> retryable, pool exhaustion -> 503) so that the
 * filter never imports a database driver (dependency direction stays correct).
 */
export interface ErrorMapper {
  supports(error: unknown): boolean;
  map(error: unknown): MappedError;
}

export const ERROR_MAPPERS = Symbol('ERROR_MAPPERS');
