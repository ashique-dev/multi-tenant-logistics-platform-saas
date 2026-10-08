import type { IncomingMessage } from 'node:http';
import { identifiersFor, parseIdentifiers } from '../../../src/common/context/request-context.js';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';

describe('parseIdentifiers', () => {
  it('keeps a well-formed inbound X-Request-Id', () => {
    expect(parseIdentifiers({ 'x-request-id': 'abc-12345_ok.v1:z' }).requestId).toBe(
      'abc-12345_ok.v1:z',
    );
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(129)],
    ['spaces', 'has some spaces here'],
    ['log injection', 'abcdefgh\n{"level":"fatal"}'],
    ['header injection', 'abcdefgh\r\nSet-Cookie: x=1'],
    ['unicode', 'идентификатор-123'],
    ['empty', ''],
  ])('replaces an invalid X-Request-Id (%s) with a generated UUID', (_label, value) => {
    const id = parseIdentifiers({ 'x-request-id': value }).requestId;
    expect(id).not.toBe(value);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the first value when the header repeats', () => {
    expect(
      parseIdentifiers({ 'x-request-id': ['first-id-12345', 'second-id-12345'] }).requestId,
    ).toBe('first-id-12345');
  });

  it('extracts the trace id from a valid W3C traceparent', () => {
    expect(parseIdentifiers({ traceparent: `00-${TRACE}-00f067aa0ba902b7-01` }).traceId).toBe(
      TRACE,
    );
  });

  it.each([
    ['all-zero trace id', `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`],
    ['wrong version', `01-${TRACE}-00f067aa0ba902b7-01`],
    ['uppercase hex', `00-${TRACE.toUpperCase()}-00f067aa0ba902b7-01`],
    ['truncated', `00-${TRACE}-00f067`],
    ['garbage', 'not-a-traceparent'],
  ])('generates a fresh 32-hex trace id for %s', (_label, value) => {
    const t = parseIdentifiers({ traceparent: value }).traceId;
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(t).not.toBe('0'.repeat(32));
    expect(t).not.toBe(TRACE);
  });

  it('generates different IDs on every call when no headers are present', () => {
    const a = parseIdentifiers({});
    const b = parseIdentifiers({});
    expect(a.requestId).not.toBe(b.requestId);
    expect(a.traceId).not.toBe(b.traceId);
  });
});

describe('identifiersFor', () => {
  it('memoises per request so middleware and logger agree', () => {
    const req = { headers: {} } as IncomingMessage;
    expect(identifiersFor(req)).toBe(identifiersFor(req));
  });

  it('does not share identifiers between requests', () => {
    const a = identifiersFor({ headers: {} } as IncomingMessage);
    const b = identifiersFor({ headers: {} } as IncomingMessage);
    expect(a.requestId).not.toBe(b.requestId);
  });
});
