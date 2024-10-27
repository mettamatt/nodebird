// eslint.config.js

import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import js from '@eslint/js';

// Export the configuration array
export default [
  // 1. Define ignore patterns
  {
    ignores: ['eslint.config.js', 'node_modules/', 'dist/', '.env'],
  },

  // 2. Include ESLint recommended configuration
  js.configs.recommended,

  // 3. Include Prettier configuration
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      ...eslintConfigPrettier.rules, // Disable conflicting ESLint rules
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          trailingComma: 'es5',
          tabWidth: 2,
          semi: true,
        },
      ],
    },
  },

  // 4. Define your custom configuration
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
