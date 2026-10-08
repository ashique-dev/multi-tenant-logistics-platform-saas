import { Writable } from 'node:stream';
import pino from 'pino';
import { loadConfig } from '../../../src/config/env.schema.js';
import { buildPinoOptions } from '../../../src/infrastructure/observability/logging.module.js';

function capture(): { logger: pino.Logger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const config = loadConfig({ LOG_LEVEL: 'debug', SERVICE_NAME: 'svc', NODE_ENV: 'production' });
  const logger = pino(buildPinoOptions(config), stream);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('structured logging', () => {
  it('emits the mandatory base fields', () => {
    const { logger, lines } = capture();
    logger.info('hello');
    const [line] = lines();
    expect(line).toMatchObject({
      level: 'info',
      service: 'svc',
      environment: 'production',
      msg: 'hello',
    });
    expect(new Date(line?.['time'] as string).toISOString()).toBe(line?.['time']);
  });

  it.each([
    ['password', { password: 'hunter2' }],
    ['refreshToken', { refreshToken: 'rt-secret' }],
    ['accessToken', { accessToken: 'at-secret' }],
    ['cardNumber', { cardNumber: '4111111111111111' }],
    ['cvv', { cvv: '123' }],
    ['nested password', { body: { password: 'hunter2' } }],
    ['nested token', { user: { token: 'tok-secret' } }],
    ['authorization header', { req: { headers: { authorization: 'Bearer abc.def.ghi' } } }],
    ['cookie header', { req: { headers: { cookie: 'sid=secret' } } }],
  ])('redacts %s', (_label, payload) => {
    const { logger, lines } = capture();
    logger.info(payload, 'event');
    const raw = JSON.stringify(lines());
    for (const secret of [
      'hunter2',
      'rt-secret',
      'at-secret',
      '4111111111111111',
      'tok-secret',
      'abc.def.ghi',
      'sid=secret',
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).toContain('[REDACTED]');
  });

  it('does not redact ordinary fields', () => {
    const { logger, lines } = capture();
    logger.info({ orderId: 'o-1', status: 'PENDING' }, 'order');
    expect(lines()[0]).toMatchObject({ orderId: 'o-1', status: 'PENDING' });
  });
});
