/* eslint-disable */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: '18.3' },
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-refresh', 'jsx-a11y'],
  ignorePatterns: [
    'dist',
    'dist-types',
    'node_modules',
    'github-data-repo',
    'data',
    'public/push-handler.js',
    '*.config.js',
    '*.config.ts',
    'cloudflare',
    'supabase',
  ],
  rules: {
    // React / hooks
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/no-unescaped-entities': 'off', // TR metinlerinde ' kullanımı sık
    'react/display-name': 'off',
    'react-hooks/rules-of-hooks': 'error', // hata olmalı — runtime bug riski
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': 'off',

    // TS — brownfield codebase için yumuşatılmış (zamanla sıkılaştırılır)
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-inferrable-types': 'warn',
    '@typescript-eslint/no-namespace': 'warn',
    '@typescript-eslint/no-var-requires': 'warn',
    // ban-types v7'de kaldırıldı; yerini alan v8 kuralları:
    '@typescript-eslint/no-empty-object-type': 'warn',
    '@typescript-eslint/no-unsafe-function-type': 'warn',
    '@typescript-eslint/no-wrapper-object-types': 'warn',

    // A11y — kademe kademe sıkılaştırılacak; ilk fazda hep warn
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/label-has-associated-control': 'warn',
    'jsx-a11y/anchor-is-valid': 'warn',
    'jsx-a11y/alt-text': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    'jsx-a11y/no-autofocus': 'warn',

    // Genel
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-prototype-builtins': 'warn',
    'no-case-declarations': 'warn',
    'no-useless-escape': 'warn',
    'prefer-const': 'warn',
    'no-async-promise-executor': 'warn',
  },
  overrides: [
    {
      // Cloudflare Pages Functions — Node/Worker env, React rule'ları kapalı
      files: ['functions/**/*.ts'],
      rules: {
        'react/no-unescaped-entities': 'off',
      },
    },
    {
      // Test dosyaları
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      env: { node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
