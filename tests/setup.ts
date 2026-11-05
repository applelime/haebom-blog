import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// 화면 테스트(jsdom)에서만 그린 화면을 테스트마다 치웁니다.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
}
