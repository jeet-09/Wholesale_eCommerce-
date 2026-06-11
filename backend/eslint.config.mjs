import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'prisma/migrations/**',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Async discipline (RULES.md §5 / error-handling rule) — mandatory.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // Off: Fastify plugins/handlers are idiomatically `async` even without an
      // inner `await` (the framework awaits their return). The substantive
      // safety rules above still apply.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      // Type safety (RULES.md §4) — no `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',

      // No console in app code — use the injected logger.
      'no-console': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**', 'prisma/seed.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Passing mocked method references to `expect(...)`/`vi.mocked(...)` is the
      // idiomatic testing pattern; the unbound-`this` concern does not apply.
      '@typescript-eslint/unbound-method': 'off',
      'no-console': 'off',
    },
  },
);
