import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': 'warn',
      // A bare `new Date()` follows the viewer's timezone; every date this
      // product shows is a Paris date.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message:
            'Utilisez parisNow(), parisToday() ou nowInstant() de @/lib/date-utils : new Date() suit le fuseau du visiteur.',
        },
      ],
    },
  },
  {
    // The helper itself reads the machine clock, and its tests pin it.
    files: ['src/lib/date-utils.ts', 'src/__tests__/**'],
    rules: { 'no-restricted-syntax': 'off' },
  }
);
