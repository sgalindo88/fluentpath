import { defineConfig } from 'vitest/config';
// Unit tests only; the browser smoke tests run with `npm run test:ui`.
export default defineConfig({ test: { include: ['tests/*.test.js'] } });
