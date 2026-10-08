import { ConfigValidationError, loadConfig } from '../../../src/config/env.schema.js';

describe('loadConfig', () => {
  it('applies safe defaults for an empty environment', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      opsPort: 9100,
      logLevel: 'info',
      logPretty: false,
      trustProxyHops: 0,
      bodyLimit: '1mb',
      corsOrigins: [],
    });
  });

  it('parses and trims the CORS allow-list', () => {
    const c = loadConfig({ CORS_ORIGINS: ' https://a.example , https://b.example,, ' });
    expect(c.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('enables Swagger by default outside production and disables it in production', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).swaggerEnabled).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
  });

  it('lets SWAGGER_ENABLED override the default in both directions', () => {
    expect(loadConfig({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(
      true,
    );
    expect(loadConfig({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }).swaggerEnabled).toBe(
      false,
    );
  });

  it('coerces numeric strings', () => {
    expect(loadConfig({ PORT: '8080', OPS_PORT: '9200' })).toMatchObject({
      port: 8080,
      opsPort: 9200,
    });
  });

  it.each([
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', 'abc'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['BODY_LIMIT', 'huge'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['LOG_PRETTY', 'yes'],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigValidationError);
  });

  it('reports every problem at once, naming the offending variable', () => {
    try {
      loadConfig({ PORT: 'x', NODE_ENV: 'nope' });
      throw new Error('expected loadConfig to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigValidationError);
      const issues = (e as ConfigValidationError).issues.join('|');
      expect(issues).toContain('PORT');
      expect(issues).toContain('NODE_ENV');
    }
  });

  it('prefers APP_VERSION when provided', () => {
    expect(loadConfig({ APP_VERSION: '9.9.9' }).version).toBe('9.9.9');
  });
});
