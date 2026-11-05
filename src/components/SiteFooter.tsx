import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="page site-footer">
      <span className="wordmark">{SITE_NAME}</span>
      <nav aria-label="사이트 정보">
        <Link href="/posts" data-testid="footer-all-posts-link">
          글 전체
        </Link>
      </nav>
    </footer>
  );
}
