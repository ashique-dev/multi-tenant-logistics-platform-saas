const base = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json', diagnostics: { ignoreCodes: [151002] } }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};

export default {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.spec.ts'] },
    { ...base, displayName: 'e2e', testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'], testTimeout: 30000 },
  ],
};
