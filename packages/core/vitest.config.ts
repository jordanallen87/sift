import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'core',
    root: packageRoot,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
