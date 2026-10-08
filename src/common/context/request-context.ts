import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';
import { TenantContextMissingError } from '../exceptions/domain-error.js';

export interface RequestContextStore extends ClsStore {
  requestId: string;
  traceId: string;
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

export interface Identity {
  userId: string;
  tenantId: string;
  sessionId?: string;
  roles: readonly string[];
  permissions: readonly string[];
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ZERO_TRACE_ID = '0'.repeat(32);

export interface RequestIdentifiers {
  requestId: string;
  traceId: string;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Untrusted input is validated, never echoed blindly: a malformed X-Request-Id could
 * otherwise inject into logs or response headers.
 */
export function parseIdentifiers(headers: IncomingHttpHeaders): RequestIdentifiers {
  const candidate = first(headers['x-request-id']);
  const requestId = candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();

  const match = TRACEPARENT_PATTERN.exec(first(headers['traceparent']) ?? '');
  const traceId =
    match?.[1] && match[1] !== ZERO_TRACE_ID ? match[1] : randomBytes(16).toString('hex');

  return { requestId, traceId };
}

const memo = new WeakMap<IncomingMessage, RequestIdentifiers>();

/**
 * Memoised per request so the context middleware and the HTTP logger always agree on
 * the same IDs regardless of which runs first.
 */
export function identifiersFor(req: IncomingMessage): RequestIdentifiers {
  let ids = memo.get(req);
  if (!ids) {
    ids = parseIdentifiers(req.headers);
    memo.set(req, ids);
  }
  return ids;
}

/**
 * The only way application code reads per-request state. Backed by AsyncLocalStorage
 * (nestjs-cls), so singleton services stay stateless and horizontally scalable.
 * Identity is written exactly once, by AuthGuard/TenantGuard (Phase 4).
 */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<RequestContextStore>) {}

  get active(): boolean {
    return this.cls.isActive();
  }
  get requestId(): string | undefined {
    return this.active ? this.cls.get('requestId') : undefined;
  }
  get traceId(): string | undefined {
    return this.active ? this.cls.get('traceId') : undefined;
  }
  get userId(): string | undefined {
    return this.active ? this.cls.get('userId') : undefined;
  }
  get tenantId(): string | undefined {
    return this.active ? this.cls.get('tenantId') : undefined;
  }
  get roles(): readonly string[] {
    return (this.active ? this.cls.get('roles') : undefined) ?? [];
  }
  get permissions(): readonly string[] {
    return (this.active ? this.cls.get('permissions') : undefined) ?? [];
  }

  setIdentity(identity: Identity): void {
    this.cls.set('userId', identity.userId);
    this.cls.set('tenantId', identity.tenantId);
    this.cls.set('roles', identity.roles);
    this.cls.set('permissions', identity.permissions);
    if (identity.sessionId) this.cls.set('sessionId', identity.sessionId);
  }

  /**
   * Data-access code calls this and never accepts a tenantId parameter from callers.
   * Missing tenant context is a programming error and fails closed.
   */
  requireTenantId(): string {
    const tenantId = this.tenantId;
    if (!tenantId) throw new TenantContextMissingError();
    return tenantId;
  }
}

/**
 * Runs inside the ALS scope created by ClsMiddleware: stamps request/trace IDs and
 * echoes X-Request-Id. Mounted via app.use() (see configureApp) rather than through
 * the module so it also covers routes excluded from the global prefix (/health/*).
 */
export function setupRequestContext(
  cls: { set(key: string, value: unknown): void },
  req: IncomingMessage,
  res: { setHeader(name: string, value: string): unknown },
): void {
  const { requestId, traceId } = identifiersFor(req);
  cls.set('requestId', requestId);
  cls.set('traceId', traceId);
  res.setHeader('X-Request-Id', requestId);
}
