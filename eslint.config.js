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
  {
    // Real-time combat sim: same purity as the engine, plus integer-only math for cross-engine bit-exact
    // replays (transcendental Math functions are implementation-approximated in ECMA-262).
    files: ['packages/combat/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Combat sim must be deterministic.' },
        { name: 'performance', message: 'Combat sim must be deterministic.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in CombatState.' },
        ...['sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'exp', 'log', 'pow', 'sqrt', 'hypot', 'cbrt'].map(
          (property) => ({ object: 'Math', property, message: 'Use the integer helpers in combat/src/math.ts.' }),
        ),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: 'Use integer multiplication.' },
        { selector: "AssignmentExpression[operator='**=']", message: 'Use integer multiplication.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', 'fs', 'path', 'crypto'] }, { group: ['@dragon-rush/*', '!@dragon-rush/engine'] }] },
      ],
    },
  },
);
