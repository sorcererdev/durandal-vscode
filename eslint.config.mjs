import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', '.vscode-test/**', 'node_modules/**', 'olifant/**'] },
  ...tseslint.configs.recommended,
);
