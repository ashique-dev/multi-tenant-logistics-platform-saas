// Runs before each test file. Quiet logs and a tiny body limit so 413 is cheap to test.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.BODY_LIMIT = '1kb';
process.env.SERVICE_NAME = 'logistics-platform-test';
delete process.env.CORS_ORIGINS;
delete process.env.SWAGGER_ENABLED;
