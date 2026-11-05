import Link from 'next/link';
import { NOT_FOUND_MESSAGE } from '@/lib/messages';

/** 없는 글, 비공개 글, 임시 저장 글, 다른 기기의 글쓰기 화면 주소(FR5.3, FR5.4). */
export function NotFoundView() {
  return (
    <section className="page not-found" aria-label="찾을 수 없음">
      <h1>{NOT_FOUND_MESSAGE}</h1>
      <Link href="/" data-testid="not-found-home-link">
        첫 화면으로
      </Link>
    </section>
  );
}
