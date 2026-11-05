import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // 화면 테스트의 기본 환경은 jsdom입니다.
    // 데이터베이스, 사진 처리, 서버 경로 테스트는 파일 첫 줄의 `@vitest-environment node`로 Node 환경에서 돕니다.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // `npm run test:coverage`에서만 잽니다. 팀 규칙에 하한이 없어서 수치가 낮아도 실패하지 않습니다(thresholds 없음).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server.ts'],
      exclude: ['src/types/**'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
