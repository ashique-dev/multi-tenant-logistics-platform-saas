/**
 * Architectural boundaries, enforced in CI (npm run deps:check).
 * Rules are written so Phase 3+ code (modules/<name>/{presentation,application,domain,infrastructure})
 * is already constrained before it exists.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make module extraction impossible.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'Domain code may not import frameworks or drivers. HTTP/DB/broker concerns live outward.',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: {
        path: [
          '^src/infrastructure/',
          '^src/modules/[^/]+/(infrastructure|presentation|application)/',
          '^node_modules/(@nestjs|typeorm|pg|ioredis|redis|kafkajs|amqplib|amqp-connection-manager|bullmq|express)',
        ],
      },
    },
    {
      name: 'application-not-presentation-or-infra',
      severity: 'error',
      comment: 'Application layer depends on domain and ports only, never on adapters or controllers.',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: ['^src/modules/[^/]+/(infrastructure|presentation)/'] },
    },
    {
      name: 'modules-talk-through-public-api',
      severity: 'error',
      comment: 'A module may only import another module via its index.ts facade (or contracts/events).',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'common-not-modules',
      severity: 'error',
      comment: 'Shared kernel cannot depend on feature modules.',
      from: { path: '^src/common/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'infrastructure-not-modules',
      severity: 'error',
      comment: 'Infrastructure implements ports; it must not reach into feature modules.',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/[^/]+/index\\.ts$' },
    },
    {
      name: 'no-test-code-in-src',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '^test/' },
  },
};
