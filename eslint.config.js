// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/drizzle/**',
      '**/*.config.js',
      '**/*.config.ts',
      'packages/web/dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // The pure engine must never import I/O / framework code.
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fastify', message: 'engine must stay pure (no I/O)' },
            { name: 'socket.io', message: 'engine must stay pure (no I/O)' },
            { name: 'better-sqlite3', message: 'engine must stay pure (no I/O)' },
            { name: 'fs', message: 'engine must stay pure (no I/O)' },
            { name: 'node:fs', message: 'engine must stay pure (no I/O)' },
            { name: 'net', message: 'engine must stay pure (no I/O)' },
            { name: 'node:net', message: 'engine must stay pure (no I/O)' },
          ],
        },
      ],
    },
  },
);
