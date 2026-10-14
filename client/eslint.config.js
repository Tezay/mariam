import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// A bare `new Date()` follows the viewer's timezone; every date this product
// shows is a Paris date.
const viewerClock = {
  selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
  message:
    'Utilisez parisNow(), parisToday() ou nowInstant() de @/lib/date-utils : new Date() suit le fuseau du visiteur.',
};

const handDrawnSpinner = {
  selector:
    "JSXOpeningElement[name.name=/^(div|span)$/] > JSXAttribute[name.name='className'] > Literal[value=/\\banimate-spin\\b/]",
  message:
    "Utilisez Spinner (@/components/ui/spinner), ou PageLoader pour une page entière : un seul indicateur de chargement dans l'application.",
};

export default tseslint.config(
  { ignores: ['build', '.react-router'] },
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
      // lucide-react/dynamic makes the build emit one file per icon of the
      // library, and the service worker precaches every one of them.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react/dynamic',
              message:
                "Importez l'icône depuis lucide-react ; pour une étiquette, utilisez TagIcon (@/components/TagIcon).",
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', viewerClock, handDrawnSpinner],
    },
  },
  {
    // The helper itself reads the machine clock, and its tests pin it.
    files: ['src/lib/date-utils.ts', 'src/__tests__/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // The TV display keeps its own, larger indicator.
    files: ['src/pages/public/tv/**'],
    rules: { 'no-restricted-syntax': ['error', viewerClock] },
  }
);
