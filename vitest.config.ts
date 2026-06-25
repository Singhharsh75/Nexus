import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './tests/helpers/__mocks__/server-only.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/helpers/vitest-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
