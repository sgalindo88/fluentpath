import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/ui/**/*.test.js'], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false } });
