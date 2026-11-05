import { describe, expect, it } from 'vitest';

describe('테스트 실행기', () => {
  it('jsdom 환경과 jest-dom 확인 함수가 준비되어 있다', () => {
    const element = document.createElement('p');
    element.textContent = '준비됨';
    document.body.append(element);
    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('준비됨');
    element.remove();
  });
});
