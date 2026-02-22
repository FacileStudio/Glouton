const baseConfig = require('./index.js');
const sveltePlugin = require('eslint-plugin-svelte');
const svelteParser = require('svelte-eslint-parser');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  ...baseConfig,
  ...sveltePlugin.configs['flat/recommended'],
  {
    files: ['**