import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'python/**', 'coverage/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'Date', message: 'Engine must be deterministic.' }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in GameState.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'fs', 'path', 'crypto', '@dragon-rush/*'] },
      ],
    },
  },
);
