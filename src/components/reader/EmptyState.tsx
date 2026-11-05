import Link from 'next/link';

/** 빈 상태 문구와 첫 화면 링크. */
export function EmptyState({
  message,
  showHomeLink = true,
}: {
  message: string;
  showHomeLink?: boolean;
}) {
  return (
    <div className="empty" data-testid="empty-state">
      <p>{message}</p>
      {showHomeLink && (
        <Link href="/" data-testid="empty-state-home-link">
          첫 화면으로
        </Link>
      )}
    </div>
  );
}
