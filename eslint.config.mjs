import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.*', '.dependency-cruiser.cjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // NOTE: consistent-type-imports is intentionally NOT enabled. With
      // emitDecoratorMetadata, `import type` on an injected class erases the DI token.
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='console']", message: 'Use the injected Logger, not console.' },
      ],
    },
  },
  {
    files: ['test/**/*.ts', 'src/entrypoints/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
